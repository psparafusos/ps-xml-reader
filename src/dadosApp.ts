// Dados que o app guarda na pasta de dados (app.getPath('userData')) e o
// backup deles. Sem Electron: o processo principal passa a pasta, e os
// testes usam uma pasta temporária.
//
// Arquivo de backup (.psbackup, JSON):
//   { formato: "ps-reader-backup", versao: 1, criadoEm, versaoApp,
//     config,         o config.json inteiro (pasta de destino, CNPJ, avisos,
//                     perfis, ferramentas por perfil, notas recentes, janela)
//     preferencias,   documentos/preferencias.json, ou null se não havia
//     decisoes }      documentos/decisoes.json, ou null se não havia
// Os documentos fiscais (planilha de ST, TIPI, combustíveis) ficam de fora:
// são públicos e se baixam ou carregam de novo.
//
// Importar valida o arquivo inteiro antes de mexer em qualquer coisa; aí
// copia os três arquivos atuais para "antes-da-importacao-<data>", dentro da
// pasta de dados, e só então grava as partes que vieram no backup (a que não
// veio fica como está; nunca apaga).

import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { lerDecisoes } from './fiscal/entrada';
import { cnpjDaConfig, diasDaConfig } from './nfe/avisos';
import { validarFerramentasPorPerfil } from './nfe/ferramentasPerfil';
import { validarPerfis } from './nfe/perfis';
import { lerRecentes } from './nfe/recentes';

export const FORMATO_BACKUP = 'ps-reader-backup';
export const VERSAO_BACKUP = 1;
export const EXTENSAO_BACKUP = 'psbackup';
export const PREFIXO_ANTES = 'antes-da-importacao-';
/** Quantas pastas "antes-da-importacao-<data>" ficam guardadas (as mais novas). */
export const LIMITE_PASTAS_ANTES = 3;
/** Maior .psbackup aceito: um backup de verdade tem poucas dezenas de KB. */
export const LIMITE_BACKUP_BYTES = 5 * 1024 * 1024;

/**
 * Chaves do config.json que o backup traz. As outras são deste computador e
 * ficam como estão na importação: pastaDestino, ultimaPastaAbertura e
 * notasRecentes (caminhos de outro PC), janela (posição na tela) e
 * conferencia (configuração antiga, já migrada para os perfis).
 */
export const CHAVES_IMPORTADAS = [
  'perfis',
  'ferramentasPerfis',
  'cnpjEmpresa',
  'diasAvisoVencimento',
  'diasNotaAntiga',
] as const;

/** Os arquivos que entram no backup, relativos à pasta de dados. */
export const ARQ_CONFIG = 'config.json';
export const ARQ_PREFERENCIAS = path.join('documentos', 'preferencias.json');
export const ARQ_DECISOES = path.join('documentos', 'decisoes.json');

export interface Backup {
  formato: typeof FORMATO_BACKUP;
  versao: typeof VERSAO_BACKUP;
  criadoEm: string;
  versaoApp: string;
  config: Record<string, unknown>;
  preferencias: Record<string, unknown> | null;
  decisoes: Record<string, unknown> | null;
}

export class BackupInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'BackupInvalidoError';
  }
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function falha(motivo: string): never {
  throw new BackupInvalidoError(motivo);
}

async function lerJson(caminho: string): Promise<unknown> {
  try {
    return JSON.parse((await readFile(caminho, 'utf8')).replace(/^﻿/, ''));
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw erro;
  }
}

// ---------- o que o app guarda ----------

export interface ItemDadosApp {
  /** Caminho relativo à pasta de dados ("documentos\\decisoes.json"). */
  nome: string;
  /** O que é, em português. */
  oQueE: string;
  /** Bytes; para uma pasta, a soma dos arquivos dela. */
  tamanho: number;
  /** ISO 8601 da última mudança. */
  modificadoEm: string;
  /** Entra no backup. */
  noBackup: boolean;
  /** Parte de um arquivo (os perfis ficam dentro do config.json). */
  parteDe?: string;
}

const DESCRICAO_DOCUMENTO: Record<string, string> = {
  st: 'planilha de ST',
  tipi: 'TIPI',
  combustiveis: 'planilha de combustíveis (Apêndice XIV)',
};

