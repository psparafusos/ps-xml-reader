// Perfis de configuração da Conferência. Um perfil guarda as colunas, as
// anotações extras, a orientação da folha e o layout dos blocos (o layout é
// reservado para os blocos como widgets). Um perfil fica ativo para o app
// inteiro. Lógica pura (sem Electron, sem DOM): o processo principal usa para
// o config.json e para os arquivos exportados e importados.
//
// No config.json, chave "perfis":
//   versao        1. Versão maior que esta é recusada.
//   ativo         id do perfil em uso
//   lista         [{ id, nome, colunas, anotacoes, orientacao, layout }]
//   fornecedores  reservado para a configuração por fornecedor: sempre {}
//
// Arquivo de um perfil ("PS Reader - perfil <nome>.json"):
//   { tipo: "perfil-ps-reader", versao: 1, nome, colunas, anotacoes,
//     orientacao, layout }
//
// A configuração da Parte A (chave "conferencia" do config.json, e o arquivo
// "PS Reader - configuracao.json") vira um perfil: na migração, com o nome
// do usuário do Windows; na importação, "Configuração importada".

import {
  ConfigInvalidaError,
  configPadrao,
  validarConfig,
  type ConfigConferencia,
} from './config';

export const VERSAO_PERFIS = 1;
export const VERSAO_ARQUIVO_PERFIL = 1;
export const TIPO_ARQUIVO_PERFIL = 'perfil-ps-reader';
export const LIMITE_NOME_PERFIL = 40;
/** Nome do perfil vindo de um arquivo de configuração da Parte A. */
export const NOME_IMPORTADO = 'Configuração importada';
/** Nome quando o nome do usuário do Windows não está disponível. */
export const NOME_PADRAO = 'Meu perfil';

export interface Perfil {
  id: string;
  nome: string;
  /** Colunas, anotações extras, orientação e layout (ConfigConferencia). */
  config: ConfigConferencia;
}

export interface Perfis {
  versao: typeof VERSAO_PERFIS;
  ativo: string;
  lista: Perfil[];
  fornecedores: Record<string, never>;
}

/** O que as regras de nome precisam de cada perfil. */
export type NomePerfil = Pick<Perfil, 'id' | 'nome'>;

/** Perfil que vem de um arquivo importado (ainda sem id). */
export interface PerfilImportado {
  nome: string;
  config: ConfigConferencia;
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function falha(motivo: string): never {
  throw new ConfigInvalidaError(motivo);
}

/** Id novo, que não está em `perfis`. */
export function novoIdPerfil(perfis: NomePerfil[]): string {
  for (;;) {
    const id = `p-${Math.random().toString(36).slice(2, 8)}`;
    if (!perfis.some((p) => p.id === id)) return id;
  }
}

/** Nome sem acento e em minúsculas, para comparar nomes repetidos. */
const chaveNome = (nome: string) =>
  nome
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** O perfil com este nome (sem contar acento e maiúscula), se houver. */
export function perfilComNome<T extends NomePerfil>(
  nome: string,
  perfis: T[],
  ignorarId?: string,
): T | null {
  const chave = chaveNome(nome);
  return (
    perfis.find((p) => p.id !== ignorarId && chaveNome(p.nome) === chave) ??
    null
  );
}

/**
 * Problema com o nome de um perfil, ou null se pode usar. `ignorarId`: o
 * próprio perfil, ao renomear.
 */
export function problemaNomePerfil(
  nome: string,
  perfis: NomePerfil[],
  ignorarId?: string,
): string | null {
  const n = nome.trim();
  if (!n) return 'Digite o nome do perfil.';
  if (n.length > LIMITE_NOME_PERFIL)
    return `O nome pode ter no máximo ${LIMITE_NOME_PERFIL} caracteres.`;
  if (perfilComNome(n, perfis, ignorarId))
    return 'Já existe um perfil com esse nome.';
  return null;
}

/** `nome` se estiver livre; senão "<nome> (2)", "<nome> (3)"... */
export function nomeLivre(nome: string, perfis: NomePerfil[]): string {
  if (!perfilComNome(nome, perfis)) return nome;
  for (let n = 2; ; n++) {
    const candidato = `${nome} (${n})`;
    if (!perfilComNome(candidato, perfis)) return candidato;
  }
}

/** O perfil ativo (o primeiro, se o id não existir mais). */
export function perfilAtivo(p: Perfis): Perfil {
  return p.lista.find((x) => x.id === p.ativo) ?? p.lista[0];
}

/** Conteúdo de um perfil validado pela mesma regra da configuração. */
function validarConteudo(o: Record<string, unknown>): ConfigConferencia {
  return validarConfig({
    versao: 1,
    colunas: o.colunas,
    anotacoes: o.anotacoes,
    layout: o.layout,
    orientacao: o.orientacao,
    fornecedores: {},
  });
}

/** O nome de um perfil num arquivo ou no config.json. */
function validarNome(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) falha('Um perfil está sem nome.');
  const nome = v.trim();
  if (nome.length > LIMITE_NOME_PERFIL)
    falha(
      `O nome do perfil pode ter no máximo ${LIMITE_NOME_PERFIL} caracteres.`,
    );
  return nome;
}

