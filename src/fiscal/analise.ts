// Análise fiscal por item da nota de entrada, para revenda em Sergipe.
// Lógica pura: recebe o item, a UF do fornecedor e as bases já carregadas
// (planilha de ST de Sergipe e TIPI) e diz se há ST, qual MVA e qual CFOP de
// entrada usar, com o porquê. Quando a planilha não basta para decidir, o
// resultado é "confirmar": a máquina lista o que achou e uma pessoa escolhe.
//
// Regras (confirmadas pela contabilidade):
// - Quem decide a ST é a planilha de Sergipe. NCM fora dela = sem ST. O CEST
//   da nota não prova ST, só ajuda a escolher a linha.
// - O NCM da planilha vale pelo prefixo (4 dígitos podem bastar).
// - A coluna de MVA é a alíquota de ICMS que veio na nota.
// - Origem (orig): 1, 2, 3 e 8 = importado (4%); 0, 4, 5, 6 e 7 = nacional.
// - Com ST: CFOP 1403 (fornecedor de SE) ou 2403 (de fora), mesmo sem
//   retenção pelo fornecedor. Sem ST: 1102 ou 2102.

import type { Item } from '../nfe/tipos';
import {
  buscarST,
  type AliquotaMva,
  type CandidatoST,
  type LinhaST,
  type TabelaST,
} from './st';
import { consultarTipi, type AliquotaIpi, type TabelaTipi } from './tipi';

/** Campos do item que a análise usa. Texto como no XML; vazio = ausente. */
export interface ItemFiscal {
  nItem?: string;
  xProd?: string;
  NCM: string;
  CEST?: string;
  orig?: string;
  /** CST do ICMS ou CSOSN. */
  CST?: string;
  CSOSN?: string;
  pICMS?: string;
  /** CFOP que o fornecedor usou na saída. */
  CFOP?: string;
  cstIPI?: string;
  pIPI?: string;
}

export interface BaseAnalise {
  st: TabelaST | LinhaST[];
  /** Sem TIPI, a parte de IPI fica em branco (existe = null). */
  tipi?: TabelaTipi | null;
}

export type StSergipe = 'sim' | 'nao' | 'confirmar';
export type TipoOrigem = 'importado' | 'nacional';

export interface MvaJogo {
  /** Rótulo do jogo na planilha ("MVA-ST", "MVA-ST 1", "MVA Estado não signatário"). */
  rotulo: string;
  /** MVA em fração na coluna da alíquota da nota; null se a coluna não é conhecida ou a célula está vazia. */
  valor: number | null;
}

export interface CandidatoAnalise {
  segmento: string;
  segmentoOficial: string;
  cest: string;
  /** NCM como está na planilha (prefixo, 4 a 8 dígitos). */
  ncmPlanilha: string;
  descricao: string;
  /** Quantos dígitos do NCM bateram. */
  digitos: number;
  /** CEST da nota igual ao da linha; null quando a nota não tem CEST. */
  cestConfere: boolean | null;
  /** Todos os jogos de MVA da linha, na coluna da alíquota da nota. */
  mvas: MvaJogo[];
  linhaPlanilha: number;
}

export interface AnaliseTipi {
  /** null quando a base da TIPI não foi carregada. */
  existe: boolean | null;
  descricao: string | null;
  descricaoCompleta: string | null;
  aliquotaTipi: AliquotaIpi | null;
  /** pIPI da nota em percentual; null quando a nota não traz. */
  aliquotaNota: number | null;
  /** true quando a nota bate com a TIPI; null quando não há o que comparar. */
  confere: boolean | null;
  /** Texto da diferença, quando há. É informação, não erro. */
  aviso: string | null;
}

export interface AnaliseItem {
  nItem: string;
  ncm: string;
  stSergipe: StSergipe;
  candidatos: CandidatoAnalise[];
  /** Segmento da planilha, quando todos os candidatos são do mesmo. */
  segmento: string | null;
  /** CEST da linha escolhida (só com um candidato). */
  cest: string | null;
  cestNota: string | null;
  origem: { codigo: string; tipo: TipoOrigem | null };
  /** Coluna de MVA = alíquota de ICMS da nota, quando é 4, 7 ou 12. */
  colunaMva: AliquotaMva | null;
  /** MVA em fração, só quando há uma linha e um jogo de MVA. */
  mva: number | null;
  /** CFOP de entrada para revenda; null quando depende de confirmação. */
  cfopSugerido: string | null;
  motivos: string[];
  pendencias: string[];
  tipi: AnaliseTipi;
}

