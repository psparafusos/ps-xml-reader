// Resumo dos CFOPs de entrada da nota aberta, para o painel de conferência:
// conta os itens por valor da coluna de anotação "CFOP de entrada" (o que a
// ferramenta ST, MVA e CFOP gravou e o que a pessoa digitou). Valores com
// poucos itens ficam em destaque: costumam ser o item que escapou. Lógica
// pura, sem DOM.

import type { Anotacoes, Item } from './tipos';

export const TITULO_COLUNA_CFOP = 'CFOP de entrada';

export interface ItemCfop {
  nItem: string;
  xProd: string;
}

export interface GrupoCfop {
  valor: string;
  itens: ItemCfop[];
  /** Poucos itens com este valor (até 10% dos preenchidos, no mínimo 1), havendo outros valores. */
  destaque: boolean;
}

export interface ResumoCfop {
  /** Do mais usado ao menos usado; empate pelo valor. */
  grupos: GrupoCfop[];
  preenchidos: number;
  vazios: number;
}

export function resumoCfops(
  itens: Item[],
  anotacoes: Anotacoes,
  coluna: string,
): ResumoCfop {
  const valores = anotacoes.get(coluna);
  const porValor = new Map<string, ItemCfop[]>();
  let vazios = 0;
  for (const i of itens) {
    const v = valores?.get(i.nItem)?.trim() ?? '';
    if (!v) {
      vazios++;
      continue;
    }
    const lista = porValor.get(v) ?? [];
    porValor.set(v, lista);
    lista.push({ nItem: i.nItem, xProd: i.xProd });
  }
  const preenchidos = itens.length - vazios;
  const poucos = Math.max(1, Math.floor(preenchidos * 0.1));
  const grupos = [...porValor]
    .map(([valor, lista]) => ({
      valor,
      itens: lista.sort((a, b) => Number(a.nItem) - Number(b.nItem)),
      destaque: porValor.size > 1 && lista.length <= poucos,
    }))
    .sort(
      (a, b) =>
        b.itens.length - a.itens.length || a.valor.localeCompare(b.valor),
    );
  return { grupos, preenchidos, vazios };
}

/** "2102: 194 itens · 2403: 2 itens". */
export function textoResumoCfop(r: ResumoCfop): string {
  return r.grupos
    .map(
      (g) =>
        `${g.valor}: ${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'}`,
    )
    .join(' · ');
}
