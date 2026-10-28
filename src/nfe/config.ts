// Personalização do modo Conferência: colunas da tabela de itens, anotações
// extras e layout dos blocos. Lógica pura (sem Electron, sem DOM): o processo
// principal usa para validar o config.json e o arquivo importado; o renderer
// usa para montar a tabela e o editor de colunas.
//
// Formato (JSON):
//   versao        1. Arquivo de versão maior que esta é recusado.
//   colunas       todas as colunas, na ordem da tabela: { id, visivel }
//   anotacoes     anotações extras criadas pelo usuário: { id, titulo }
//   layout        blocos da conferência: { blocos: [{ id, visivel, largura }] }
//   fornecedores  reservado para a configuração por fornecedor (raiz de 8
//                 dígitos do CNPJ). Nesta versão fica sempre {}.

import { COLUNAS_ITENS, ID_ANOTACAO } from './colunas';

export const VERSAO_CONFIG = 1;

/** Nome sugerido ao exportar. */
export const NOME_EXPORTACAO = 'PS Reader - configuracao.json';

export interface ColunaConfig {
  id: string;
  visivel: boolean;
  /** Só nas colunas de anotação; sem o campo, 'media'. */
  largura?: LarguraAnotacao;
}

/** Larguras da caixa de anotação (tela, prévia, impressão e PDF). */
export const LARGURAS_ANOTACAO = ['estreita', 'media', 'larga'] as const;
export type LarguraAnotacao = (typeof LARGURAS_ANOTACAO)[number];

export const ROTULO_LARGURA: Record<LarguraAnotacao, string> = {
  estreita: 'Estreita',
  media: 'Média',
  larga: 'Larga',
};

export interface AnotacaoExtra {
  /** "anotacao-" + título sem acento, em minúsculas e com hífens. */
  id: string;
  titulo: string;
}

export interface BlocoLayout {
  id: IdBloco;
  visivel: boolean;
  /** Colunas ocupadas na grade de 12. */
  largura: number;
}

export interface ConfigConferencia {
  versao: typeof VERSAO_CONFIG;
  colunas: ColunaConfig[];
  anotacoes: AnotacaoExtra[];
  layout: { blocos: BlocoLayout[] };
  fornecedores: Record<string, never>;
}

/** Blocos da conferência, na ordem padrão. Itens não pode ser removido. */
export const BLOCOS = [
  'emitente',
  'destinatario',
  'dados',
  'itens',
  'totais',
  'transporte',
  'duplicatas',
  'adicionais',
] as const;

export type IdBloco = (typeof BLOCOS)[number];

export const COLUNAS_GRADE = 12;
export const LARGURA_MINIMA_BLOCO = 3;

const LARGURA_PADRAO: Record<IdBloco, number> = {
  emitente: 6,
  destinatario: 6,
  dados: 12,
  itens: 12,
  totais: 12,
  transporte: 12,
  duplicatas: 12,
  adicionais: 12,
};

/** Três anotações prontas, adicionadas com um clique no editor de colunas. */
export const ANOTACOES_PRONTAS = [
  'CFOP de entrada',
  'Qtd recebida',
  'Observação',
];

export const LIMITE_TITULO = 40;
export const LIMITE_ANOTACOES = 10;

const PREFIXO_ANOTACAO = 'anotacao-';
const ID_ANOTACAO_VALIDO = /^anotacao-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function configPadrao(): ConfigConferencia {
  return {
    versao: VERSAO_CONFIG,
    colunas: COLUNAS_ITENS.map((c) => ({ id: c.id, visivel: c.visivel })),
    anotacoes: [],
    layout: {
      blocos: BLOCOS.map((id) => ({
        id,
        visivel: true,
        largura: LARGURA_PADRAO[id],
      })),
    },
    fornecedores: {},
  };
}

/** Título sem acento, minúsculo, só letras e números unidos por hífen. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Id de uma anotação extra a partir do título. O mesmo título (sem contar
 * acento, maiúscula e pontuação) dá sempre o mesmo id: recriar a coluna com
 * o mesmo título traz de volta o texto guardado no .psxml.
 */