/** Descrição de um arquivo da pasta "documentos". */
function oQueEDocumento(nome: string): string {
  if (nome === 'preferencias.json')
    return 'Preferências: verificação online e "verificar ao abrir".';
  if (nome === 'decisoes.json')
    return 'Decisões lembradas da ferramenta "ST, MVA e CFOP".';
  const m = /^(st|tipi|combustiveis)(-info|-leitura)?\.json$/.exec(nome);
  if (m) {
    const doc = DESCRICAO_DOCUMENTO[m[1]];
    if (m[2] === '-info') return `Documento lido: ${doc}, dados da importação.`;
    if (m[2] === '-leitura')
      return `Documento lido: ${doc}, relatório da leitura.`;
    return `Documento lido: ${doc}, já convertida para o app.`;
  }
  return 'Arquivo de apoio dos documentos de referência.';
}

async function tamanhoPasta(
  p: string,
): Promise<{ bytes: number; mtime: number }> {
  let bytes = 0;
  let mtime = 0;
  for (const e of await readdir(p, { withFileTypes: true })) {
    const c = path.join(p, e.name);
    if (e.isDirectory()) {
      const s = await tamanhoPasta(c);
      bytes += s.bytes;
      mtime = Math.max(mtime, s.mtime);
    } else if (e.isFile()) {
      const s = await stat(c);
      bytes += s.size;
      mtime = Math.max(mtime, s.mtimeMs);
    }
  }
  return { bytes, mtime };
}

/**
 * Cada arquivo que o app guarda, com o que é, o tamanho e a data. As pastas
 * do Chromium (cache, armazenamento local) ficam de fora: são do Electron,
 * não do PS Reader.
 */
