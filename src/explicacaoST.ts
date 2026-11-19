// Ferramenta "ST, MVA e CFOP", caixa "Item N: qual linha da planilha vale?":
// a explicação do caso, montada só com o que o app tem (a TIPI carregada, as
// linhas candidatas da planilha de Sergipe e a nota), e a sugestão de "Sem
// ST" quando nada liga o produto às linhas. Sem dicionário de produtos.
// Lógica pura, sem DOM.

import type { AnaliseItem } from './fiscal/analise';
import {
  stRetidoPeloFornecedor,
  type ItemTributacao,
} from './fiscal/evidencias';

/** Campos do item da nota que dizem se o fornecedor reteve ST. */
export type ItemRetencao = ItemTributacao;

/**
 * O fornecedor reteve ST: a mesma regra do motor (fiscal/evidencias.ts),
 * CST ou CSOSN de ST com valores de ST, ou valor de ST retido maior que zero.
 */
export function stRetidoNaNota(i: ItemRetencao): boolean {
  return stRetidoPeloFornecedor(i);
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

// ---------- outras linhas do mesmo começo de NCM ----------

/** NCM de 4 a 8 dígitos com os pontos ("4011", "4011.10", "4011.10.00"). */
function ncmComPontos(ncm: string): string {
  if (ncm.length <= 4) return ncm;
  return `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}${ncm.length > 6 ? `.${ncm.slice(6)}` : ''}`;
}

/** Quantos NCMs a linha lista antes de resumir em "e mais N". */
const MAX_NCMS_OUTRAS = 8;

/**
 * Linha do quadro de escolha: outras linhas da planilha citam o mesmo começo
 * do NCM, mas para NCMs diferentes do item. Explica por que a busca no Excel
 * acha mais linhas do que o app mostra.
 */
export function textoOutrasLinhas(o: {
  comeco: string;
  linhas: number;
  ncms: string[];
}): string {
  const ncms = o.ncms.map(ncmComPontos);
  const mostrados = ncms.slice(0, MAX_NCMS_OUTRAS);
  const resto = ncms.length - mostrados.length;
  const listaNcms = `${mostrados.join(', ')}${resto > 0 ? ` e mais ${resto}` : ''}`;
  const para =
    ncms.length === 1
      ? 'para um NCM diferente deste item'
      : 'para NCMs diferentes deste item';
  return o.linhas === 1
    ? `Outra linha da planilha cita ${o.comeco}, mas ${para} (${listaNcms}).`
    : `Outras ${o.linhas} linhas da planilha citam ${o.comeco}, mas ${para} (${listaNcms}).`;
}

// ---------- "não é da linha automotiva" nas informações da nota ----------

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/\s+/g, ' ');

/** Frases que dizem que o produto não é da linha automotiva (texto sem acento, maiúsculo). */
const RE_FORA_AUTOMOTIVA = [
  /\bNAO\b.{0,30}\bENQUADRAD[OA]S?\b.{0,30}\bLINHA AUTOMOTIVA\b/,
  /\bNAO\b.{0,30}\b(FAZ(EM)? PARTE|SUJEIT[OA]S?|ENQUADRAD[OA]S?|CONTEMPLAD[OA]S?|ABRANGID[OA]S?)\b.{0,40}\bPROT(OCOLO)?\b\.? ?(ICMS )?(N[.ºO°]* ?)?41 ?\/ ?(20)?08\b/,
  /\bNAO\b.{0,20}\b(E|SAO|PERTENCEM?|SE DESTINAM?)\b.{0,20}\b(LINHA AUTOMOTIVA|AUTOPECAS?)\b/,
  // "PRODUTOS NAO DESTINADOS AO USO AUTOMOTIVO" (Makita), no singular também.
  /\bNAO DESTINAD[OA]S?\b.{0,20}\bAUTOMOTIV[OA]S?\b/,
];

/** Tamanho máximo da frase mostrada (texto longo corta com reticências). */
const MAX_FRASE = 240;

/**
 * Trechos das informações complementares da nota que dizem que o produto
 * não é da linha automotiva ("NAO ENQUADRADO NA LINHA AUTOMOTIVA", "NAO FAZ
 * PARTE DO PROTOCOLO 41/2008", "NAO DESTINADOS AO USO AUTOMOTIVO"), como
 * estão na nota. Só informação: não muda a decisão nem a sugestão. Lista
 * vazia quando não há.
 */
