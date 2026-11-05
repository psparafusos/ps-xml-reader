// Ferramenta "ST, MVA e CFOP", caixa "Item N: qual linha da planilha vale?":
// a explicação do caso, montada só com o que o app tem (a TIPI carregada, as
// linhas candidatas da planilha de Sergipe e a nota), e a sugestão de "Sem
// ST" quando nada liga o produto às linhas. Sem dicionário de produtos.
// Lógica pura, sem DOM.

import type { AnaliseItem } from './fiscal/analise';

/** Campos do item da nota que dizem se o fornecedor reteve ST. */
export interface ItemRetencao {
  CST?: string;
  CSOSN?: string;
  vST?: string;
  vBCST?: string;
}

/** CST e CSOSN de ST retida (agora ou antes, como o 60). */
const CST_RETIDO = new Set([
  '10',
  '30',
  '60',
  '70',
  '201',
  '202',
  '203',
  '500',
]);

/** O fornecedor reteve ST: valor ou base de ST na nota, ou CST/CSOSN de ST. */
export function stRetidoNaNota(i: ItemRetencao): boolean {
  const valor = (v?: string) => Number((v ?? '').trim().replace(',', '.')) || 0;
  if (valor(i.vST) > 0 || valor(i.vBCST) > 0) return true;
  const cst = i.CSOSN?.trim() || i.CST?.trim() || '';
  return CST_RETIDO.has(cst);
}

export function formatarNcm(ncm: string): string {
  return ncm.length === 8
    ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}`
    : ncm;
}

/** Descrição curta de uma linha: até ~70 caracteres, cortada numa palavra. */
function curta(descricao: string): string {
  const t = descricao
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:]+$/, '');
  if (t.length <= 70) return t;
  const corte = t.slice(0, 70);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > 40 ? corte.slice(0, espaco) : corte).replace(/[,;:]+$/, '')}...`;
}

const lista = (xs: string[]) =>
  xs.length <= 1
    ? (xs[0] ?? '')
    : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;

export interface ExplicacaoItem {
  /** "NCM 3924.90.00 na TIPI: <descrição completa>"; null sem TIPI. */
  linhaTipi: string | null;
  /** O parágrafo gerado. */
  texto: string;
}

/**
 * Explicação da caixa de escolha. `retido`: o fornecedor reteve ST
 * (stRetidoNaNota). Com TIPI: "O NCM X é amplo: <TIPI>. Na planilha...";
 * sem TIPI, começa direto pela planilha.
 */
export function explicacaoItem(
  a: AnaliseItem,
  retido: boolean,
): ExplicacaoItem {
  const ncm = formatarNcm(a.ncm);
  const tipi = a.tipi.descricaoCompleta?.trim() || null;
  const segmentos = [...new Set(a.candidatos.map((c) => c.segmento))];
  const n = a.candidatos.length;
  const linhas = a.candidatos.map((c) => curta(c.descricao)).join('; ');
  const onde = `${segmentos.length === 1 ? 'no segmento' : 'nos segmentos'} ${lista(segmentos)}, em ${n} ${n === 1 ? 'linha' : 'linhas'}: ${linhas}.`;
  const partes = [
    tipi
      ? `O NCM ${ncm} é amplo: ${tipi.replace(/[.;:]+$/, '')}. Na planilha de Sergipe ele aparece ${onde}`
      : `Na planilha de Sergipe o NCM ${ncm} aparece ${onde}`,
    n === 1
      ? 'Um produto só tem ST se for esse.'
      : 'Um produto só tem ST se for um desses.',
    `O fornecedor ${a.cestNota ? `informou CEST (${a.cestNota})` : 'não informou CEST'} e ${retido ? 'reteve' : 'não reteve'} ST.`,
  ];
  return {
    linhaTipi: tipi ? `NCM ${ncm} na TIPI: ${tipi}` : null,
    texto: partes.join(' '),
  };
}

/** Palavras que não ligam um produto a outro. */
const VAZIAS = new Set(
  (
    'a o as os e ou de da do das dos em no na nos nas por para pela pelo com sem ' +
    'ao aos um uma uns umas se que seu sua seus suas sob sobre entre ate ' +
    'outro outra outros outras demais exceto inclusive mesmo mesma ' +
    'tipo tipos uso usos qualquer quaisquer etc nao'
  ).split(' '),
);

/** Tira acento, caixa e o plural simples ("vernizes" -> "verniz", "tintas" -> "tinta"). */
function raiz(palavra: string): string {
  const p = palavra.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (p.length > 4 && /(zes|res|ses)$/.test(p)) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);
  return p;
}

/** Palavras significativas de um texto: sem as vazias, sem números, com 3 letras ou mais. */
export function palavrasSignificativas(texto: string): Set<string> {
  const r = new Set<string>();
  for (const w of texto.split(/[^\p{L}]+/u)) {
    if (w.length < 3) continue;
    const base = raiz(w);
    if (base.length < 3 || VAZIAS.has(base) || VAZIAS.has(raiz(base))) continue;
    r.add(base);
  }
  return r;
}

/**
 * Sugere "Sem ST": a descrição da TIPI e as das linhas candidatas não têm
 * palavra significativa em comum, e a nota veio sem CEST e sem ST retido.
 * Sem TIPI ou sem candidatos, não há o que comparar: não sugere.
 */
export function sugerirSemST(a: AnaliseItem, retido: boolean): boolean {
  if (retido || a.cestNota) return false;
  const tipi = a.tipi.descricaoCompleta?.trim();
  if (!tipi || a.candidatos.length === 0) return false;
  const daTipi = palavrasSignificativas(tipi);
  return a.candidatos.every((c) =>
    [...palavrasSignificativas(c.descricao)].every((p) => !daTipi.has(p)),
  );
}