const ORIGEM_IMPORTADO = new Set(['1', '2', '3', '8']);
const ORIGEM_NACIONAL = new Set(['0', '4', '5', '6', '7']);
const COLUNAS_INTERESTADUAIS: AliquotaMva[] = ['4', '7', '12'];
/** CFOPs de saída com ST (retenção ou ST já recolhida). */
const CFOP_SAIDA_ST = new Set([
  '5401',
  '5402',
  '5403',
  '5405',
  '6401',
  '6402',
  '6403',
  '6404',
]);
/** CST e CSOSN que indicam ST no item. */
const CST_COM_ST = new Set([
  '10',
  '30',
  '60',
  '70',
  '201',
  '202',
  '203',
  '500',
]);
/**
 * Descrição que restringe o NCM: com prefixo curto, só parte dos produtos do
 * NCM entra na linha.
 */
const RE_RESTRICAO =
  /\b(exceto|exclusivamente|somente|apenas|destinad[oa]s?|pr[óo]prios? para|para uso|de uso|utilizad[oa]s?|do tipo|para ve[íi]culos|automotiv|em embalage|acondicionad|de capacidade|com capacidade|inferior|superior|n[ãa]o superior|at[ée] \d)/i;

export function analisarItem(
  item: ItemFiscal,
  ufEmitente: string,
  base: BaseAnalise,
): AnaliseItem {
  const motivos: string[] = [];
  const pendencias: string[] = [];
  const ncm = item.NCM.replace(/\D/g, '');
  const cestNota = formatarCest(item.CEST);
  const uf = ufEmitente.trim().toUpperCase();
  const deSergipe = uf === 'SE';
  const origem = lerOrigem(item.orig, pendencias);
  const aliquota = numero(item.pICMS);
  const colunaMva = colunaDaAliquota(aliquota);
  const tipi = analisarTipi(ncm, item, base.tipi ?? null);

  if (!uf) pendencias.push('UF do fornecedor ausente: CFOP não sugerido');
  if (
    origem.tipo === 'importado' &&
    !deSergipe &&
    uf &&
    aliquota !== null &&
    aliquota !== 4
  ) {
    pendencias.push(
      `origem ${origem.codigo} (importado) pede 4% interestadual; a nota veio com ${fmt(aliquota)}%`,
    );
  }
  if (tipi.existe === false) pendencias.push('NCM não existe na TIPI');
  if (tipi.aviso) pendencias.push(tipi.aviso);

  const resultado = (
    stSergipe: StSergipe,
    candidatos: CandidatoAnalise[],
    extra: Partial<AnaliseItem> = {},
  ): AnaliseItem => ({
    nItem: item.nItem ?? '',
    ncm,
    stSergipe,
    candidatos,
    segmento: null,
    cest: null,
    cestNota,
    origem,
    colunaMva,
    mva: null,
    cfopSugerido: null,
    motivos,
    pendencias,
    tipi,
    ...extra,
  });

  if (ncm.length !== 8) {
    pendencias.push(`NCM "${item.NCM}" não tem 8 dígitos`);
    return resultado('confirmar', []);
  }

  const busca = buscarST(base.st, ncm, cestNota ?? undefined);
  const candidatos = busca.candidatos.map((c) => candidato(c, colunaMva));
  const indicioST = indicioDeST(item);

  if (candidatos.length === 0) {
    motivos.push('NCM fora da planilha de ST de Sergipe: sem ST');
    if (indicioST) {
      pendencias.push(
        `fornecedor tratou como ST (${indicioST}), mas o NCM não está na planilha de Sergipe`,
      );
    }
    return resultado('nao', [], {
      cfopSugerido: cfop(uf, false),
    });
  }

  // Dúvidas sobre haver ST (qual linha vale) e sobre a MVA (qual número).
  let duvidaST = false;
  let duvidaMva = false;
  const segmentos = [...new Set(candidatos.map((c) => c.segmento))];

  if (candidatos.length > 1) {
    duvidaST = true;
    motivos.push(
      `${candidatos.length} linhas da planilha servem para o NCM: escolher uma`,
    );
    const pelaNota = candidatos.filter((c) => c.cestConfere);
    if (pelaNota.length === 1) {
      motivos.push(
        `o CEST da nota (${cestNota}) aponta para a linha ${pelaNota[0].linhaPlanilha} de ${pelaNota[0].segmento}`,
      );
    }
  } else {
    motivos.push(
      `NCM na planilha de ST de Sergipe: ${candidatos[0].segmento}, CEST ${candidatos[0].cest}`,
    );
  }

  for (const c of candidatos) {
    if (c.digitos < 8) {
      if (RE_RESTRICAO.test(c.descricao)) {
        duvidaST = true;
        pendencias.push(
          `linha ${c.linhaPlanilha} casa só pelo prefixo ${c.ncmPlanilha} e a descrição restringe: "${c.descricao}"`,
        );
      } else {
        motivos.push(
          `linha ${c.linhaPlanilha} casa pelo prefixo ${c.ncmPlanilha} (${c.digitos} dígitos)`,
        );
      }
    }
    if (c.ncmPlanilha.length >= 6 && c.ncmPlanilha.endsWith('90')) {
      motivos.push(`NCM ${c.ncmPlanilha} da planilha é "outros" (final 90)`);
    }
  }

  if (cestNota === null) {
    motivos.push(
      `nota sem CEST: avaliado pelo segmento (${segmentos.join(', ')})`,
    );
  } else if (!candidatos.some((c) => c.cestConfere)) {
    duvidaST = true;
    pendencias.push(
      `CEST da nota (${cestNota}) não bate com a planilha (${candidatos.map((c) => c.cest).join(', ')})`,
    );
  }

  if (colunaMva === null) {
    duvidaMva = true;
    pendencias.push(
      aliquota === null
        ? 'nota sem alíquota de ICMS: coluna de MVA não definida'
        : `alíquota de ICMS da nota (${fmt(aliquota)}%) não é 4, 7 ou 12: coluna de MVA não definida`,
    );
  } else {
    motivos.push(`coluna de MVA ${colunaMva}% (alíquota de ICMS da nota)`);
  }

  for (const c of candidatos) {
    if (c.mvas.length > 1) {
      duvidaMva = true;
      pendencias.push(
        `${c.segmento} tem ${c.mvas.length} jogos de MVA: ${c.mvas.map((m) => `${m.rotulo} = ${fmtMva(m.valor)}`).join('; ')}`,
      );
    }
  }

  if (indicioST) {
    motivos.push(`fornecedor tratou como ST (${indicioST})`);
  } else {
    motivos.push(
      'fornecedor não indicou ST na nota; com ST em Sergipe a entrada é 1403/2403 mesmo assim',
    );
  }

  const unico = candidatos.length === 1 ? candidatos[0] : null;
  let mva: number | null = null;
  if (unico && !duvidaMva) {
    mva = unico.mvas[0]?.valor ?? null;
    if (mva === null) {
      duvidaMva = true;
      pendencias.push(
        `linha ${unico.linhaPlanilha} sem MVA na coluna ${colunaMva}%`,
      );
    } else {
      motivos.push(`MVA ${fmtMva(mva)}`);
    }
  }

  return resultado(duvidaST || duvidaMva ? 'confirmar' : 'sim', candidatos, {
    segmento: segmentos.length === 1 ? segmentos[0] : null,
    cest: unico?.cest ?? null,
    mva,
    // Com a ST certa e só a MVA em dúvida, o CFOP já está decidido.
    cfopSugerido: duvidaST ? null : cfop(uf, true),
  });
}

