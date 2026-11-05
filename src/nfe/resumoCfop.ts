// Resumo dos CFOPs de entrada da nota aberta, para o painel de conferência:
// conta os itens por valor da coluna de anotação "CFOP de entrada" (o que a
// ferramenta ST, MVA e CFOP gravou e o que a pessoa digitou). Valores com
// poucos itens ficam em destaque: costumam ser o item que escapou. Itens
// com CFOP manual (opção "Outro" da ferramenta) ganham marca. Lógica pura,
// sem DOM.

import { chaveDecisao, type DecisaoLembrada } from '../fiscal/entrada';
import type { Anotacoes, Item } from './tipos';

export const TITULO_COLUNA_CFOP = 'CFOP de entrada';

export interface ItemCfop {
  nItem: string;
  xProd: string;
  /** O valor gravado é o CFOP manual da decisão lembrada do produto. */
  manual: boolean;
}

export interface GrupoCfop {
  valor: string;
  itens: ItemCfop[];
  /** Poucos itens com este valor (até 10% dos preenchidos, no mínimo 1), havendo outros valores. */
  destaque: boolean;
  /** Quantos itens do grupo têm CFOP manual. */
  manuais: number;
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
  /** nItem dos itens com CFOP manual (itensCfopManual). */
  manuais: ReadonlySet<string> = new Set(),
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
    lista.push({
      nItem: i.nItem,
      xProd: i.xProd,
      manual: manuais.has(i.nItem),
    });
  }
  const preenchidos = itens.length - vazios;
  const poucos = Math.max(1, Math.floor(preenchidos * 0.1));
  const grupos = [...porValor]
    .map(([valor, lista]) => ({
      valor,
      itens: lista.sort((a, b) => Number(a.nItem) - Number(b.nItem)),
      destaque: porValor.size > 1 && lista.length <= poucos,
      manuais: lista.filter((x) => x.manual).length,
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

/**
 * Itens cujo CFOP na coluna é o CFOP manual lembrado para o produto (mesma
 * raiz do CNPJ, código e NCM). Se a pessoa trocou o valor à mão depois, o
 * item não conta como manual.
 */
export function itensCfopManual(
  itens: Item[],
  cnpj: string,
  decisoes: readonly DecisaoLembrada[],
  anotacoes: Anotacoes,
  coluna: string,
): Set<string> {
  const manuais = new Map<string, DecisaoLembrada>();
  for (const d of decisoes)
    if (d.escolha?.tipo === 'manual')
      manuais.set(chaveDecisao(d.raizCnpj, d.cProd), d);
  const r = new Set<string>();
  if (manuais.size === 0) return r;
  const valores = anotacoes.get(coluna);
  for (const i of itens) {
    const d = manuais.get(chaveDecisao(cnpj, i.cProd));
    if (!d || d.escolha?.tipo !== 'manual') continue;
    if (d.ncm !== i.NCM.replace(/\D/g, '')) continue;
    if ((valores?.get(i.nItem)?.trim() ?? '') === d.escolha.cfop)
      r.add(i.nItem);
  }
  return r;
}