export function frasesForaLinhaAutomotiva(texto: string): string[] {
  const frases: string[] = [];
  // Separa em frases: ponto e vírgula, quebra de linha, barra vertical, ou
  // ponto depois de palavra longa ou número (abreviação como "PROT." não
  // separa).
  const frasesDaNota = texto.split(
    /\s*(?:[;\n\r|]|(?<=[\p{L}]{5,}|\d)\.\s+(?=\p{Lu}))\s*/u,
  );
  for (const parte of frasesDaNota) {
    const t = parte.replace(/\s+/g, ' ').trim();
    if (!t || !RE_FORA_AUTOMOTIVA.some((re) => re.test(semAcento(t)))) continue;
    const curto =
      t.length > MAX_FRASE ? `${t.slice(0, MAX_FRASE).trimEnd()}...` : t;
    if (!frases.includes(curto)) frases.push(curto);
  }
  return frases;
}

/** O item tem candidato no segmento de Autopeças. */
export function temCandidatoAutopecas(a: AnaliseItem): boolean {
  return a.candidatos.some((c) =>
    /AUTOPE/.test(semAcento(`${c.segmento} ${c.segmentoOficial}`)),
  );
}

/** Texto mostrado no quadro: a frase da nota, como informação. */
export function textoForaLinhaAutomotiva(frase: string): string {
  return `Informações complementares da nota: "${frase}". Só informação: a decisão e a sugestão não mudam.`;
}

// ---------- evidências na nota (uma linha candidata) ----------

/**
 * Linhas curtas do quadro "é do segmento X?", com uma linha candidata: o
 * NCM bate com a linha, a descrição dela, o segmento, o CEST da nota
 * (ausente, igual ou diferente, com a linha de onde ele é) e se o
 * fornecedor reteve ST. Vazio sem exatamente uma linha candidata.
 */
export function linhasEvidencia(a: AnaliseItem): string[] {
  if (a.candidatos.length !== 1) return [];
  const c = a.candidatos[0];
  const ev = a.evidencias;
  const ncmLinha =
    c.ncmPlanilha.length === 8 ? formatarNcm(c.ncmPlanilha) : c.ncmPlanilha;
  const linhas = [
    `NCM ${formatarNcm(a.ncm)} bate com a linha ${c.linhaPlanilha} da planilha (NCM ${ncmLinha} na linha).`,
    `Descrição da linha: ${c.descricao.replace(/[.;:]+$/, '')}.`,
    `Segmento: ${c.segmento}${c.segmentoOficial && c.segmentoOficial !== c.segmento ? ` (${c.segmentoOficial})` : ''}, CEST ${c.cest}.`,
  ];
  if (!a.cestNota) linhas.push('CEST da nota: ausente.');
  else if (c.cestConfere)
    linhas.push(`CEST da nota: igual ao da linha (${a.cestNota}).`);
  else {
    const doCest = ev?.linhasDoCest ?? [];
    const onde = doCest.length
      ? `é de ${doCest.map((l) => `${l.segmento}, linha ${l.linhaPlanilha}`).join('; ')}`
      : 'não está na planilha';
    linhas.push(
      `CEST da nota: diferente. A nota traz ${a.cestNota} (${onde}); a linha tem ${c.cest}.`,
    );
  }
  if (ev)
    linhas.push(
      `ST retida pelo fornecedor: ${ev.stRetido ? 'sim' : 'não'} (${ev.tributacao}).`,
    );
  return linhas;
}

/** Por que o motor sugere "Sem ST" (só com a sugestão do motor). */
export function textoSugestaoSemST(a: AnaliseItem): string | null {
  if (!a.sugestaoSemST) return null;
  const codigo = a.evidencias?.codigo || 'tributação sem ST';
  return `Sugerido: a nota não tem CEST, veio com ${codigo} e sem ST retida.`;
}

/**
 * Detalhes do motor que ficam fora do quadro de uma linha candidata: os que
 * repetem as evidências (linha, CEST, ST retida) e os de MVA e alíquota
 * interna, que só valem depois de "Tem ST".
 */
const FORA_DO_QUADRO = [
  /^NCM na planilha de ST/,
  /^nota sem CEST/,
  /^CEST da nota/,
  /^coluna de MVA/,
  /^MVA /,
  /^Autopeças: /,
  /^alíquota interna/,
  /^fornecedor não indicou ST/,
];

export function detalhesDoQuadro(detalhes: string[]): string[] {
  return detalhes.filter((d) => !FORA_DO_QUADRO.some((re) => re.test(d)));
}