export function idDaAnotacao(titulo: string): string {
  return `${PREFIXO_ANOTACAO}${semAcento(titulo)}`;
}

/**
 * Problema com o título de uma nova anotação extra, ou null se pode criar.
 * Repetido: igual (sem contar acento, maiúscula e pontuação) ao rótulo de
 * outra coluna ou ao título de outra anotação.
 */
export function problemaTitulo(
  titulo: string,
  anotacoes: AnotacaoExtra[],
): string | null {
  const t = titulo.trim();
  if (!t) return 'Digite o título da anotação.';
  if (t.length > LIMITE_TITULO)
    return `O título pode ter no máximo ${LIMITE_TITULO} caracteres.`;
  const chave = semAcento(t);
  if (!chave) return 'O título precisa ter letras ou números.';
  const existentes = [
    ...COLUNAS_ITENS.map((c) => c.rotulo),
    ...anotacoes.map((a) => a.titulo),
  ];
  if (existentes.some((e) => semAcento(e) === chave))
    return 'Já existe uma coluna com esse título.';
  if (anotacoes.length >= LIMITE_ANOTACOES)
    return `São no máximo ${LIMITE_ANOTACOES} anotações extras.`;
  return null;
}

// ---------- validação ----------

export class ConfigInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ConfigInvalidaError';
  }
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function falha(motivo: string): never {
  throw new ConfigInvalidaError(motivo);
}

function validarAnotacoes(v: unknown): AnotacaoExtra[] {
  if (!Array.isArray(v)) falha('A lista de anotações extras está faltando.');
  if (v.length > LIMITE_ANOTACOES)
    falha(`São no máximo ${LIMITE_ANOTACOES} anotações extras.`);
  const lidas: AnotacaoExtra[] = [];
  for (const a of v) {
    if (!objeto(a) || typeof a.id !== 'string' || typeof a.titulo !== 'string')
      falha('Uma anotação extra está sem id ou sem título.');
    const titulo = a.titulo.trim();
    if (!ID_ANOTACAO_VALIDO.test(a.id) || a.id !== idDaAnotacao(titulo))
      falha(`O id da anotação "${titulo}" não confere com o título.`);
    const problema = problemaTitulo(titulo, lidas);
    if (problema) falha(`Anotação "${titulo}": ${problema}`);
    lidas.push({ id: a.id, titulo });
  }
  return lidas;
}

function validarColunas(
  v: unknown,
  anotacoes: AnotacaoExtra[],
): ColunaConfig[] {
  if (!Array.isArray(v)) falha('A lista de colunas está faltando.');
  const conhecidas = new Set([
    ...COLUNAS_ITENS.map((c) => c.id),
    ...anotacoes.map((a) => a.id),
  ]);
  const vistas = new Set<string>();
  const colunas: ColunaConfig[] = [];
  for (const c of v) {
    if (
      !objeto(c) ||
      typeof c.id !== 'string' ||
      typeof c.visivel !== 'boolean'
    )
      falha('Uma coluna está sem id ou sem a marca de visível.');
    if (!conhecidas.has(c.id)) falha(`Coluna desconhecida: ${c.id}.`);
    if (vistas.has(c.id)) falha(`A coluna ${c.id} aparece duas vezes.`);
    vistas.add(c.id);
    if (c.largura === undefined) {
      colunas.push({ id: c.id, visivel: c.visivel });
      continue;
    }
    if (!ehColunaAnotacao(c.id))
      falha(`A coluna ${c.id} não é de anotação e não tem largura.`);
    if (!(LARGURAS_ANOTACAO as readonly unknown[]).includes(c.largura))
      falha(
        `A largura da coluna ${c.id} precisa ser ${LARGURAS_ANOTACAO.join(', ')}.`,
      );
    colunas.push({
      id: c.id,
      visivel: c.visivel,
      largura: c.largura as LarguraAnotacao,
    });
  }
  // Coluna que faltou (por exemplo, de uma versão mais nova do app): entra no
  // fim, com a visibilidade padrão.
  for (const c of COLUNAS_ITENS)
    if (!vistas.has(c.id)) colunas.push({ id: c.id, visivel: c.visivel });
  for (const a of anotacoes)
    if (!vistas.has(a.id)) colunas.push({ id: a.id, visivel: true });
  return colunas;
}

