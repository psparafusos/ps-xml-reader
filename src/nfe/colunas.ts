// Colunas da tabela de itens. COLUNAS_ITENS é a ordem e a visibilidade
// padrão; a tabela segue a configuração do usuário (nfe/config.ts), que diz
// a ordem, quais aparecem e as anotações extras (colunasDaConfig).

import { ID_CODIGO_CASA, TITULO_CODIGO_CASA } from '../cadastro/codigoCasa';
import type { ConfigConferencia, LarguraAnotacao } from './config';
import type { Item } from './tipos';
import * as f from './formato';
import {
  CATALOGO,
  campoDoCatalogo,
  caminhosPresentes,
  formatarValor,
  PREFIXO_XML,
  rotuloDoCaminho,
  SEPARADOR_OCORRENCIAS,
  valoresDoCampo,
  type IdGrupo,
  type TipoCampo,
} from './catalogo';

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
  ordenacao: 'texto' | 'numero' | 'data' | 'auto';
  /** Valor bruto para ordenar; sem ele, ordena pelo texto da célula. */
  chave?: (i: Item) => string;
  /** Coluna de anotação (a original ou uma extra): a célula é um campo de texto. */
  anotacao?: boolean;
  /** Largura da caixa, só nas colunas de anotação. */
  largura?: LarguraAnotacao;
  /** Caminhos do campo no XML (nfe/catalogo.ts); sem eles, não é do XML. */
  caminhos?: string[];
  /** Nome amigável no editor (o rótulo é o título curto da coluna). */
  nome?: string;
  /** Nome técnico (tag) e onde fica, para o editor. */
  tecnico?: string;
  local?: string;
  grupo?: IdGrupo;
  /** Campo do XML que não está no catálogo (vale só para a nota aberta). */
  foraDoCatalogo?: boolean;
  /**
   * Coluna que vem do cadastro do sistema de gestão (Código da casa): sem
   * cadastro carregado, fica apagada no editor e escondida na tabela.
   */
  doCadastro?: boolean;
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
    // Texto da célula, ordenação e impressão vêm do renderer (o estado do
    // código da casa da nota aberta); aqui fica vazio.
    id: ID_CODIGO_CASA,
    rotulo: TITULO_CODIGO_CASA,
    alinhamento: 'esquerda',
    visivel: false,
    valor: () => '',
    ordenacao: 'texto',
    nome: TITULO_CODIGO_CASA,
    tecnico: 'cadastro do sistema de gestão',
    grupo: 'cadastro',
    doCadastro: true,
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
  {
    id: 'pedido',
    rotulo: 'Pedido',
    alinhamento: 'esquerda',
    visivel: false,
    valor: (i) => i.xPed,
    ordenacao: 'texto',
  },
  {
    id: 'ibs',
    rotulo: 'IBS',
    alinhamento: 'direita',
    visivel: false,
    valor: (i) => f.valor(i.vIBS),
    ordenacao: 'numero',
    chave: (i) => i.vIBS,
  },
  {
    id: 'cbs',
    rotulo: 'CBS',
    alinhamento: 'direita',
    visivel: false,
    valor: (i) => f.valor(i.vCBS),
    ordenacao: 'numero',
    chave: (i) => i.vCBS,
  },
];

const ORDENACAO_DO_TIPO: Record<TipoCampo, ColunaItem['ordenacao']> = {
  texto: 'texto',
  numero: 'numero',
  dinheiro: 'numero',
  porcentagem: 'numero',
  data: 'data',
};

/** Coluna de um campo do catálogo (nfe/catalogo.ts). */
function colunaDoCampo(id: string): ColunaItem | undefined {
  const c = campoDoCatalogo(id);
  if (!c) return undefined;
  const valores = (i: Item) => valoresDoCampo(i.campos, c.caminhos);
  const antiga = COLUNAS_ITENS.find((x) => x.id === id);
  const info = {
    caminhos: c.caminhos,
    nome: c.nome,
    tecnico: c.tecnico,
    local: c.local,
    grupo: c.grupo,
  };
  // As colunas de antes continuam com a célula e o título de sempre.
  if (antiga) return { ...antiga, ...info };
  return {
    id,
    rotulo: c.rotulo,
    alinhamento:
      c.tipo === 'texto' || c.tipo === 'data' ? 'esquerda' : 'direita',
    visivel: false,
    valor: (i) =>
      valores(i)
        .map((v) => formatarValor(v, c.tipo, c.significados))
        .join(SEPARADOR_OCORRENCIAS),
    ordenacao: ORDENACAO_DO_TIPO[c.tipo],
    chave: (i) => valores(i)[0] ?? '',
    ...info,
  };
}

/**
 * Coluna de um campo do XML que não está no catálogo ("xml:" + caminho).
 * Ordena pelo que os valores parecem (número, data ou texto; nfe/ordem.ts).
 */
