// Prévia da ferramenta "ST, MVA e CFOP" com os campos que o motor fiscal
// (src/fiscal/analise.ts) devolve: o rótulo da MVA (em Autopeças, sempre a
// MVA-ST 1, porque a loja não tem índice de fidelização), a alíquota interna
// da linha da planilha, as observações (protocolo com SE e pendências que só
// informam) e o motivo "segmento X lido com problemas". Fica por cima de
// resolverItem (src/fiscal/entrada.ts), sem mudar o motor. Lógica pura, sem
// DOM.

import type {
  AliquotaInternaItem,
  AnaliseItem,
  CandidatoAnalise,
} from './fiscal/analise';
import { avisoMvaFornecedor, type AvisoItem } from './historicoST';
import {
  decisaoAplicavel,
  FINALIDADE_PADRAO,
  finalidadeInicial,
  finalidadeLembravel,
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
  if (!finalidadeLembravel(l.finalidade)) return null;
  return {
    escolha: l.escolha,
    finalidade: l.finalidade,
    ...(l.motivo ? { motivo: l.motivo } : {}),
  };
}

/**
 * Decisão com que o item abre na ferramenta. Na nota de devolução (finNFe
 * 4), todos os itens em "Devolução de cliente", sem decisão lembrada (o
 * emitente é o cliente). Nas outras, a lembrada que ainda serve ou o
 * automático na finalidade padrão. `lembrada`: veio do arquivo.
 */
export function decisaoInicial(
  finNFe: string | undefined,
  a: AnaliseItem,
  lembrada: DecisaoLembradaST | null,
): { decisao: DecisaoST; lembrada: boolean } {
  const finalidade = finalidadeInicial(finNFe);
  if (
    finalidade === FINALIDADE_PADRAO &&
    lembrada &&
    decisaoAplicavel(a, lembrada)
  ) {
    const d = decisaoDaLembrada(lembrada);
    if (d) return { decisao: d, lembrada: true };
  }
  return { decisao: { escolha: null, finalidade }, lembrada: false };
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
  /**
   * Avisos do item (alíquota de ICMS diferente da esperada; a ferramenta
   * junta o da MVA retida). Só informam: não mudam ST, MVA nem CFOP.
   */
  avisos: AvisoItem[];
  /**
   * De onde veio a coluna de MVA quando não foi da nota (Simples Nacional):
   * "coluna de 12%, pela origem e pelo estado do fornecedor". null: da nota.
   */
  colunaMvaTexto: string | null;
}

/** Pendências do motor que só informam (não decidem ST, MVA nem CFOP). */
const RE_INFORMATIVA = [/^alíquota interna/, /^fornecedor tratou como ST/];
const RE_ALIQUOTA = /^alíquota interna/;
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
  // A alíquota interna só vale com ST: sem ST ou a confirmar, a pendência
  // dela não aparece.
  const observacoes = [
    ...a.observacoes,
    ...pendencias.filter(
      (p) =>
        RE_INFORMATIVA.some((re) => re.test(p)) &&
        (r.st === 'sim' || !RE_ALIQUOTA.test(p)),
    ),
  ];
  const segmentoProblema = pendencias.find((p) => RE_SEGMENTO.test(p)) ?? null;

  const mvaPendente =
    r.st === 'sim' && r.finalidade === 'revenda' && mva === null && !r.manual;
  const avisos: AvisoItem[] = a.avisoAliquota
    ? [{ nivel: 'aviso', texto: a.avisoAliquota }]
    : [];
  const colunaMvaTexto =
    r.st === 'sim' &&
    r.finalidade === 'revenda' &&
    r.candidato &&
    !r.candidato.lubrificante &&
    !r.manual &&
    mva !== null
      ? (a.textoColunaMva ?? null)
      : null;
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
    avisos,
    colunaMvaTexto,
    precisaDeMim: r.st === 'confirmar' || r.cfop === null || mvaPendente,
  };
}

/**
 * MVA da planilha na coluna da alíquota esperada, para comparar com a que
 * o fornecedor reteve. Na linha de Autopeças, a MVA-ST 1; numa linha com um
 * jogo só, ele; com vários jogos, null (a MVA está em dúvida). Apêndice XIV:
 * a da coluna do apêndice. Sem coluna esperada: null.
 */
export function mvaColunaEsperada(c: CandidatoAnalise): number | null {
  if (c.lubrificante) return c.mvas[0]?.valor ?? null;
  const jogos = c.mvasEsperada;
  if (!jogos || jogos.length === 0) return null;
  const autopecas = jogosAutopecas({ ...c, mvas: jogos });
  if (autopecas) return autopecas.padrao.valor;
  return jogos.length === 1 ? jogos[0].valor : null;
}

/**
 * Aviso da MVA retida contra a planilha, só com a linha certa: ST "Sim"
 * (decidida pelo app ou confirmada pela pessoa), revenda, linha da
 * planilha (não o CFOP manual). Com o app em "confirmar", nada: o aviso só
 * vale depois que a pessoa confirmar a linha.
 */
export function mvaParaComparar(p: LinhaPrevia): number | null {
  if (p.st !== 'sim' || p.manual || p.finalidade !== 'revenda') return null;
  return p.candidato ? mvaColunaEsperada(p.candidato) : null;
}

/**
 * A prévia do item com o aviso da MVA retida (pMVAST da nota) contra a da
 * planilha na coluna esperada, como a ferramenta mostra.
 */
export function previaComMvaRetida(
  a: AnaliseItem,
  ufEmitente: string,
  decisao: DecisaoST,
  lembrado: boolean,
  pMVAST: string | undefined,
): LinhaPrevia {
  const r = previaItem(a, ufEmitente, decisao, lembrado);
  const aviso = avisoMvaFornecedor(pMVAST, mvaParaComparar(r));
  return aviso ? { ...r, avisos: [...r.avisos, aviso] } : r;
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

// ---------- decisão do app x decisão da pessoa ----------

/** O que o app decide sozinho para o item, na finalidade dada (sem escolha). */
export function decisaoDoApp(
  a: AnaliseItem,
  ufEmitente: string,
  finalidade: DecisaoST['finalidade'],
): LinhaPrevia {
  return previaItem(a, ufEmitente, { escolha: null, finalidade });
}

const ROTULO_ST_APP: Record<LinhaPrevia['st'], string> = {
  sim: 'Sim',
  nao: 'Não',
  confirmar: 'Confirmar',
};

/**
 * Resumo curto da decisão do app: "Sim, CFOP 2403, MVA 48,5%", "Não, CFOP
 * 2102", "Confirmar (o app não decidiu sozinho)".
 */
export function textoDecisaoApp(p: LinhaPrevia): string {
  if (p.st === 'confirmar') return 'Confirmar (o app não decidiu sozinho)';
  return [
    ROTULO_ST_APP[p.st],
    p.cfop ? `CFOP ${p.cfop}` : null,
    p.st === 'sim' && p.mva !== null ? `MVA ${textoMva(p.mva)}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * A pessoa mudou o que o app tinha decidido sozinho: o app disse Sim ou Não
 * e a decisão em uso dá outra ST ou outro CFOP. Com o app em "Confirmar",
 * a escolha é a confirmação pedida, não uma mudança.
 */
export function pessoaMudouOApp(app: LinhaPrevia, atual: LinhaPrevia): boolean {
  return (
    app.st !== 'confirmar' && (app.st !== atual.st || app.cfop !== atual.cfop)
  );
}