function validarLayout(v: unknown): { blocos: BlocoLayout[] } {
  if (!objeto(v) || !Array.isArray(v.blocos))
    falha('O layout dos blocos está faltando.');
  const vistos = new Set<string>();
  const blocos: BlocoLayout[] = [];
  for (const b of v.blocos) {
    if (
      !objeto(b) ||
      typeof b.id !== 'string' ||
      typeof b.visivel !== 'boolean' ||
      typeof b.largura !== 'number'
    )
      falha('Um bloco do layout está incompleto.');
    if (!(BLOCOS as readonly string[]).includes(b.id))
      falha(`Bloco desconhecido: ${b.id}.`);
    if (vistos.has(b.id)) falha(`O bloco ${b.id} aparece duas vezes.`);
    if (
      !Number.isInteger(b.largura) ||
      b.largura < LARGURA_MINIMA_BLOCO ||
      b.largura > COLUNAS_GRADE
    )
      falha(
        `A largura do bloco ${b.id} precisa ser de ${LARGURA_MINIMA_BLOCO} a ${COLUNAS_GRADE} colunas.`,
      );
    if (b.id === 'itens' && !b.visivel)
      falha('O bloco de itens não pode ser removido.');
    vistos.add(b.id);
    blocos.push({
      id: b.id as IdBloco,
      visivel: b.visivel,
      largura: b.largura,
    });
  }
  for (const id of BLOCOS)
    if (!vistos.has(id))
      blocos.push({ id, visivel: true, largura: LARGURA_PADRAO[id] });
  return { blocos };
}

/**
 * Migra de versões antigas para a atual. Hoje só existe a versão 1; uma
 * versão nova acrescenta aqui o passo dela (de n para n + 1).
 */
function migrar(o: Record<string, unknown>): Record<string, unknown> {
  return o;
}

/**
 * Valida a configuração inteira e devolve uma cópia limpa (sem chaves
 * desconhecidas). Lança ConfigInvalidaError com o motivo, em português.
 */
export function validarConfig(v: unknown): ConfigConferencia {
  if (!objeto(v) || !('versao' in v))
    falha('O arquivo não é uma configuração do PS Reader.');
  if (typeof v.versao !== 'number' || !Number.isInteger(v.versao))
    falha('A versão da configuração é inválida.');
  if (v.versao > VERSAO_CONFIG)
    falha(
      `A configuração é da versão ${v.versao}, mais nova que esta versão do PS Reader (aceita até a ${VERSAO_CONFIG}). Atualize o app.`,
    );
  if (v.versao < 1) falha(`Versão de configuração desconhecida: ${v.versao}.`);
  const o = migrar(v);
  if (!objeto(o.fornecedores)) falha('A seção de fornecedores está faltando.');
  const anotacoes = validarAnotacoes(o.anotacoes);
  return {
    versao: VERSAO_CONFIG,
    colunas: validarColunas(o.colunas, anotacoes),
    anotacoes,
    layout: validarLayout(o.layout),
    // Reservado para a configuração por fornecedor: nesta versão não é lido.
    fornecedores: {},
  };
}

/** Configuração a partir do texto de um arquivo .json. */
export function lerConfigTexto(texto: string): ConfigConferencia {
  let v: unknown;
  try {
    v = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    falha('O arquivo não é um JSON válido.');
  }
  return validarConfig(v);
}

/** Texto do arquivo exportado. */
export function textoConfig(c: ConfigConferencia): string {
  return `${JSON.stringify(c, null, 2)}\n`;
}

/** true se a coluna com este id é de anotação (a original ou uma extra). */
export function ehColunaAnotacao(id: string): boolean {
  return id === ID_ANOTACAO || id.startsWith(PREFIXO_ANOTACAO);
}