/**
 * Perfis guardados no config.json. Inválido lança ConfigInvalidaError (quem
 * lê cai na migração ou no padrão).
 */
export function validarPerfis(v: unknown): Perfis {
  if (!objeto(v) || typeof v.versao !== 'number')
    falha('Os perfis estão sem versão.');
  if (v.versao !== VERSAO_PERFIS)
    falha(`Versão de perfis desconhecida: ${v.versao}.`);
  if (!Array.isArray(v.lista) || v.lista.length === 0)
    falha('A lista de perfis está vazia.');
  const lista: Perfil[] = [];
  for (const p of v.lista) {
    if (!objeto(p) || typeof p.id !== 'string' || !p.id)
      falha('Um perfil está sem id.');
    const nome = validarNome(p.nome);
    if (lista.some((x) => x.id === p.id)) falha(`Perfil repetido: ${p.id}.`);
    if (perfilComNome(nome, lista)) falha(`Dois perfis com o nome "${nome}".`);
    lista.push({ id: p.id, nome, config: validarConteudo(p) });
  }
  const ativo =
    typeof v.ativo === 'string' && lista.some((p) => p.id === v.ativo)
      ? v.ativo
      : lista[0].id;
  return { versao: VERSAO_PERFIS, ativo, lista, fornecedores: {} };
}

/**
 * Primeira lista de perfis, a partir da configuração da Parte A (chave
 * "conferencia"): ela vira o único perfil, com o nome do usuário do Windows.
 * Sem configuração, ou com uma inválida: o padrão.
 */
export function migrarParaPerfis(
  conferencia: unknown,
  nomeUsuario: string,
): Perfis {
  let config: ConfigConferencia;
  try {
    config =
      conferencia === undefined ? configPadrao() : validarConfig(conferencia);
  } catch {
    config = configPadrao();
  }
  const nome = nomeUsuario.trim().slice(0, LIMITE_NOME_PERFIL) || NOME_PADRAO;
  const id = novoIdPerfil([]);
  return {
    versao: VERSAO_PERFIS,
    ativo: id,
    lista: [{ id, nome, config }],
    fornecedores: {},
  };
}

/** Como os perfis vão para o config.json (sem os campos repetidos). */
export function perfisParaGravar(p: Perfis): Record<string, unknown> {
  return {
    versao: p.versao,
    ativo: p.ativo,
    lista: p.lista.map((x) => ({
      id: x.id,
      nome: x.nome,
      ...conteudo(x.config),
    })),
    fornecedores: p.fornecedores,
  };
}

const conteudo = (c: ConfigConferencia) => ({
  colunas: c.colunas,
  anotacoes: c.anotacoes,
  orientacao: c.orientacao,
  layout: c.layout,
});

/** Texto do arquivo exportado de um perfil. */
export function textoArquivoPerfil(p: Perfil): string {
  const arquivo = {
    tipo: TIPO_ARQUIVO_PERFIL,
    versao: VERSAO_ARQUIVO_PERFIL,
    nome: p.nome,
    ...conteudo(p.config),
  };
  return `${JSON.stringify(arquivo, null, 2)}\n`;
}

/** Nome sugerido do arquivo exportado, sem caracteres que o Windows recusa. */
export function nomeArquivoPerfil(nome: string): string {
  // oxlint-disable-next-line no-control-regex -- caracteres de controle também são proibidos
  const limpo = nome.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim();
  return `PS Reader - perfil ${limpo.replace(/[. ]+$/, '') || 'sem nome'}.json`;
}

/**
 * Lê um arquivo importado: um perfil exportado, ou a configuração da Parte A
 * (vira o perfil "Configuração importada"). Valida o arquivo inteiro; lança
 * ConfigInvalidaError com o motivo.
 */
export function lerArquivoPerfil(texto: string): PerfilImportado {
  let v: unknown;
  try {
    v = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    falha('O arquivo não é um JSON válido.');
  }
  if (!objeto(v)) falha('O arquivo não é um perfil do PS Reader.');
  if (v.tipo === undefined && 'colunas' in v && 'versao' in v)
    return { nome: NOME_IMPORTADO, config: validarConfig(v) };
  if (v.tipo !== TIPO_ARQUIVO_PERFIL)
    falha('O arquivo não é um perfil do PS Reader.');
  if (typeof v.versao !== 'number' || !Number.isInteger(v.versao))
    falha('A versão do perfil é inválida.');
  if (v.versao > VERSAO_ARQUIVO_PERFIL)
    falha(
      `O perfil é da versão ${v.versao}, mais nova que esta versão do PS Reader (aceita até a ${VERSAO_ARQUIVO_PERFIL}). Atualize o app.`,
    );
  if (v.versao < 1) falha(`Versão de perfil desconhecida: ${v.versao}.`);
  return { nome: validarNome(v.nome), config: validarConteudo(v) };
}
