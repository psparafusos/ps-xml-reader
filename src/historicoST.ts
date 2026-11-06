// Ferramenta "ST, MVA e CFOP": sugestão pelo histórico. Conta as decisões
// lembradas (decisoes.json) de qualquer fornecedor e produto com o mesmo NCM
// de 8 dígitos; sem modelo, só contagem. E a comparação da MVA que o
// fornecedor usou (pMVAST) com a da planilha. Lógica pura, sem DOM.

import type { AnaliseItem } from './fiscal/analise';
import {
  decisaoAplicavel,
  ROTULO_LUBRIFICANTE,
  textoMva,
  type DecisaoLembrada,
  type EscolhaST,
} from './fiscal/entrada';
import { formatarNcm } from './explicacaoST';

/** A partir de quantas decisões no NCM o histórico conta. */
export const HISTORICO_MINIMO = 2;
/** Fração das decisões que precisa ser a mesma escolha para sugerir. */
export const HISTORICO_LIMIAR = 0.8;

/**
 * Chave de "mesma escolha": mesma linha, mesmo grupo do Apêndice XIV
 * (derivado ou não derivado de petróleo), Sem ST ou mesmo CFOP manual.
 */
export function chaveEscolha(e: EscolhaST): string {
  switch (e.tipo) {
    case 'candidato':
      return `linha|${e.segmento}|${e.linhaPlanilha}`;
    case 'apendice-xiv':
      return `apendice|${e.lubrificante}`;
    case 'sem-st':
      return 'sem-st';
    case 'manual':
      return `manual|${e.cfop}`;
  }
}

/** Nome curto da escolha, para o texto da caixa. */
export function rotuloEscolha(e: EscolhaST): string {
  switch (e.tipo) {
    case 'candidato':
      return `${e.segmento}, CEST ${e.cest} (linha ${e.linhaPlanilha})`;
    case 'apendice-xiv':
      return `Apêndice XIV, ${ROTULO_LUBRIFICANTE[e.lubrificante]}`;
    case 'sem-st':
      return 'Sem ST';
    case 'manual':
      return `CFOP ${e.cfop}`;
  }
}

export type SugestaoHistorico =
  | {
      tipo: 'sugere';
      escolha: EscolhaST;
      vezes: number;
      total: number;
      ncm: string;
      /** Até 3 descrições dos itens em que a escolha foi feita. */
      descricoes: string[];
      texto: string;
    }
  | {
      tipo: 'dividido';
      grupos: { rotulo: string; vezes: number }[];
      texto: string;
    };

/**
 * Sugestão pelo histórico para um item sem decisão própria. `chaveItem`
 * (raiz do CNPJ + "|" + código) fica de fora da contagem; se ele já tem
 * decisão com escolha que serve, nada a sugerir. Só conta decisão
 * com escolha no mesmo NCM de 8 dígitos. Com 2 ou mais e 80% ou mais na
 * mesma escolha: sugere (se a escolha serve para este item); abaixo de 80%:
 * "dividido". Menos de 2: nada.
 */
export function sugestaoHistorico(
  a: AnaliseItem,
  historico: readonly DecisaoLembrada[],
  chaveItem: string,
): SugestaoHistorico | null {
  if (!/^\d{8}$/.test(a.ncm)) return null;
  // Decisão própria do item (com escolha que ainda serve) tem prioridade.
  const propria = historico.find(
    (d) => `${d.raizCnpj}|${d.cProd.trim()}` === chaveItem,
  );
  if (propria?.escolha && decisaoAplicavel(a, propria)) return null;
  const grupos = new Map<
    string,
    { escolha: EscolhaST; decisoes: DecisaoLembrada[] }
  >();
  let total = 0;
  for (const d of historico) {
    if (d.ncm !== a.ncm || d.escolha === null) continue;
    if (`${d.raizCnpj}|${d.cProd.trim()}` === chaveItem) continue;
    total++;
    const k = chaveEscolha(d.escolha);
    const g = grupos.get(k);
    if (g) g.decisoes.push(d);
    else grupos.set(k, { escolha: d.escolha, decisoes: [d] });
  }
  if (total < HISTORICO_MINIMO) return null;
  const ordem = [...grupos.values()].sort(
    (x, y) => y.decisoes.length - x.decisoes.length,
  );
  const maior = ordem[0];
  if (maior.decisoes.length / total >= HISTORICO_LIMIAR) {
    // A linha pode ter saído da planilha: aí não há o que sugerir.
    if (!decisaoAplicavel(a, { ncm: a.ncm, escolha: maior.escolha }))
      return null;
    const descricoes = [
      ...new Set(maior.decisoes.map((d) => d.xProd.trim()).filter(Boolean)),
    ].slice(0, 3);
    const vezes = maior.decisoes.length;
    return {
      tipo: 'sugere',
      escolha: maior.escolha,
      vezes,
      total,
      ncm: a.ncm,
      descricoes,
      texto:
        `Pelo histórico: ${rotuloEscolha(maior.escolha)}. Você escolheu isso em ${vezes} de ${total} itens com o NCM ${formatarNcm(a.ncm)}` +
        (descricoes.length ? ` (${descricoes.join('; ')}).` : '.'),
    };
  }
  const lista = ordem.map((g) => ({
    rotulo: rotuloEscolha(g.escolha),
    vezes: g.decisoes.length,
  }));
  return {
    tipo: 'dividido',
    grupos: lista,
    texto: `Histórico dividido: ${lista.map((g) => `${g.rotulo} ${g.vezes}x`).join(', ')}`,
  };
}

// ---------- MVA do fornecedor ----------

/** Diferença acima disso (em pontos percentuais) vira observação. */
const TOLERANCIA_MVA = 0.01;

/**
 * Compara a MVA que o fornecedor usou na retenção (pMVAST, em %) com a da
 * planilha (`mvaPlanilha`, em fração). Devolve a observação quando a
 * diferença passa de 0,01 ponto percentual; igual, sem pMVAST ou sem MVA da
 * planilha: null. Não muda ST nem CFOP.
 */
export function observacaoMvaFornecedor(
  pMVAST: string | undefined,
  mvaPlanilha: number | null,
): string | null {
  const t = (pMVAST ?? '').trim().replace(',', '.');
  if (!t || mvaPlanilha === null) return null;
  const fornecedor = Number(t);
  if (!Number.isFinite(fornecedor)) return null;
  const planilha = mvaPlanilha * 100;
  if (Math.abs(fornecedor - planilha) <= TOLERANCIA_MVA + 1e-9) return null;
  const texto = fornecedor.toLocaleString('pt-BR', {
    maximumFractionDigits: 4,
  });
  return `MVA do fornecedor ${texto}% difere da planilha ${textoMva(mvaPlanilha)}: conferir`;
}