/** Analisa todos os itens de uma nota lida pelo parser. */
export function analisarNota(
  itens: Item[],
  ufEmitente: string,
  base: BaseAnalise,
): AnaliseItem[] {
  return itens.map((i) => analisarItem(itemFiscalDe(i), ufEmitente, base));
}

export function itemFiscalDe(i: Item): ItemFiscal {
  return {
    nItem: i.nItem,
    xProd: i.xProd,
    NCM: i.NCM,
    CEST: i.CEST,
    orig: i.orig,
    CST: i.CST,
    CSOSN: i.CSOSN,
    pICMS: i.pICMS,
    CFOP: i.CFOP,
    cstIPI: i.cstIPI,
    pIPI: i.pIPI,
  };
}

function candidato(
  c: CandidatoST,
  coluna: AliquotaMva | null,
): CandidatoAnalise {
  const l = c.linha;
  return {
    segmento: l.segmento,
    segmentoOficial: l.segmentoOficial,
    cest: l.cest,
    ncmPlanilha: l.ncm,
    descricao: l.descricao,
    digitos: c.digitos,
    cestConfere: c.cestConfere,
    mvas: l.jogosMva.map((j) => ({
      rotulo: j.rotulo,
      valor: coluna === null ? null : j.porAliquota[coluna],
    })),
    linhaPlanilha: l.linhaPlanilha,
  };
}

