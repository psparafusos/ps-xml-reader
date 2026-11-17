// Leitura e gravação seguras do config.json (pasta de dados do app) e
// recuperação dos perfis. Sem Electron: o processo principal (src/main.ts)
// cria um com a pasta de dados; os testes, com uma pasta temporária.
//
// Gravação: lê o atual, junta a parte nova, grava num temporário na mesma
// pasta (com fsync) e troca pelo rename. Antes da troca, o atual, se for
// JSON válido, vira config.json.bak. Cada gravação roda inteira de uma vez
// (síncrona: nenhuma outra leitura ou gravação do processo entra no meio);
// as assíncronas ainda entram numa fila, uma por vez, na ordem de chegada.
//
// Leitura: config.json ausente é primeira execução (se houver
// config.json.bak, o arquivo sumiu: volta o .bak). Presente e ilegível
// (cortado, vazio, não é objeto): o ilegível vai para
// config-ilegivel-<data e hora>.json e vale o .bak (sem .bak, vazio).
// Erro de acesso (arquivo preso por antivírus ou sincronização): tenta de
// novo; se continuar, a leitura usa o .bak sem mexer em nada e a gravação
// desiste com erro. Nunca grava por cima de um arquivo que não conseguiu ler.
//
// Perfis (chave "perfis"): se não validam, o original vai para
// perfis-invalidos-<data e hora>.json e cada perfil é recuperado
// (recuperarPerfis). O perfil com o nome do usuário do Windows só nasce sem
// chave "perfis" ou sem nenhum perfil aproveitável.
//
// Ficam as 3 cópias mais recentes de cada tipo. Cada recuperação vai para
// recuperacoes.log, na pasta de dados, e para a lista de avisos que a tela
// mostra uma vez (tirarAvisos).

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  configPadrao,
  validarConfig,
  type ConfigConferencia,
} from './nfe/config';
import {
  LIMITE_NOME_PERFIL,
  VERSAO_PERFIS,
  migrarParaPerfis,
  nomeLivre,
  novoIdPerfil,
  perfisParaGravar,
  validarPerfis,
  type Perfil,
  type Perfis,
} from './nfe/perfis';

export const ARQ_CONFIG = 'config.json';
export const ARQ_BAK = 'config.json.bak';
export const PREFIXO_ILEGIVEL = 'config-ilegivel-';
export const PREFIXO_PERFIS_INVALIDOS = 'perfis-invalidos-';
export const ARQ_LOG = 'recuperacoes.log';
/** Cópias guardadas de cada tipo (ilegível, perfis inválidos). */
export const LIMITE_COPIAS = 3;
/** Nome do perfil recuperado que estava sem nome. */
export const NOME_RECUPERADO = 'Perfil recuperado';
/** Tamanho a partir do qual o log fica só com a metade mais nova. */
const LIMITE_LOG = 64 * 1024;

/** Uma recuperação, para o aviso da tela (mostrado uma vez). */
export interface Recuperacao {
  mensagem: string;
  /** Nome do arquivo de cópia na pasta de dados, se houve cópia. */
  arquivo: string | null;
}

/** Ponte da janela (window.psConfigSeguro, bloco em src/preload.ts). */
export interface PsConfigSeguroApi {
  /** Avisos de recuperação ainda não mostrados (quem pede leva). */
  avisos(): Promise<Recuperacao[]>;
  /** Houve uma recuperação agora. */
  aoRecuperar(callback: () => void): void;
}

export interface OpcoesConfigSeguro {
  /** Pasta de dados (lida a cada uso). */
  pasta: () => string;
  /** Data e hora das cópias e do log (os testes fixam). */
  agora?: () => Date;
  /** Chamado a cada recuperação, depois de o aviso entrar na lista. */
  aoRecuperar?: (r: Recuperacao) => void;
}

export interface ConfigSeguro<C extends object> {
  ler(): Promise<C>;
  lerSync(): C;
  /** Junta `parcial` ao config.json (na fila, uma gravação por vez). */
  gravar(parcial: C): Promise<void>;
  /** Como gravar, na hora (fechamento da janela). */
  gravarSync(parcial: C): void;
  /** Roda `fn` na fila das gravações (nada grava no meio dela). */
  naFila<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Perfis válidos, recuperados se preciso (ver o cabeçalho). */
  lerPerfis(nomeUsuario: string): Promise<Perfis>;
  /** Avisos de recuperação ainda não mostrados; esvazia a lista. */
  tirarAvisos(): Recuperacao[];
}