export async function listarDadosApp(pasta: string): Promise<ItemDadosApp[]> {
  const itens: ItemDadosApp[] = [];
  const arquivo = async (
    rel: string,
    oQueE: string,
    noBackup: boolean,
  ): Promise<void> => {
    try {
      const s = await stat(path.join(pasta, rel));
      if (!s.isFile()) return;
      itens.push({
        nome: rel,
        oQueE,
        tamanho: s.size,
        modificadoEm: s.mtime.toISOString(),
        noBackup,
      });
    } catch {
      // Ainda não existe: fica de fora.
    }
  };
  await arquivo(
    ARQ_CONFIG,
    'Configuração: pasta de destino, CNPJ da empresa, dias dos avisos, notas recentes e posição da janela.',
    true,
  );
  // Os perfis moram dentro do config.json: uma linha própria, com o tamanho
  // do trecho deles.
  const config = await lerJson(path.join(pasta, ARQ_CONFIG)).catch(
    () => undefined,
  );
  if (objeto(config) && config.perfis !== undefined) {
    const lista =
      objeto(config.perfis) && Array.isArray(config.perfis.lista)
        ? config.perfis.lista.length
        : 0;
    const trecho = JSON.stringify(
      { perfis: config.perfis, ferramentasPerfis: config.ferramentasPerfis },
      null,
      2,
    );
    const s = await stat(path.join(pasta, ARQ_CONFIG));
    itens.push({
      nome: `${ARQ_CONFIG} (perfis)`,
      oQueE: `Perfis de colunas (${lista} ${lista === 1 ? 'perfil' : 'perfis'}) e as ferramentas de cada um.`,
      tamanho: Buffer.byteLength(trecho, 'utf8'),
      modificadoEm: s.mtime.toISOString(),
      noBackup: true,
      parteDe: ARQ_CONFIG,
    });
  }
  const pastaDocs = path.join(pasta, 'documentos');
  let nomes: string[] = [];
  try {
    nomes = (await readdir(pastaDocs, { withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.endsWith('.novo'))
      .map((e) => e.name)
      .sort((a, b) => {
        // Preferências e decisões primeiro, depois os documentos lidos.
        const peso = (n: string) =>
          n === 'preferencias.json' ? 0 : n === 'decisoes.json' ? 1 : 2;
        return peso(a) - peso(b) || a.localeCompare(b);
      });
  } catch {
    // Sem a pasta: nenhum documento.
  }
  for (const n of nomes)
    await arquivo(
      path.join('documentos', n),
      oQueEDocumento(n),
      n === 'preferencias.json' || n === 'decisoes.json',
    );
  try {
    for (const e of await readdir(pasta, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith(PREFIXO_ANTES)) continue;
      const s = await tamanhoPasta(path.join(pasta, e.name));
      itens.push({
        nome: e.name,
        oQueE: 'Cópia dos dados de antes de uma importação de backup.',
        tamanho: s.bytes,
        modificadoEm: new Date(s.mtime).toISOString(),
        noBackup: false,
      });
    }
  } catch {
    // Pasta de dados ainda não existe.
  }
  return itens;
}

// ---------- exportar ----------

/** O backup dos dados atuais. */
export async function montarBackup(
  pasta: string,
  agora: Date,
  versaoApp: string,
): Promise<Backup> {
  const config = await lerJson(path.join(pasta, ARQ_CONFIG));
  const preferencias = await lerJson(path.join(pasta, ARQ_PREFERENCIAS));
  const decisoes = await lerJson(path.join(pasta, ARQ_DECISOES));
  return {
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    criadoEm: agora.toISOString(),
    versaoApp,
    config: objeto(config) ? config : {},
    preferencias: objeto(preferencias) ? preferencias : null,
    decisoes: objeto(decisoes) ? decisoes : null,
  };
}

export const textoBackup = (b: Backup) => `${JSON.stringify(b, null, 2)}\n`;

/** "PS Reader - backup 2026-11-06.psbackup". */
export function nomeArquivoBackup(agora: Date): string {
  return `PS Reader - backup ${carimboData(agora).slice(0, 10)}.${EXTENSAO_BACKUP}`;
}

// ---------- importar ----------

/**
 * Lê e valida um .psbackup inteiro. Lança BackupInvalidoError com o motivo,
 * em português; nada é gravado aqui.
 */
export function lerBackup(texto: string): Backup {
  let v: unknown;
  try {
    v = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    falha('O arquivo não é um backup do PS Reader (não é um JSON válido).');
  }
  if (!objeto(v) || v.formato !== FORMATO_BACKUP)
    falha('O arquivo não é um backup do PS Reader.');
  if (
    typeof v.versao !== 'number' ||
    !Number.isInteger(v.versao) ||
    v.versao < 1
  )
    falha('A versão do backup é inválida.');
  if (v.versao > VERSAO_BACKUP)
    falha(
      `O backup é da versão ${v.versao}, mais nova que esta versão do PS Reader (aceita até a ${VERSAO_BACKUP}). Atualize o app.`,
    );
  if (typeof v.criadoEm !== 'string' || Number.isNaN(Date.parse(v.criadoEm)))
    falha('O backup está sem a data em que foi criado.');
  if (!objeto(v.config)) falha('O backup está sem a configuração.');
  validarConfigBackup(v.config);
  const preferencias = v.preferencias ?? null;
  if (preferencias !== null) {
    if (!objeto(preferencias))
      falha('As preferências do backup são inválidas.');
    for (const k of ['verificacaoOnline', 'verificarAoAbrir'])
      if (k in preferencias && typeof preferencias[k] !== 'boolean')
        falha('As preferências do backup são inválidas.');
  }
  const decisoes = v.decisoes ?? null;
  if (decisoes !== null) {
    if (!objeto(decisoes) || !objeto(decisoes.decisoes))
      falha('As decisões lembradas do backup são inválidas.');
    const total = Object.keys(decisoes.decisoes).length;
    if (Object.keys(lerDecisoes(decisoes)).length !== total)
      falha('Uma das decisões lembradas do backup é inválida.');
  }
  return {
    formato: FORMATO_BACKUP,
    versao: VERSAO_BACKUP,
    criadoEm: v.criadoEm,
    versaoApp: typeof v.versaoApp === 'string' ? v.versaoApp : '',
    config: v.config,
    preferencias,
    decisoes,
  };
}

const motivo = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro);

/**
 * Cada parte da configuração passa pelo mesmo validador usado ao ler o
 * userData. Uma parte inválida recusa o backup inteiro.
 */
function validarConfigBackup(c: Record<string, unknown>): void {
  let idsPerfis: string[] = [];
  if (c.perfis !== undefined) {
    try {
      idsPerfis = validarPerfis(c.perfis).lista.map((p) => p.id);
    } catch (erro) {
      falha(`Os perfis do backup são inválidos: ${motivo(erro)}`);
    }
  }
  if (c.ferramentasPerfis !== undefined) {
    try {
      validarFerramentasPorPerfil(c.ferramentasPerfis, idsPerfis);
    } catch (erro) {
      falha(`As ferramentas do backup são inválidas: ${motivo(erro)}`);
    }
  }
  if (c.cnpjEmpresa !== undefined && cnpjDaConfig(c.cnpjEmpresa) === null)
    falha('O CNPJ da empresa do backup é inválido.');
  for (const k of ['diasAvisoVencimento', 'diasNotaAntiga'])
    if (c[k] !== undefined && diasDaConfig(c[k], -1) === -1)
      falha('Os dias dos avisos do backup são inválidos.');
  // As notas recentes não são importadas, mas um backup com a lista
  // estragada também não é confiável.
  if (
    c.notasRecentes !== undefined &&
    (!Array.isArray(c.notasRecentes) ||
      lerRecentes(c.notasRecentes).length !== c.notasRecentes.length)
  )
    falha('As notas recentes do backup são inválidas.');
}

/**
 * Lê um .psbackup do disco como arquivo de origem desconhecida: confere o
 * tamanho antes de ler (acima de 5 MB, recusa) e valida tudo.
 */
export async function lerArquivoBackup(caminho: string): Promise<Backup> {
  const s = await stat(caminho);
  if (!s.isFile()) falha('O caminho escolhido não é um arquivo.');
  if (s.size > LIMITE_BACKUP_BYTES)
    falha(
      `O arquivo tem ${(s.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB; um backup do PS Reader tem no máximo 5 MB.`,
    );
  return lerBackup(await readFile(caminho, 'utf8'));
}

/** O que um backup (ou os dados atuais) tem, para a confirmação. */
/** Uma parte do backup na confirmação: se veio e o que tem. */
export interface ParteResumo {
  id: ParteBackup;
  rotulo: string;
  /** A parte está no backup (só ela é substituída). */
  veio: boolean;
  /** O que a parte tem, para a tela ('' quando não veio). */
  valor: string;
}

export const PARTES_BACKUP = [
  'perfis',
  'ferramentas',
  'cnpj',
  'diasVencimento',
  'diasAntiga',
  'preferencias',
  'decisoes',
] as const;
export type ParteBackup = (typeof PARTES_BACKUP)[number];

export const ROTULO_PARTE: Record<ParteBackup, string> = {
  perfis: 'Perfis de colunas',
  ferramentas: 'Ferramentas por perfil',
  cnpj: 'CNPJ da empresa',
  diasVencimento: 'Aviso de vencimento (dias)',
  diasAntiga: 'Nota antiga (dias)',
  preferencias: 'Verificação online',
  decisoes: 'Decisões lembradas',
};

export interface ResumoBackup {
  criadoEm: string;
  versaoApp: string;
  partes: ParteResumo[];
}

const cnpjFormatado = (d: string) =>
  d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d;

/** Cada parte do backup (ou dos dados atuais), na ordem da confirmação. */
export function resumoBackup(b: Backup): ResumoBackup {
  const c = b.config;
  const valor: Record<ParteBackup, string | null> = {
    perfis: null,
    ferramentas: null,
    cnpj: null,
    diasVencimento: null,
    diasAntiga: null,
    preferencias: null,
    decisoes: null,
  };
  if (c.perfis !== undefined) {
    try {
      valor.perfis = validarPerfis(c.perfis)
        .lista.map((p) => p.nome)
        .join(', ');
    } catch {
      valor.perfis = 'inválidos';
    }
  }
  if (c.ferramentasPerfis !== undefined) {
    const n = objeto(c.ferramentasPerfis)
      ? Object.keys(c.ferramentasPerfis).length
      : 0;
    valor.ferramentas = `${n} ${n === 1 ? 'perfil ajustado' : 'perfis ajustados'}`;
  }
  if (c.cnpjEmpresa !== undefined)
    valor.cnpj = cnpjFormatado(
      cnpjDaConfig(c.cnpjEmpresa) ?? String(c.cnpjEmpresa),
    );
  if (c.diasAvisoVencimento !== undefined)
    valor.diasVencimento = String(c.diasAvisoVencimento);
  if (c.diasNotaAntiga !== undefined)
    valor.diasAntiga = String(c.diasNotaAntiga);
  if (b.preferencias)
    valor.preferencias =
      b.preferencias.verificacaoOnline === true ? 'ligada' : 'desligada';
  if (b.decisoes)
    valor.decisoes = String(Object.keys(lerDecisoes(b.decisoes)).length);
  return {
    criadoEm: b.criadoEm,
    versaoApp: b.versaoApp,
    partes: PARTES_BACKUP.map((id) => ({
      id,
      rotulo: ROTULO_PARTE[id],
      veio: valor[id] !== null,
      valor: valor[id] ?? '',
    })),
  };
}

/** "2026-11-06_14-30-05", na hora local. */
export function carimboData(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

/** Grava ao lado e troca, para um arquivo pela metade nunca ficar no lugar. */
async function gravarJson(caminho: string, dados: unknown): Promise<void> {
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(
    `${caminho}.novo`,
    `${JSON.stringify(dados, null, 2)}\n`,
    'utf8',
  );
  await rename(`${caminho}.novo`, caminho);
}

/**
 * O config.json depois da importação: das chaves de CHAVES_IMPORTADAS, só as
 * que vieram no backup substituem; a que não veio fica como está. As outras
 * (pasta de destino, notas recentes, janela) são sempre as deste computador.
 */
export function configImportada(
  local: Record<string, unknown>,
  doBackup: Record<string, unknown>,
): Record<string, unknown> {
  const r: Record<string, unknown> = { ...local };
  for (const k of CHAVES_IMPORTADAS)
    if (doBackup[k] !== undefined) r[k] = doBackup[k];
  return r;
}

/** Apaga as pastas "antes-da-importacao-" mais antigas: ficam as 3 mais novas. */
async function limparPastasAntes(pasta: string): Promise<void> {
  const nomes = (await readdir(pasta, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith(PREFIXO_ANTES))
    .map((e) => e.name)
    // O nome tem a data e a hora (e -2, -3 no mesmo segundo): a ordem do
    // texto é a ordem do tempo.
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sobram = Math.max(0, nomes.length - LIMITE_PASTAS_ANTES);
  for (const n of nomes.slice(0, sobram))
    await rm(path.join(pasta, n), { recursive: true, force: true });
}

/**
 * Substitui pelo backup (já validado por lerBackup) só as partes que vieram
 * nele: as chaves importáveis do config, as preferências, as decisões. Parte
 * que não veio fica como está; pasta de destino, notas recentes e janela
 * são sempre as deste computador. Antes, copia os arquivos
 * atuais para "antes-da-importacao-<data>" (ficam só as 3 mais novas) e
 * devolve o caminho dessa pasta.
 */
export async function importarBackup(
  pasta: string,
  b: Backup,
  agora: Date,
): Promise<string> {
  let antes = path.join(pasta, `${PREFIXO_ANTES}${carimboData(agora)}`);
  for (let n = 2; await existe(antes); n++)
    antes = path.join(pasta, `${PREFIXO_ANTES}${carimboData(agora)}-${n}`);
  const local = await lerJson(path.join(pasta, ARQ_CONFIG)).catch(() => ({}));
  const arquivos: [string, unknown][] = [
    [ARQ_CONFIG, configImportada(objeto(local) ? local : {}, b.config)],
    [ARQ_PREFERENCIAS, b.preferencias],
    [ARQ_DECISOES, b.decisoes],
  ];
  await mkdir(antes, { recursive: true });
  for (const [rel] of arquivos) {
    const origem = path.join(pasta, rel);
    if (!(await existe(origem))) continue;
    await mkdir(path.dirname(path.join(antes, rel)), { recursive: true });
    await copyFile(origem, path.join(antes, rel));
  }
  // Parte que não veio no backup (null) fica como está: nunca apaga.
  for (const [rel, dados] of arquivos)
    if (dados !== null) await gravarJson(path.join(pasta, rel), dados);
  await limparPastasAntes(pasta);
  return antes;
}