function colunaForaDoCatalogo(id: string): ColunaItem {
  const caminho = id.slice(PREFIXO_XML.length);
  const partes = caminho.split('/');
  const tag = partes[partes.length - 1];
  const valores = (i: Item) => i.campos?.[caminho] ?? [];
  return {
    id,
    rotulo: rotuloDoCaminho(caminho),
    alinhamento: 'esquerda',
    visivel: false,
    valor: (i) =>
      valores(i)
        .map((v) => formatarValor(v, 'auto'))
        .join(SEPARADOR_OCORRENCIAS),
    ordenacao: 'auto',
    chave: (i) => valores(i)[0] ?? '',
    caminhos: [caminho],
    nome: rotuloDoCaminho(caminho),
    tecnico: tag,
    local:
      partes
        .slice(0, -1)
        .join('/')
        .replace(/^imposto\//, '') || 'det',
    grupo: 'outros',
    foraDoCatalogo: true,
  };
}

/** A coluna com este id (antiga, do catálogo ou do XML), sem a configuração. */
export function colunaPorId(id: string): ColunaItem | undefined {
  if (campoDoCatalogo(id)) return colunaDoCampo(id);
  const antiga = COLUNAS_ITENS.find((c) => c.id === id);
  if (antiga) return antiga;
  if (id.startsWith(PREFIXO_XML) && id.length > PREFIXO_XML.length)
    return colunaForaDoCatalogo(id);
  return undefined;
}

/** Todas as colunas do catálogo (as antigas com o id antigo), na ordem dele. */
export function colunasDoCatalogo(): ColunaItem[] {
  return CATALOGO.map((c) => colunaDoCampo(c.id)).filter((c): c is ColunaItem =>
    Boolean(c),
  );
}

/**
 * Todas as colunas na ordem da configuração, com a visibilidade dela. As
 * anotações extras viram colunas de anotação com o título como rótulo.
 */
export function colunasDaConfig(config: ConfigConferencia): ColunaItem[] {
  const anotacoes = new Map(config.anotacoes.map((a) => [a.id, a]));
  const colunas: ColunaItem[] = [];
  for (const c of config.colunas) {
    const a = anotacoes.get(c.id);
    const coluna: ColunaItem | undefined = a
      ? {
          id: a.id,
          rotulo: a.titulo,
          alinhamento: 'esquerda',
          visivel: true,
          valor: () => '',
          ordenacao: 'texto',
          anotacao: true,
        }
      : colunaPorId(c.id);
    if (!coluna) continue;
    colunas.push({
      ...coluna,
      visivel: c.visivel,
      ...(coluna.anotacao ? { largura: c.largura ?? 'automatica' } : {}),
    });
  }
  return colunas;
}

/**
 * true se a coluna existe nestes itens: as que não são do XML (Nº e
 * anotações) sempre; as do XML, se algum item tem o campo. Sem a lista
 * dos campos (null: itens de exemplo), todas existem. A do cadastro (Código
 * da casa) só existe com o cadastro carregado.
 */
export function colunaExiste(
  c: ColunaItem,
  presentes: Set<string> | null,
  comCadastro = false,
): boolean {
  if (c.doCadastro) return comCadastro;
  if (!presentes || !c.caminhos) return true;
  return c.caminhos.some((k) => presentes.has(k));
}

/**
 * As colunas da configuração para a nota aberta: uma coluna ligada cujo
 * campo não existe em nenhum item da nota fica escondida (não aparece na
 * tabela, na impressão nem no PDF). No perfil ela continua ligada e na
 * posição escolhida, e volta na próxima nota que tiver o campo.
 */
export function colunasDaNota(
  config: ConfigConferencia,
  itens: readonly Item[] | null | undefined,
  comCadastro = false,
): ColunaItem[] {
  const presentes = itens ? caminhosPresentes(itens) : null;
  return colunasDaConfig(config).map((c) =>
    c.visivel && !colunaExiste(c, presentes, comCadastro)
      ? { ...c, visivel: false }
      : c,
  );
}

/** Classes da célula: id, alinhamento e, na anotação, a largura escolhida. */
export function classeColuna(c: ColunaItem): string {
  // Campo do XML: o id tem ":" e "/", que não servem em classe.
  const classes = [
    c.id.startsWith(PREFIXO_XML)
      ? `col-xml col-xml-${c.id.slice(PREFIXO_XML.length).replace(/[^A-Za-z0-9_-]/g, '-')}`
      : `col-${c.id}`,
  ];
  if (c.alinhamento === 'direita') classes.push('num');
  if (c.anotacao)
    classes.push(
      'coluna-anotacao',
      `coluna-anotacao--${c.largura ?? 'automatica'}`,
    );
  return classes.join(' ');
}
