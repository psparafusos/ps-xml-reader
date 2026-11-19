// Evidências na própria nota de que um item é do segmento da linha da
// planilha de ST (roteiro da contabilidade): o NCM bater com uma linha não
// basta. O "Sim" automático pede, além da linha candidata, o CEST da nota
// igual ao da linha ou a ST retida pelo fornecedor no item. Sem nenhuma das
// duas, a pessoa confirma; sem CEST e com tributação sem ST, a sugestão é
// "Sem ST".
//
// Lógica pura e sem dependências: roda no processo principal (fiscal/
// analise.ts) e na tela (explicacaoST.ts, ferramentaST.ts).

/** Campos do item da nota que dizem como o fornecedor tributou o ICMS. */
export interface ItemTributacao {
  CST?: string;
  CSOSN?: string;
  /** Base e valor do ICMS-ST retido agora (vBCST e vICMSST do grupo ICMS). */
  vBCST?: string;
  vST?: string;
  /** Base e valor do ICMS-ST retido antes (CST 60, CSOSN 500). */
  vBCSTRet?: string;
  vICMSSTRet?: string;
}

/** CST do regime normal com ST (retida agora ou antes, e "outras"). */
const CST_ST = new Set(['10', '30', '60', '70', '90']);
/** CSOSN do Simples Nacional equivalentes. */
const CSOSN_ST = new Set(['201', '202', '203', '500', '900']);

/** "12.34", "12,34" -> 12,34; vazio ou inválido -> 0. */
function valor(v: string | undefined): number {
  const n = Number((v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** "CST 00", "CSOSN 102" ou "" quando a nota não traz. */
export function codigoTributacao(i: ItemTributacao): string {
  const csosn = i.CSOSN?.trim() ?? '';
  if (csosn) return `CSOSN ${csosn}`;
  const cst = i.CST?.trim() ?? '';
  return cst ? `CST ${cst}` : '';
}

/** CST ou CSOSN de ST (10, 30, 60, 70, 90; 201, 202, 203, 500, 900). */
export function cstDeST(i: ItemTributacao): boolean {
  const csosn = i.CSOSN?.trim() ?? '';
  if (csosn) return CSOSN_ST.has(csosn);
  return CST_ST.has(i.CST?.trim() ?? '');
}

/**
 * O fornecedor reteve ST no item: CST ou CSOSN de ST com valores de ST
 * (base ou valor, agora ou retido antes), ou vICMSST / vBCSTRet / vICMSSTRet
 * maior que zero com qualquer código. Só o CST, sem valor, não basta.
 */
export function stRetidoPeloFornecedor(i: ItemTributacao): boolean {
  if (valor(i.vST) > 0 || valor(i.vBCSTRet) > 0 || valor(i.vICMSSTRet) > 0)
    return true;
  return cstDeST(i) && valor(i.vBCST) > 0;
}

/**
 * Tributação sem ST: a nota traz CST ou CSOSN e ele não é de ST (00, 20,
 * 40, 101, 102...). Sem código, não dá para dizer.
 */
export function tributacaoSemST(i: ItemTributacao): boolean {
  return codigoTributacao(i) !== '' && !cstDeST(i);
}

const fmtValor = (v: number) =>
  v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Texto curto da tributação para o quadro: "CST 10, ICMS-ST R$ 12,34",
 * "CST 00, sem valores de ST", "sem CST na nota".
 */
export function textoTributacao(i: ItemTributacao): string {
  const codigo = codigoTributacao(i) || 'sem CST na nota';
  const partes: string[] = [];
  if (valor(i.vST) > 0) partes.push(`ICMS-ST R$ ${fmtValor(valor(i.vST))}`);
  else if (valor(i.vBCST) > 0)
    partes.push(`base do ICMS-ST R$ ${fmtValor(valor(i.vBCST))}`);
  if (valor(i.vICMSSTRet) > 0)
    partes.push(`ICMS-ST retido antes R$ ${fmtValor(valor(i.vICMSSTRet))}`);
  else if (valor(i.vBCSTRet) > 0)
    partes.push(`base do ST retido antes R$ ${fmtValor(valor(i.vBCSTRet))}`);
  return partes.length
    ? `${codigo}, ${partes.join(', ')}`
    : `${codigo}, sem valores de ST`;
}

/** CEST só com dígitos ("01.002.00" e "0100200" -> "0100200"). */
export const digitosCest = (cest: string | null | undefined) =>
  (cest ?? '').replace(/\D/g, '');

/** Compara dois CEST pelos 7 dígitos, sem pontos. */
export function mesmoCest(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = digitosCest(a);
  return x.length === 7 && x === digitosCest(b);
}

/** Linha da planilha que tem o CEST da nota (quando ele não é o da linha candidata). */
export interface LinhaDoCest {
  segmento: string;
  cest: string;
  linhaPlanilha: number;
  descricao: string;
}

/** O que a nota diz sobre o item, para decidir e para mostrar no quadro. */
export interface EvidenciasNota {
  /** CEST da nota (NN.NNN.NN), ou null. */
  cestNota: string | null;
  /**
   * Linhas da planilha com o CEST da nota (de qualquer segmento). Vazio sem
   * CEST, ou quando o CEST da nota não está na planilha.
   */
  linhasDoCest: LinhaDoCest[];
  /** "CST 00", "CSOSN 102" ou "". */
  codigo: string;
  /** O fornecedor reteve ST no item (stRetidoPeloFornecedor). */
  stRetido: boolean;
  /** Tributação sem ST (tributacaoSemST). */
  tributacaoSemST: boolean;
  /** Texto curto da tributação (textoTributacao). */
  tributacao: string;
}

export function evidenciasDaNota(
  i: ItemTributacao,
  cestNota: string | null,
  linhasDoCest: LinhaDoCest[],
): EvidenciasNota {
  return {
    cestNota,
    linhasDoCest,
    codigo: codigoTributacao(i),
    stRetido: stRetidoPeloFornecedor(i),
    tributacaoSemST: tributacaoSemST(i),
    tributacao: textoTributacao(i),
  };
}