function lerOrigem(
  orig: string | undefined,
  pendencias: string[],
): AnaliseItem['origem'] {
  const codigo = orig?.trim() ?? '';
  if (ORIGEM_IMPORTADO.has(codigo)) return { codigo, tipo: 'importado' };
  if (ORIGEM_NACIONAL.has(codigo)) return { codigo, tipo: 'nacional' };
  pendencias.push(
    codigo ? `origem "${codigo}" desconhecida` : 'nota sem origem (orig)',
  );
  return { codigo, tipo: null };
}

function colunaDaAliquota(aliquota: number | null): AliquotaMva | null {
  if (aliquota === null) return null;
  return COLUNAS_INTERESTADUAIS.find((c) => Number(c) === aliquota) ?? null;
}

/** Texto curto do que na nota indica ST, ou null. */
function indicioDeST(item: ItemFiscal): string | null {
  const cfopForn = item.CFOP?.trim() ?? '';
  if (CFOP_SAIDA_ST.has(cfopForn)) return `CFOP ${cfopForn}`;
  const cst = (item.CSOSN?.trim() || item.CST?.trim()) ?? '';
  if (CST_COM_ST.has(cst)) return `${item.CSOSN ? 'CSOSN' : 'CST'} ${cst}`;
  return null;
}

function cfop(uf: string, comST: boolean): string | null {
  if (!uf) return null;
  const prefixo = uf === 'SE' ? '1' : '2';
  return prefixo + (comST ? '403' : '102');
}

function analisarTipi(
  ncm: string,
  item: ItemFiscal,
  tabela: TabelaTipi | null,
): AnaliseTipi {
  const aliquotaNota = numero(item.pIPI);
  const vazio: AnaliseTipi = {
    existe: null,
    descricao: null,
    descricaoCompleta: null,
    aliquotaTipi: null,
    aliquotaNota,
    confere: null,
    aviso: null,
  };
  if (!tabela) return vazio;
  const c = consultarTipi(tabela, ncm);
  if (!c.existe) return { ...vazio, existe: false };
  const r: AnaliseTipi = {
    ...vazio,
    existe: true,
    descricao: c.descricao,
    descricaoCompleta: c.descricaoCompleta,
    aliquotaTipi: c.aliquotaIpi,
  };
  if (c.aliquotaIpi === null) return r;
  // Sem pIPI na nota conta como zero: o IPI não foi destacado.
  const tipiNum = c.aliquotaIpi === 'NT' ? 0 : c.aliquotaIpi;
  const notaNum = aliquotaNota ?? 0;
  r.confere = tipiNum === notaNum;
  if (!r.confere) {
    const tipiTxt = c.aliquotaIpi === 'NT' ? 'NT' : `${fmt(c.aliquotaIpi)}%`;
    const notaTxt = aliquotaNota === null ? 'sem IPI' : `${fmt(aliquotaNota)}%`;
    r.aviso = `IPI da nota (${notaTxt}) difere da TIPI (${tipiTxt}): informação, conferir exceções (Ex)`;
  }
  return r;
}

/** O XML traz o CEST só com dígitos ("2400100"); a planilha, "24.001.00". */
function formatarCest(cest: string | undefined): string | null {
  const t = cest?.trim() ?? '';
  if (!t) return null;
  const d = t.replace(/\D/g, '');
  return d.length === 7 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}` : t;
}

/** "7.0000" -> 7; vazio ou inválido -> null. */
function numero(v: string | undefined): number | null {
  const t = v?.trim().replace(',', '.') ?? '';
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null;
}

function fmt(n: number): string {
  return String(n).replace('.', ',');
}

function fmtMva(v: number | null): string {
  return v === null ? '-' : fmt(v);
}