type Objeto = Record<string, unknown>;

const objeto = (v: unknown): v is Objeto =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** "2026-11-16_14-30-05", na hora local. */
export function carimbo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Texto do config.json como objeto, ou null se não for um objeto JSON. */
export function interpretarConfig(texto: string): Objeto | null {
  try {
    const v: unknown = JSON.parse(texto.replace(/^﻿/, ''));
    return objeto(v) ? v : null;
  } catch {
    return null;
  }
}

const textoJson = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

const codigo = (erro: unknown) =>
  objeto(erro) && typeof erro.code === 'string' ? erro.code : '';

/** Erros de arquivo preso por outro programa: vale tentar de novo. */
const PASSAGEIROS = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE']);
/** Antivírus lendo o arquivo recém-gravado: até cerca de 0,8 s no total. */
const ESPERAS_MS = [20, 50, 100, 200, 400];

function dormir(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `fn` com novas tentativas enquanto o erro for passageiro. */
function comTentativas<T>(fn: () => T): T {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (erro) {
      if (i >= ESPERAS_MS.length || !PASSAGEIROS.has(codigo(erro))) throw erro;
      dormir(ESPERAS_MS[i]);
    }
  }
}

type Leitura =
  | { tipo: 'ok'; config: Objeto; texto: string }
  | { tipo: 'ausente' }
  | { tipo: 'ilegivel' }
  | { tipo: 'erro'; erro: unknown };

function lerArquivo(caminho: string): Leitura {
  let texto: string;
  try {
    texto = comTentativas(() => readFileSync(caminho, 'utf8'));
  } catch (erro) {
    return codigo(erro) === 'ENOENT'
      ? { tipo: 'ausente' }
      : { tipo: 'erro', erro };
  }
  const config = interpretarConfig(texto);
  return config ? { tipo: 'ok', config, texto } : { tipo: 'ilegivel' };
}

let sequencia = 0;
const SUFIXO_TEMPORARIO = /\.\d+\.\d+\.tmp$/;

