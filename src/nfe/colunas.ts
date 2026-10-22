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
  /**
   * Como a coluna ordena: texto (localeCompare pt-BR) ou número (valor do
   * XML). A coluna Código tem as duas formas (ver nfe/ordem.ts).
   */
  ordenacao: 'texto' | 'numero';
  /** Valor bruto para ordenar; sem ele, ordena pelo texto da célula. */
  chave?: (i: Item) => string;
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
    ordenacao: 'numero',
    chave: (i) => i.nItem,
  },
  {
    id: 'codigo',
    rotulo: 'Código',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.cProd,
    ordenacao: 'texto',
  },
  {
    id: 'descricao',
    rotulo: 'Descrição',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.xProd,
    ordenacao: 'texto',
  },
  {
    id: ID_ANOTACAO,
    rotulo: 'Anotação',
    alinhamento: 'esquerda',
    visivel: true,
    valor: () => '',
    ordenacao: 'texto',
  },
  {
    id: 'ncm',
    rotulo: 'NCM',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.NCM,
    ordenacao: 'numero',
    chave: (i) => i.NCM,
  },
  {
    id: 'cfop',
    rotulo: 'CFOP',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.CFOP,
    ordenacao: 'numero',
    chave: (i) => i.CFOP,
  },
  {
    id: 'un',
    rotulo: 'Un',
    alinhamento: 'esquerda',
    visivel: true,
    valor: (i) => i.uCom,
    ordenacao: 'texto',
  },
  {
    id: 'qtd',
    rotulo: 'Qtd',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.quantidade(i.qCom),
    ordenacao: 'numero',
    chave: (i) => i.qCom,
  },
  {
    id: 'vUnit',
    rotulo: 'V. Unit',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valorUnitario(i.vUnCom),
    ordenacao: 'numero',
    chave: (i) => i.vUnCom,
  },
  {
    id: 'vTotal',
    rotulo: 'V. Total',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valor(i.vProd),
    ordenacao: 'numero',
    chave: (i) => i.vProd,
  },
  {
    id: 'ipi',
    rotulo: 'IPI',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valor(i.vIPI),
    ordenacao: 'numero',
    chave: (i) => i.vIPI,
  },
  {
    id: 'icms',
    rotulo: 'ICMS',
    alinhamento: 'direita',
    visivel: true,
    valor: (i) => f.valor(i.vICMS),
    ordenacao: 'numero',
    chave: (i) => i.vICMS,
  },
  {
    id: 'ean',
    rotulo: 'EAN',
    alinhamento: 'esquerda',
    visivel: false,
    valor: (i) => i.cEAN,
    ordenacao: 'texto',
  },
];
