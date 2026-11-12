// Busca da vista Texto do leitor genérico de XML: procura o termo no texto do
// arquivo como ele é (pega nomes de marcação, atributos e textos de uma vez),
// sem diferenciar maiúsculas. Também acha as ocorrências dentro de uma linha
// para a tela destacar. Puro, sem DOM.

import { LIMITE_ACHADOS } from '../xml/limites';

export interface ResultadoBuscaTexto {
  /** Posição (em caracteres do texto) de cada achado, em ordem. */
  posicoes: Int32Array;
  /** Havia mais achados que o limite. */
  truncado: boolean;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Expressão do termo, sem diferenciar maiúsculas; null se vazio. */
export function expressaoDoTermo(termo: string): RegExp | null {
  return termo === '' ? null : new RegExp(escapar(termo), 'gi');
}

/** Procura `termo` em `texto`; até `limite` achados. */
export function buscarNoTexto(
  texto: string,
  termo: string,
  limite = LIMITE_ACHADOS,
): ResultadoBuscaTexto {
  const re = expressaoDoTermo(termo);
  if (!re) return { posicoes: new Int32Array(0), truncado: false };
  const achados: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    if (achados.length >= limite) {
      return { posicoes: Int32Array.from(achados), truncado: true };
    }
    achados.push(m.index);
    // Termo que casa com vazio não existe aqui (termo vazio sai antes).
    re.lastIndex = m.index + m[0].length;
  }
  return { posicoes: Int32Array.from(achados), truncado: false };
}

/** Trechos [início, fim) de `s` onde o termo aparece. */
export function ocorrencias(s: string, termo: string): [number, number][] {
  const re = expressaoDoTermo(termo);
  if (!re) return [];
  const saida: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    saida.push([m.index, m.index + m[0].length]);
    re.lastIndex = m.index + m[0].length;
  }
  return saida;
}
