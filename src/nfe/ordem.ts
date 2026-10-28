// Ordem dos itens no modo Conferência (tela, impressão e PDF). O DANFE não
// usa: sai sempre na ordem do XML.
//
// Critérios:
//   'nota'           ordem do XML (nItem)
//   'cst'            agrupado pelo CST do ICMS (orig + CST ou CSOSN), grupos em
//                    ordem crescente e, dentro do grupo, a ordem da nota
//   '<id da coluna>' a coluna, como texto ou número (ColunaItem.ordenacao)
//   'codigo-texto'   código do produto comparado como texto
//   'codigo-numero'  código do produto comparado pelos dígitos, como número
// A ordenação é estável: empate mantém a ordem da nota. Valor vazio fica no
// fim, nas duas direções.

import type { ColunaItem } from './colunas';
import type { Anotacoes, Item } from './tipos';

export type Direcao = 'asc' | 'desc';

export interface Ordem {
  criterio: string;
  direcao: Direcao;
}

export const ORDEM_NOTA: Ordem = { criterio: 'nota', direcao: 'asc' };

const colador = new Intl.Collator('pt-BR');

function compararTexto(a: string, b: string): number {
  return colador.compare(a, b);
}

/** Número do XML; null quando vazio ou inválido. */
function numero(bruto: string): number | null {
  if (bruto.trim() === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Código como número: o primeiro trecho de dígitos, comparado sem os zeros à
 * esquerda e pelo tamanho (vale para códigos com mais de 15 dígitos, que não
 * cabem num Number exato). "000000000080165102" -> 80165102; "60062001X" ->
 * 60062001. Sem dígitos: null.
 */
function digitosDoCodigo(codigo: string): string | null {
  const m = /\d+/.exec(codigo);
  if (!m) return null;
  return m[0].replace(/^0+(?=\d)/, '');
}

function compararDigitos(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Colunas que podem ordenar: as visíveis de `colunas` (colunasDaConfig). */
export function colunasOrdenaveis(colunas: ColunaItem[]): ColunaItem[] {
  return colunas.filter((c) => c.visivel);
}

/** true se o critério existe nesta versão e com estas colunas. */
export function criterioValido(
  criterio: string,
  colunas: ColunaItem[],
): boolean {
  if (['nota', 'cst', 'codigo-texto', 'codigo-numero'].includes(criterio))
    return true;
  return colunasOrdenaveis(colunas).some(
    (c) => c.id === criterio && c.id !== 'codigo',
  );
}

/**
 * Valor de comparação de um item: string (texto ou dígitos do código) ou
 * number; null quando vazio (vai para o fim).
 */
type Valor =
  | { tipo: 'texto' | 'digitos'; v: string }
  | { tipo: 'numero'; v: number }
  | null;

function valorDe(
  i: Item,
  criterio: string,
  anotacoes: Anotacoes,
  colunas: ColunaItem[],
): Valor {
  if (criterio === 'codigo-texto')
    return i.cProd ? { tipo: 'texto', v: i.cProd } : null;
  if (criterio === 'codigo-numero') {
    const d = digitosDoCodigo(i.cProd);
    return d === null ? null : { tipo: 'digitos', v: d };
  }
  const col = colunas.find((c) => c.id === criterio);
  if (!col) return null;
  if (col.anotacao) {
    const t = anotacoes.get(col.id)?.get(i.nItem) ?? '';
    return t.trim() ? { tipo: 'texto', v: t } : null;
  }
  const bruto = col.chave ? col.chave(i) : col.valor(i);
  if (col.ordenacao === 'numero') {
    const n = numero(bruto);
    return n === null ? null : { tipo: 'numero', v: n };
  }
  return bruto.trim() ? { tipo: 'texto', v: bruto } : null;
}

function compararValores(a: Valor, b: Valor): number {
  if (a === null || b === null) return 0; // tratado fora
  if (a.tipo === 'numero' && b.tipo === 'numero') return a.v - b.v;
  if (a.tipo === 'digitos' && b.tipo === 'digitos')
    return compararDigitos(a.v, b.v);
  return compararTexto(String(a.v), String(b.v));
}

/** Itens na ordem pedida. Não altera a lista recebida (que está na ordem da nota). */
export function ordenarItens(
  itens: Item[],
  ordem: Ordem,
  anotacoes: Anotacoes,
  colunas: ColunaItem[],
): Item[] {
  const comIndice = itens.map((item, indice) => ({ item, indice }));
  if (ordem.criterio === 'nota') return itens.slice();
  if (ordem.criterio === 'cst') {
    return comIndice
      .sort((a, b) => {
        const ca = a.item.cstIcms,
          cb = b.item.cstIcms;
        if (ca !== cb) {
          if (!ca) return 1;
          if (!cb) return -1;
          return compararTexto(ca, cb);
        }
        return a.indice - b.indice;
      })
      .map((x) => x.item);
  }
  const sinal = ordem.direcao === 'desc' ? -1 : 1;
  const valores = new Map(
    comIndice.map((x) => [
      x.indice,
      valorDe(x.item, ordem.criterio, anotacoes, colunas),
    ]),
  );
  return comIndice
    .sort((a, b) => {
      const va = valores.get(a.indice) ?? null;
      const vb = valores.get(b.indice) ?? null;
      if (va === null && vb === null) return a.indice - b.indice;
      if (va === null) return 1;
      if (vb === null) return -1;
      let r = compararValores(va, vb);
      // Código como número: mesmo número (ex.: 0123 e 123A) desempata pelo texto.
      if (r === 0 && ordem.criterio === 'codigo-numero')
        r = compararTexto(a.item.cProd, b.item.cProd);
      return r !== 0 ? sinal * r : a.indice - b.indice;
    })
    .map((x) => x.item);
}

/** Rótulo curto da ordem, para o botão Ordenar. */
export function descreverOrdem(o: Ordem, colunas: ColunaItem[]): string {
  if (o.criterio === 'nota') return 'Ordem da nota';
  if (o.criterio === 'cst') return 'Agrupado por CST';
  const dir = o.direcao === 'asc' ? 'crescente' : 'decrescente';
  if (o.criterio === 'codigo-texto') return `Código (como texto), ${dir}`;
  if (o.criterio === 'codigo-numero') return `Código (como número), ${dir}`;
  const col = colunas.find((c) => c.id === o.criterio);
  return `${col?.rotulo ?? o.criterio}, ${dir}`;
}
