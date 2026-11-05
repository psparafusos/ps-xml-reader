// Prévia da ferramenta "ST, MVA e CFOP" com os campos que o motor fiscal
// (src/fiscal/analise.ts) devolve: o rótulo da MVA (em Autopeças, sempre a
// MVA-ST 1, porque a loja não tem índice de fidelização), a alíquota interna
// da linha da planilha, as observações (protocolo com SE e pendências que só
// informam) e o motivo "segmento X lido com problemas". Fica por cima de
// resolverItem (src/fiscal/entrada.ts), sem mudar o motor. Lógica pura, sem
// DOM.

import type { AliquotaInternaItem, AnaliseItem } from './fiscal/analise';
import {
  FINALIDADE_PADRAO,
  jogosAutopecas,
  resolverItem,
  textoMva,
  type Decisao,
  type DecisaoLembrada,
  type ItemResolvido,
  type Gravacao,
} from './fiscal/entrada';

/** Decisão da prévia (a MVA não se escolhe: a da regra geral). */
export type DecisaoST = Decisao;

/**
 * Decisão lembrada como está no arquivo. As antigas podem trazer mvaJogo
 * ("MVA-ST 2"), da época em que a tela deixava trocar: não vale mais.
 */
export type DecisaoLembradaST = DecisaoLembrada & { mvaJogo?: string | null };

/** Motivo acrescentado quando a linha tem MVA-ST 1 e MVA-ST 2 (fidelização). */
export const MOTIVO_SEM_FIDELIZACAO =
  'MVA-ST 1 (regra geral; a loja não tem índice de fidelização)';

/**
 * Decisão de uma lembrada, sem o jogo de MVA. A que só guardava a MVA-ST 2
 * (sem escolha de linha e na finalidade padrão) não tem mais o que lembrar:
 * volta null, e o item fica no automático.
 */
export function decisaoDaLembrada(l: DecisaoLembradaST): DecisaoST | null {
  if (l.escolha === null && l.finalidade === FINALIDADE_PADRAO) return null;
  return { escolha: l.escolha, finalidade: l.finalidade };
}

export interface LinhaPrevia extends ItemResolvido {
  /** Rótulo do jogo de onde veio a MVA ("MVA-ST 1"). */
  mvaRotulo: string | null;
  /** Alíquota interna da linha em uso. */
  aliquotaInterna: AliquotaInternaItem | null;
  /** Texto da coluna "Alíq. interna": o da planilha, "confirmar" ou "-". */
  aliquotaTexto: string;
  /** Sem alíquota interna numa linha com ST: "confirmar" em destaque leve. */
  aliquotaConfirmar: boolean;
  /** Observações do motor e pendências que só informam. Nunca mudam o CFOP. */
  observacoes: string[];
  /** "segmento X lido com problemas", mostrado com a cor do "confirmar". */
  segmentoProblema: string | null;
}

/** Pendências do motor que só informam (não decidem ST, MVA nem CFOP). */
const RE_INFORMATIVA = [
  /^alíquota interna/,
  /^origem \S+ \(importado\)/,
  /^fornecedor tratou como ST/,
];
const RE_SEGMENTO = /^segmento .+ lido com problemas$/;
const RE_TIPI = /TIPI/;

export function previaItem(
  a: AnaliseItem,
  ufEmitente: string,
  decisao: DecisaoST,
  lembrado = false,
): LinhaPrevia {
  const r = resolverItem(a, ufEmitente, decisao, lembrado);
  let { mva, mvaTexto, motivo } = r;
  let mvaRotulo: string | null = null;

  if (
    r.st === 'sim' &&
    r.finalidade === 'revenda' &&
    r.candidato &&
    !r.manual
  ) {
    // Autopeças (MVA-ST 1 e MVA-ST 2): vale sempre a MVA-ST 1, na linha do
    // motor ou na escolhida pela pessoa. A MVA-ST 2 não aparece como opção.
    const autopecas =
      a.colunaMva !== null && !r.candidato.lubrificante
        ? jogosAutopecas(r.candidato)
        : null;
    if (autopecas) {
      mva = autopecas.padrao.valor;
      mvaRotulo = autopecas.padrao.rotulo;
      mvaTexto =
        mva === null
          ? `confirmar (linha sem MVA na coluna ${a.colunaMva}%)`
          : textoMva(mva);
      motivo = `${motivo}; ${MOTIVO_SEM_FIDELIZACAO}`;
    } else if (r.mva !== null) {
      mvaRotulo = r.candidato.mvas[0]?.rotulo ?? null;
    }
  }

  const aliquotaInterna =
    r.st === 'sim' ? (r.candidato?.aliquotaInterna ?? null) : null;
  // CFOP manual: não há linha da planilha, então não há alíquota a conferir.
  const aliquotaConfirmar =
    r.st === 'sim' &&
    !r.manual &&
    (aliquotaInterna === null || aliquotaInterna.aliquota === null);

  const pendencias = a.pendencias.filter((p) => !RE_TIPI.test(p));
  const observacoes = [
    ...a.observacoes,
    ...pendencias.filter((p) => RE_INFORMATIVA.some((re) => re.test(p))),
  ];
  const segmentoProblema = pendencias.find((p) => RE_SEGMENTO.test(p)) ?? null;

  const mvaPendente =
    r.st === 'sim' && r.finalidade === 'revenda' && mva === null && !r.manual;
  return {
    ...r,
    mva,
    mvaTexto,
    motivo,
    mvaRotulo,
    aliquotaInterna,
    aliquotaTexto:
      r.st !== 'sim' || r.manual
        ? '-'
        : aliquotaInterna?.texto
          ? aliquotaInterna.texto
          : 'confirmar',
    aliquotaConfirmar,
    observacoes,
    segmentoProblema,
    precisaDeMim: r.st === 'confirmar' || r.cfop === null || mvaPendente,
  };
}

/**
 * Aplicar, parte da alíquota interna: o texto da planilha na coluna
 * escolhida, para os itens com CFOP definido e alíquota da linha. Célula que
 * já tem o mesmo texto fica de fora; as outras entram com o valor atual
 * (executarPlano pergunta antes de substituir).
 */
export function gravacoesAliquota(
  linhas: LinhaPrevia[],
  anotacoes: Map<string, Map<string, string>>,
  coluna: string,
): Gravacao[] {
  const r: Gravacao[] = [];
  for (const l of linhas) {
    const valor = l.aliquotaInterna?.texto.trim();
    if (l.cfop === null || l.st !== 'sim' || !valor) continue;
    const atual = anotacoes.get(coluna)?.get(l.nItem) ?? '';
    if (atual.trim() !== valor)
      r.push({ coluna, nItem: l.nItem, valor, atual });
  }
  return r;
}

/**
 * Base gravada antes de a importação ler as colunas de estados (protocolos):
 * nenhuma linha tem o campo. Pede reimportar a planilha.
 */
export function baseSemProtocolos(linhas: readonly object[]): boolean {
  return linhas.length > 0 && !linhas.some((l) => 'protocolos' in l);
}