/** Grava `texto` em `caminho` (criando ou zerando o arquivo) com fsync. */
function gravarComFsync(caminho: string, texto: string): void {
  const fd = openSync(caminho, 'w');
  try {
    writeFileSync(fd, texto, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Grava num temporário ao lado (com fsync) e troca pelo rename. O Windows
 * não troca um arquivo que alguém está com aberto (uma leitura do próprio
 * app, o antivírus, a indexação): se a troca continuar recusada depois das
 * tentativas, grava o conteúdo por cima, no próprio arquivo, e devolve
 * 'por-cima'. Quem chama já guardou a versão anterior (o .bak).
 */
export function gravarAtomico(
  caminho: string,
  texto: string,
): 'trocado' | 'por-cima' {
  mkdirSync(path.dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.${++sequencia}.tmp`;
  try {
    gravarComFsync(temporario, texto);
    try {
      comTentativas(() => renameSync(temporario, caminho));
      return 'trocado';
    } catch (erro) {
      if (!PASSAGEIROS.has(codigo(erro))) throw erro;
      comTentativas(() => gravarComFsync(caminho, texto));
      rmSync(temporario, { force: true });
      return 'por-cima';
    }
  } catch (erro) {
    rmSync(temporario, { force: true });
    throw erro;
  }
}

/** Data e número de ordem do nome de uma cópia, ou null se não é dela. */
function ordemDaCopia(nome: string, prefixo: string): [string, number] | null {
  if (!nome.startsWith(prefixo)) return null;
  const m = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-(\d+))?\.json$/.exec(
    nome.slice(prefixo.length),
  );
  return m ? [m[1], m[2] ? Number(m[2]) : 1] : null;
}

/** As cópias deste tipo, da mais nova para a mais antiga. */
export function copiasGuardadas(pasta: string, prefixo: string): string[] {
  let nomes: string[];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return [];
  }
  return nomes
    .map((n) => ({ n, o: ordemDaCopia(n, prefixo) }))
    .filter((x): x is { n: string; o: [string, number] } => x.o !== null)
    .sort((a, b) =>
      a.o[0] !== b.o[0] ? (a.o[0] < b.o[0] ? 1 : -1) : b.o[1] - a.o[1],
    )
    .map((x) => x.n);
}

export function criarConfigSeguro<C extends object = Objeto>(
  opcoes: OpcoesConfigSeguro,
): ConfigSeguro<C> {
  const agora = opcoes.agora ?? (() => new Date());
  const avisos: Recuperacao[] = [];
  let fila: Promise<unknown> = Promise.resolve();
  let temporariosLimpos = false;

  const pasta = () => opcoes.pasta();
  const caminho = (nome: string) => path.join(pasta(), nome);

  function registrar(linha: string): void {
    const arquivo = caminho(ARQ_LOG);
    try {
      mkdirSync(pasta(), { recursive: true });
      appendFileSync(arquivo, `${agora().toISOString()} ${linha}\n`, 'utf8');
      if (statSync(arquivo).size > LIMITE_LOG) {
        const texto = readFileSync(arquivo, 'utf8');
        const resto = texto.slice(Math.floor(texto.length / 2));
        gravarAtomico(arquivo, resto.slice(resto.indexOf('\n') + 1));
      }
    } catch {
      // Sem log: a recuperação continua.
    }
    console.warn(`[config] ${linha}`);
  }

  function avisar(r: Recuperacao): void {
    avisos.push(r);
    try {
      opcoes.aoRecuperar?.(r);
    } catch {
      // O aviso já está na lista; a tela pede quando abrir.
    }
  }

  /** Nome livre para uma cópia nova deste tipo (-2, -3 no mesmo segundo). */
  function nomeDaCopia(prefixo: string): string {
    const base = `${prefixo}${carimbo(agora())}`;
    let nome = `${base}.json`;
    for (let n = 2; existsSync(caminho(nome)); n++) nome = `${base}-${n}.json`;
    return nome;
  }

  function limparCopias(prefixo: string): void {
    try {
      for (const nome of copiasGuardadas(pasta(), prefixo).slice(LIMITE_COPIAS))
        rmSync(caminho(nome), { force: true });
    } catch {
      // Cópia antiga presa: sai na próxima.
    }
  }

  /** Temporários de gravações interrompidas (de outro processo). */
  function limparTemporarios(): void {
    if (temporariosLimpos) return;
    temporariosLimpos = true;
    try {
      for (const nome of readdirSync(pasta()))
        if (
          SUFIXO_TEMPORARIO.test(nome) &&
          !nome.includes(`.${process.pid}.`) &&
          (nome.startsWith(ARQ_CONFIG) ||
            nome.startsWith(PREFIXO_PERFIS_INVALIDOS))
        )
          rmSync(caminho(nome), { force: true });
    } catch {
      // Pasta ainda não existe.
    }
  }

  /**
   * O config.json em uso, recuperando se preciso. `texto`: o arquivo como
   * está no disco, quando é JSON válido (vira o .bak na próxima gravação).
   * Com `paraGravar`, lança quando não dá para ler nem guardar o atual:
   * nunca grava por cima do que não leu.
   */
  function carregar(paraGravar: boolean): {
    config: Objeto;
    texto: string | null;
  } {
    const atual = lerArquivo(caminho(ARQ_CONFIG));
    if (atual.tipo === 'ok')
      return { config: atual.config, texto: atual.texto };
    const bak = lerArquivo(caminho(ARQ_BAK));
    const doBak = bak.tipo === 'ok' ? bak.config : {};
    if (atual.tipo === 'erro') {
      const motivo = codigo(atual.erro) || String(atual.erro);
      if (paraGravar) {
        registrar(
          `config.json não pôde ser lido (${motivo}): gravação cancelada.`,
        );
        throw atual.erro;
      }
      registrar(
        `config.json não pôde ser lido (${motivo}): ${bak.tipo === 'ok' ? 'valeu o config.json.bak' : 'valeu a configuração vazia'}, sem mexer em nada.`,
      );
      return { config: doBak, texto: null };
    }
    if (atual.tipo === 'ausente') {
      // Primeira execução. Com .bak, o config.json sumiu: volta a cópia.
      if (bak.tipo !== 'ok') return { config: {}, texto: null };
      try {
        gravarAtomico(caminho(ARQ_CONFIG), bak.texto);
      } catch (erro) {
        registrar(
          `config.json ausente; o config.json.bak não voltou (${codigo(erro) || String(erro)}).`,
        );
        return { config: bak.config, texto: null };
      }
      registrar(
        'config.json ausente com config.json.bak válido: o .bak voltou.',
      );
      avisar({
        mensagem:
          'O arquivo de configuração tinha sumido e foi recuperado da cópia de segurança (config.json.bak).',
        arquivo: null,
      });
      return { config: bak.config, texto: bak.texto };
    }
    // Ilegível: guarda como está (mover não muda nenhum byte).
    const copia = nomeDaCopia(PREFIXO_ILEGIVEL);
    try {
      comTentativas(() => renameSync(caminho(ARQ_CONFIG), caminho(copia)));
    } catch (erro) {
      const motivo = codigo(erro) || String(erro);
      registrar(
        `config.json ilegível e não guardado (${motivo}): nada alterado.`,
      );
      if (paraGravar) throw erro;
      return { config: doBak, texto: null };
    }
    limparCopias(PREFIXO_ILEGIVEL);
    if (bak.tipo === 'ok') {
      try {
        gravarAtomico(caminho(ARQ_CONFIG), bak.texto);
      } catch (erro) {
        // Fica sem config.json e com o .bak: a próxima leitura o traz.
        registrar(
          `o config.json.bak não voltou (${codigo(erro) || String(erro)}).`,
        );
      }
      registrar(
        `config.json ilegível, guardado como ${copia}; o config.json.bak voltou.`,
      );
      avisar({
        mensagem: `A configuração estava danificada e foi recuperada da cópia de segurança. O arquivo danificado foi guardado como ${copia}, na pasta de dados do app.`,
        arquivo: copia,
      });
      return { config: bak.config, texto: bak.texto };
    }
    registrar(
      `config.json ilegível, guardado como ${copia}; sem config.json.bak válido: configuração vazia.`,
    );
    avisar({
      mensagem: `A configuração estava danificada e não havia cópia de segurança: o app voltou à configuração padrão. O arquivo danificado foi guardado como ${copia}, na pasta de dados do app.`,
      arquivo: copia,
    });
    return { config: {}, texto: null };
  }

  function gravarObjeto(parcial: Objeto): void {
    limparTemporarios();
    const { config, texto } = carregar(true);
    const novo = textoJson({ ...config, ...parcial });
    if (novo === texto) return;
    if (texto !== null && gravarAtomico(caminho(ARQ_BAK), texto) === 'por-cima')
      registrar(
        'config.json.bak estava aberto por outro programa: gravado por cima, no lugar.',
      );
    if (gravarAtomico(caminho(ARQ_CONFIG), novo) === 'por-cima')
      registrar(
        'config.json estava aberto por outro programa: gravado por cima, no lugar (a versão anterior ficou no config.json.bak).',
      );
  }

  function naFila<T>(fn: () => T | Promise<T>): Promise<T> {
    const r = fila.then(fn);
    fila = r.catch(() => undefined);
    return r;
  }

  async function ler(): Promise<Objeto> {
    try {
      const config = interpretarConfig(
        await readFile(caminho(ARQ_CONFIG), 'utf8'),
      );
      if (config) return config;
    } catch {
      // Ausente ou preso: o caminho síncrono decide (com .bak e cópia).
    }
    return carregar(false).config;
  }

  /** Grava `perfis` sem lançar (os perfis em memória valem mesmo assim). */
  function gravarPerfis(perfis: Perfis): void {
    try {
      gravarObjeto({ perfis: perfisParaGravar(perfis) });
    } catch (erro) {
      registrar(`perfis não gravados: ${codigo(erro) || String(erro)}.`);
    }
  }

  /** Perfis com recuperação, de uma vez (na fila). */
  function resolverPerfis(nomeUsuario: string): Perfis {
    let config: Objeto;
    let podeGravar = true;
    try {
      config = carregar(true).config;
    } catch {
      // Arquivo preso: decide com o que der para ler, sem gravar nada.
      config = carregar(false).config;
      podeGravar = false;
    }
    if (config.perfis === undefined) {
      const perfis = migrarParaPerfis(config.conferencia, nomeUsuario);
      if (podeGravar) {
        registrar(
          `sem a chave perfis no config.json: criado o perfil "${perfis.lista[0].nome}".`,
        );
        gravarPerfis(perfis);
      }
      return perfis;
    }
    let motivo: string;
    try {
      return validarPerfis(config.perfis);
    } catch (erro) {
      motivo = erro instanceof Error ? erro.message : String(erro);
    }
    const r = recuperarPerfis(config.perfis);
    const perfis =
      r.perfis ?? migrarParaPerfis(config.conferencia, nomeUsuario);
    if (!podeGravar) return perfis;
    // Antes de regravar, a cópia do original. Sem ela, nada muda no disco.
    const copia = nomeDaCopia(PREFIXO_PERFIS_INVALIDOS);
    try {
      gravarAtomico(caminho(copia), textoJson(config.perfis));
      limparCopias(PREFIXO_PERFIS_INVALIDOS);
    } catch (erro) {
      registrar(
        `perfis inválidos (${motivo}); cópia não gravada (${codigo(erro) || String(erro)}): nada alterado.`,
      );
      return perfis;
    }
    if (r.perfis) {
      registrar(
        `perfis inválidos (${motivo}), guardados em ${copia}; recuperados: ${r.perfis.lista.map((p) => p.nome).join(', ')}${r.detalhes.length ? `; ${r.detalhes.join('; ')}` : ''}.`,
      );
      avisar({
        mensagem: `Perfis recuperados: ${r.resumo}. O original foi guardado como ${copia}, na pasta de dados do app.`,
        arquivo: copia,
      });
    } else {
      const nome = perfis.lista[0].nome;
      registrar(
        `perfis inválidos (${motivo}), guardados em ${copia}; nenhum aproveitável: criado o perfil "${nome}".`,
      );
      avisar({
        mensagem: `Os perfis salvos não puderam ser lidos e o app criou o perfil "${nome}". O original foi guardado como ${copia}, na pasta de dados do app.`,
        arquivo: copia,
      });
    }
    gravarPerfis(perfis);
    return perfis;
  }

  return {
    ler: () => ler() as Promise<C>,
    lerSync: () => carregar(false).config as C,
    gravar: (parcial) =>
      naFila(() => gravarObjeto(parcial as unknown as Objeto)),
    gravarSync: (parcial) => gravarObjeto(parcial as unknown as Objeto),
    naFila,
    async lerPerfis(nomeUsuario) {
      // Caminho comum, sem fila: perfis válidos.
      const config = await ler();
      if (config.perfis !== undefined) {
        try {
          return validarPerfis(config.perfis);
        } catch {
          // Recupera na fila, abaixo.
        }
      }
      return naFila(() => resolverPerfis(nomeUsuario));
    },
    tirarAvisos: () => avisos.splice(0),
  };
}

// ---------- recuperação dos perfis (lógica pura) ----------

export interface PerfisRecuperados {
  /** null: nenhum perfil aproveitável. */
  perfis: Perfis | null;
  /** O que mudou, perfil a perfil (para o log). */
  detalhes: string[];
  /** Os nomes, com o que voltou ao padrão (para o aviso). */
  resumo: string;
}

/** Conteúdo validado, ou null. */
function tentar(o: Objeto): ConfigConferencia | null {
  try {
    return validarConfig({ versao: 1, fornecedores: {}, ...o });
  } catch {
    return null;
  }
}

/** Os itens de `lista` que validam, um a um, junto com os já aceitos. */
function itensValidos(
  lista: unknown[],
  valida: (aceitos: unknown[]) => boolean,
): unknown[] {
  const aceitos: unknown[] = [];
  for (const item of lista) if (valida([...aceitos, item])) aceitos.push(item);
  return aceitos;
}

/**
 * Conteúdo de um perfil (colunas, anotações, layout, orientação) com o
 * padrão só no que estiver inválido: a orientação inteira; nas listas, só os
 * itens que não validam (o que faltar entra no fim, como na validação). Se
 * mesmo assim não validar, o padrão inteiro. `partes`: o que mudou.
 */
export function recuperarConteudo(p: Objeto): {
  config: ConfigConferencia;
  partes: string[];
} {
  const inteiro = tentar({
    colunas: p.colunas,
    anotacoes: p.anotacoes,
    layout: p.layout,
    orientacao: p.orientacao,
  });
  if (inteiro) return { config: inteiro, partes: [] };
  const padrao = configPadrao();
  const partes: string[] = [];
  const lista = (
    v: unknown,
    parte: string,
    valida: (a: unknown[]) => boolean,
  ) => {
    if (!Array.isArray(v)) {
      partes.push(parte);
      return [];
    }
    const aceitos = itensValidos(v, valida);
    if (aceitos.length !== v.length) partes.push(parte);
    return aceitos;
  };

  const orientacao = tentar({
    colunas: padrao.colunas,
    anotacoes: [],
    layout: padrao.layout,
    orientacao: p.orientacao,
  })
    ? p.orientacao
    : undefined;
  if (p.orientacao !== orientacao) partes.push('orientação');

  const blocos = lista(
    objeto(p.layout) ? p.layout.blocos : undefined,
    'layout dos blocos',
    (b) =>
      !!tentar({
        colunas: padrao.colunas,
        anotacoes: [],
        layout: { blocos: b },
      }),
  );
  const anotacoes = lista(
    p.anotacoes,
    'anotações extras',
    (a) => !!tentar({ colunas: [], anotacoes: a, layout: padrao.layout }),
  );
  const colunas = lista(
    p.colunas,
    'colunas',
    (c) => !!tentar({ colunas: c, anotacoes, layout: padrao.layout }),
  );
  const config = tentar({ colunas, anotacoes, layout: { blocos }, orientacao });
  if (config) return { config, partes };
  return { config: configPadrao(), partes: ['configuração inteira'] };
}

/**
 * Recupera a chave "perfis" que não validou. Cada perfil que valida fica
 * como está; o que não valida mantém id e nome e recebe o padrão só no que
 * estiver inválido (recuperarConteudo). Sem id (ou repetido): id novo. Sem
 * nome: NOME_RECUPERADO; nome longo: cortado; nome repetido: "(2)". O ativo
 * continua o mesmo quando existir. Item que nem é objeto fica de fora.
 */
export function recuperarPerfis(v: unknown): PerfisRecuperados {
  const detalhes: string[] = [];
  const resumo: string[] = [];
  const bruta = objeto(v) && Array.isArray(v.lista) ? v.lista : [];
  if (!objeto(v)) detalhes.push('a chave perfis não é um objeto');
  else if (!Array.isArray(v.lista))
    detalhes.push('a lista de perfis está faltando');
  const lista: Perfil[] = [];
  for (const p of bruta) {
    if (!objeto(p)) {
      detalhes.push('um item da lista não é um perfil e ficou de fora');
      continue;
    }
    const mudancas: string[] = [];
    const original = typeof p.nome === 'string' ? p.nome.trim() : '';
    let nome = original.slice(0, LIMITE_NOME_PERFIL).trim() || NOME_RECUPERADO;
    nome = nomeLivre(nome, lista);
    if (nome !== original)
      mudancas.push(original ? `nome era "${original}"` : 'estava sem nome');
    const idValido =
      typeof p.id === 'string' &&
      p.id !== '' &&
      !lista.some((x) => x.id === p.id);
    const id = idValido ? (p.id as string) : novoIdPerfil(lista);
    if (!idValido) mudancas.push('id novo');
    const { config, partes } = recuperarConteudo(p);
    lista.push({ id, nome, config });
    if (partes.length) mudancas.push(`${partes.join(', ')} no padrão`);
    if (mudancas.length) detalhes.push(`${nome}: ${mudancas.join(', ')}`);
    resumo.push(
      partes.length ? `${nome} (${partes.join(', ')} no padrão)` : nome,
    );
  }
  if (lista.length === 0)
    return {
      perfis: null,
      detalhes: [...detalhes, 'nenhum perfil aproveitável'],
      resumo: '',
    };
  const ativo =
    objeto(v) &&
    typeof v.ativo === 'string' &&
    lista.some((p) => p.id === v.ativo)
      ? v.ativo
      : lista[0].id;
  return {
    perfis: { versao: VERSAO_PERFIS, ativo, lista, fornecedores: {} },
    detalhes,
    resumo: resumo.join(', '),
  };
}
