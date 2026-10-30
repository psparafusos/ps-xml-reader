// Leitor mínimo de .xlsx: abre o zip (fiscal/zip.ts), lê o workbook, os
// textos compartilhados e cada aba, e devolve as células como uma grade de
// texto ou número. Lógica pura, sem dependência externa. Não interpreta
// estilos nem fórmulas: usa o valor já calculado que o Excel grava no <v>.

import { lerZip } from './zip';

export type ValorCelula = string | number;

export interface Aba {
  nome: string;
  /** linhas[i][j]: linha i+1, coluna j (A = 0). Célula vazia = undefined. */
  linhas: (ValorCelula | undefined)[][];
}

export function lerXlsx(dados: Uint8Array): Aba[] {
  const zip = lerZip(dados);
  const texto = (nome: string): string => {
    const b = zip.get(nome);
    if (!b) throw new Error(`xlsx: ${nome} não encontrado`);
    return Buffer.from(b).toString('utf8');
  };

  const compartilhados = zip.has('xl/sharedStrings.xml')
    ? lerTextosCompartilhados(texto('xl/sharedStrings.xml'))
    : [];

  const rels = new Map<string, string>();
  for (const m of texto('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], 'Id');
    const alvo = atributo(m[0], 'Target');
    if (id && alvo) rels.set(id, alvo.replace(/^\/?(xl\/)?/, 'xl/'));
  }

  const abas: Aba[] = [];
  for (const m of texto('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const nome = desescapar(atributo(m[0], 'name') ?? '');
    const caminho = rels.get(atributo(m[0], 'r:id') ?? '');
    if (!caminho) throw new Error(`xlsx: aba "${nome}" sem arquivo`);
    abas.push({ nome, linhas: lerAba(texto(caminho), compartilhados) });
  }
  return abas;
}

function lerTextosCompartilhados(xml: string): string[] {
  const textos: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    textos.push(juntarTextos(si[1]));
  }
  return textos;
}

/** Junta os <t> de um texto rico, ignorando a pronúncia fonética (<rPh>). */
function juntarTextos(xml: string): string {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let s = '';
  for (const t of semFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += t[1];
  return desescapar(s);
}

function lerAba(xml: string, compartilhados: string[]): (ValorCelula | undefined)[][] {
  const linhas: (ValorCelula | undefined)[][] = [];
  const reCelula = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const c of xml.matchAll(reCelula)) {
    const attrs = c[1];
    const corpo = c[2] ?? '';
    const ref = atributo(attrs, 'r');
    if (!ref) continue;
    const pos = referencia(ref);
    const tipo = atributo(attrs, 't');
    let valor: ValorCelula | undefined;
    if (tipo === 'inlineStr') {
      valor = juntarTextos(corpo);
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      if (v === undefined) continue;
      if (tipo === 's') valor = compartilhados[Number(v)];
      else if (tipo === 'str' || tipo === 'e') valor = desescapar(v);
      else if (tipo === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else valor = Number(v);
    }
    if (valor === undefined || valor === '') continue;
    (linhas[pos.linha] ??= [])[pos.coluna] = valor;
  }
  for (let i = 0; i < linhas.length; i++) linhas[i] ??= [];
  return linhas;
}

/** "AB12" -> { linha: 11, coluna: 27 } (base zero). */
export function referencia(ref: string): { linha: number; coluna: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`xlsx: referência de célula inválida: ${ref}`);
  let coluna = 0;
  for (const letra of m[1]) coluna = coluna * 26 + (letra.charCodeAt(0) - 64);
  return { linha: Number(m[2]) - 1, coluna: coluna - 1 };
}

/** Letra da coluna (base zero): 0 -> A, 27 -> AB. */
export function letraColuna(coluna: number): string {
  let s = '';
  for (let n = coluna + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

function atributo(tag: string, nome: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${nome.replace(':', '\\:')}="([^"]*)"`);
  return re.exec(tag)?.[1];
}

function desescapar(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
