// Ferramenta "ST, MVA e CFOP": sugestão pelo histórico. Conta as decisões
// lembradas (decisoes.json) de qualquer fornecedor e produto com o mesmo NCM
// de 8 dígitos; sem modelo, só contagem. E a comparação da MVA que o
// fornecedor usou (pMVAST) com a da planilha. Lógica pura, sem DOM.

import type { AnaliseItem } from './fiscal/analise';
import {
  decisaoAplicavel,
  finalidadeLembravel,
  ROTULO_LUBRIFICANTE,
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
 * com escolha no mesmo NCM de 8 dígitos (a da devolução de cliente, não). Com 2 ou mais e 80% ou mais na
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
    // Devolução de cliente não é lembrada; se aparecer, não conta.
    if (!finalidadeLembravel(d.finalidade)) continue;
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

/**
 * Aviso de um item da ferramenta: "aviso" (leve, amarelo) ou "alerta"
 * (forte, vermelho). Só informa: não muda ST, MVA nem CFOP.
 */
export interface AvisoItem {
  nivel: 'aviso' | 'alerta';
  texto: string;
}

const duasCasas = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct2 = (n: number) =>
  `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * Compara a MVA que o fornecedor usou na retenção (pMVAST, em %) com a da
 * planilha na coluna da alíquota esperada (`mvaPlanilha`, em fração), as
 * duas arredondadas para 2 casas. Menor: aviso (lance com a da planilha).
 * Maior: alerta (fale com o contador antes de lançar). Igual, sem pMVAST
 * ou sem MVA da planilha: null.
 */
export function avisoMvaFornecedor(
  pMVAST: string | undefined,
  mvaPlanilha: number | null,
): AvisoItem | null {
  const t = (pMVAST ?? '').trim().replace(',', '.');
  if (!t || mvaPlanilha === null) return null;
  const lido = Number(t);
  if (!Number.isFinite(lido)) return null;
  const fornecedor = duasCasas(lido);
  const planilha = duasCasas(mvaPlanilha * 100);
  if (fornecedor === planilha) return null;
  const contra = `(${pct2(fornecedor)} contra ${pct2(planilha)})`;
  return fornecedor < planilha
    ? {
        nivel: 'aviso',
        texto: `O fornecedor reteve com MVA menor que a da planilha ${contra}. Lance com a MVA da planilha; a diferença é complementada na apuração. Avise o fornecedor para acertar as próximas notas.`,
      }
    : {
        nivel: 'alerta',
        texto: `O fornecedor reteve com MVA maior que a da planilha ${contra}. Fale com o contador antes de lançar: a orientação é recusar ou devolver a mercadoria e pedir uma nota nova.`,
      };
}
