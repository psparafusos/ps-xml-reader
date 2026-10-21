// Colunas da tabela de itens. A tabela é montada a partir desta lista, na
// ordem dela, mostrando só as colunas com visivel: true.

import type { Item } from './tipos';
import * as f from './formato';

export interface ColunaItem {
  id: string;
  rotulo: string;
  alinhamento: 'esquerda' | 'direita';
  visivel: boolean;
  /** Texto da célula. A coluna de anotação não usa: a célula é um campo editável. */
  valor: (i: Item) => string;
}

/** A coluna com este id vira o campo de anotação do item. */
export const ID_ANOTACAO = 'anotacao';

export const COLUNAS_ITENS: ColunaItem[] = [
  {
    id: 'nItem',
    rotulo: 'Nº',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => i.nItem,
  },
  {
    id: 'codigo',
    rotulo: 'Código',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.cProd,
  },
  {
    id: 'descricao',
    rotulo: 'Descrição',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.xProd,
  },
  {
    id: ID_ANOTACAO,
    rotulo: 'Anotação',
    alinhamento: 'esquerda',
    visivel: true,
    valor: () => '',
  },
  {
    id: 'ncm',
    rotulo: 'NCM',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.NCM,
  },
  {
    id: 'cfop',
    rotulo: 'CFOP',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.CFOP,
  },
  {
    id: 'un',
    rotulo: 'Un',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.uCom,
  },
  {
    id: 'qtd',
    rotulo: 'Qtd',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.quantidade(i.qCom),
  },
  {
    id: 'vUnit',
    rotulo: 'V. Unit',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valorUnitario(i.vUnCom),
  },
  {
    id: 'vTotal',
    rotulo: 'V. Total',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valor(i.vProd),
  },
  {
    id: 'ipi',
    rotulo: 'IPI',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valor(i.vIPI),
  },
  {
    id: 'icms',
    rotulo: 'ICMS',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valor(i.vICMS),
  },
  {
    id: 'ean',
    rotulo: 'EAN',
    alinhamento: 'esquerda',
    visivel: false,
    valor: (i) => i.cEAN,
  },
];
