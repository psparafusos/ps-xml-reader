// Colunas da tabela de itens. COLUNAS_ITENS é a ordem e a visibilidade
// padrão; a tabela segue a configuração do usuário (nfe/config.ts), que diz
// a ordem, quais aparecem e as anotações extras (colunasDaConfig).

import type { ConfigConferencia, LarguraAnotacao } from './config';
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
  /** Coluna de anotação (a original ou uma extra): a célula é um campo de texto. */
  anotacao?: boolean;
  /** Largura da caixa, só nas colunas de anotação. */
  largura?: LarguraAnotacao;
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
    anotacao: true,
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

/**
 * Todas as colunas na ordem da configuração, com a visibilidade dela. As
 * anotações extras viram colunas de anotação com o título como rótulo.
 */
export function colunasDaConfig(config: ConfigConferencia): ColunaItem[] {
  const porId = new Map(COLUNAS_ITENS.map((c) => [c.id, c]));
  for (const a of config.anotacoes) {
    porId.set(a.id, {
      id: a.id,
      rotulo: a.titulo,
      alinhamento: 'esquerda',
      visivel: true,
      valor: () => '',
      ordenacao: 'texto',
      anotacao: true,
    });
  }
  const colunas: ColunaItem[] = [];
  for (const c of config.colunas) {
    const coluna = porId.get(c.id);
    if (!coluna) continue;
    colunas.push({
      ...coluna,
      visivel: c.visivel,
      ...(coluna.anotacao ? { largura: c.largura ?? 'media' } : {}),
    });
  }
  return colunas;
}

/** Classes da célula: id, alinhamento e, na anotação, a largura escolhida. */
export function classeColuna(c: ColunaItem): string {
  const classes = [`col-${c.id}`];
  if (c.alinhamento === 'direita') classes.push('num');
  if (c.anotacao)
    classes.push('coluna-anotacao', `coluna-anotacao--${c.largura ?? 'media'}`);
  return classes.join(' ');
}

/** Largura da caixa de anotação na folha A4, em mm, por tamanho. */
const LARGURA_PRINT_MM: Record<LarguraAnotacao, number> = {
  estreita: 15,
  media: 30,
  larga: 45,
};

/**
 * Espaço máximo das caixas de anotação somadas na folha A4 retrato (190 mm
 * úteis), para sobrar lugar para as outras colunas.
 */
const ESPACO_ANOTACOES_PRINT_MM = 80;

/**
 * Largura da caixa de cada coluna de anotação visível na folha, em mm: a do
 * tamanho escolhido, reduzida na mesma proporção para todas quando a soma
 * passa do espaço disponível.
 */
export function largurasAnotacaoPrint(
  colunas: ColunaItem[],
): Map<string, number> {
  const anotacoes = colunas.filter((c) => c.visivel && c.anotacao);
  const mm = (c: ColunaItem) => LARGURA_PRINT_MM[c.largura ?? 'media'];
  const soma = anotacoes.reduce((t, c) => t + mm(c), 0);
  const escala =
    soma > ESPACO_ANOTACOES_PRINT_MM ? ESPACO_ANOTACOES_PRINT_MM / soma : 1;
  return new Map(
    anotacoes.map((c) => [c.id, Math.round(mm(c) * escala * 10) / 10]),
  );
}
