// Leitura de NF-e e .psxml do disco no processo principal, com as barreiras
// de src/seguranca/xml.ts: o tamanho é conferido antes de ler (nada passa de
// LIMITE_NFE_BYTES para a memória) e o DOCTYPE antes de o texto ir para a
// janela. Também o que vale para caminhos vindos de fora: prazo para pasta
// de rede que não responde e recusa de caminhos que não são arquivo comum.
// O acesso ao disco vem por parâmetro para os testes.
//
// Pasta de rede que não responde (o Windows leva dezenas de segundos para
// desistir): o acesso a caminho de rede (UNC \\servidor\... ou unidade
// mapeada de rede) tem ESPERA_CAMINHO_MS. Caminho local não tem prazo: num
// computador carregado, o disco local pode passar de 2 s, e a mensagem da
// pasta de rede apareceria sem ser verdade. Quando a pessoa pediu para abrir
// (botão Abrir, arrastar, nota recente clicada, duplo clique), o prazo
// esgotado vira a mensagem de mensagemSemResposta. Nas checagens de fundo
// (lista de recentes, notas já conferidas), o prazo esgotado fica em
// silêncio.

import { execFile } from 'node:child_process';
import { access, lstat, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  ArquivoRecusadoError,
  problemaTamanhoNfe,
  verificarXmlSeguro,
} from './xml';

export const MENSAGEM_EM_USO = 'O arquivo está em uso por outro programa.';
export const MENSAGEM_NAO_COMUM =
  'Este caminho não é de um arquivo comum (atalho, link ou dispositivo). Ele não foi aberto.';
export const MENSAGEM_EXTENSAO = 'Selecione um arquivo .xml ou .psxml.';

/** Tempo máximo para um caminho responder (unidade de rede fora). */
export const ESPERA_CAMINHO_MS = 2000;

/** Mensagem do pedido de abrir que esgotou o prazo. */
export function mensagemSemResposta(caminho: string): string {
  return `Não foi possível abrir ${path.basename(caminho)}: a pasta de rede não respondeu em ${ESPERA_CAMINHO_MS / 1000} segundos. Confira a conexão e tente de novo.`;
}

export interface Disco {
  tamanho(caminho: string): Promise<number>;
  ler(caminho: string): Promise<Uint8Array>;
}

const discoReal: Disco = {
  tamanho: async (caminho) => (await stat(caminho)).size,
  ler: (caminho) => readFile(caminho),
};

/** Arquivo aberto ou travado por outro programa (Excel, antivírus...). */
function emUso(erro: unknown): boolean {
  const code = (erro as { code?: unknown } | null)?.code;
  return code === 'EBUSY' || code === 'EPERM';
}

/** Repassa o erro, trocando "em uso" pela mensagem para a pessoa. */
function traduzir(erro: unknown): never {
  if (emUso(erro)) throw new ArquivoRecusadoError(MENSAGEM_EM_USO);
  throw erro;
}

/** `promessa`, ou `seEsgotar` se ela não terminar em `ms`. */
export function comLimite<T, E>(
  promessa: Promise<T>,
  ms: number,
  seEsgotar: E,
): Promise<T | E> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<E>((r) => {
    relogio = setTimeout(() => r(seEsgotar), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(relogio));
}

// ---------- caminho de rede ----------

/**
 * Letras das unidades mapeadas de rede ("Z"), ou null enquanto não se sabe
 * (antes da primeira consulta, ou se ela falhou): aí toda unidade com letra
 * conta como de rede, como era antes, para não perder o prazo onde ele serve.
 */
let unidadesDeRede: ReadonlySet<string> | null = null;
let consultadoEm = 0;
let consultando = false;
/** Sobe a cada definirUnidadesDeRede: a consulta que volta depois não vale. */
let geracao = 0;

/** Intervalo para consultar de novo (uma unidade pode ser mapeada depois). */
const RECONSULTA_MS = 60_000;

/** Troca as unidades conhecidas (a consulta e os testes). */
export function definirUnidadesDeRede(letras: Iterable<string> | null): void {
  geracao++;
  unidadesDeRede =
    letras === null ? null : new Set([...letras].map((l) => l.toUpperCase()));
  consultadoEm = Date.now();
}

/**
 * Letras das unidades de rede na saída do `net use`: as linhas com "Z:"
 * seguido de \\servidor\... A saída vem na língua do Windows; só a letra e o
 * caminho UNC importam.
 */
export function lerSaidaNetUse(saida: string): string[] {
  const letras = new Set<string>();
  for (const m of saida.matchAll(/(?:^|\s)([A-Za-z]):\s+\\\\[^\s\\]/gm))
    letras.add(m[1].toUpperCase());
  return [...letras].sort();
}

/**
 * Consulta as unidades mapeadas de rede (`net use`), em segundo plano. Fora
 * do Windows, ou se a consulta falhar, fica como estava.
 */
export function consultarUnidadesDeRede(): void {
  if (process.platform !== 'win32' || consultando) return;
  consultando = true;
  const g = geracao;
  const net = path.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'net.exe',
  );
  execFile(
    net,
    ['use'],
    { windowsHide: true, timeout: 10_000, encoding: 'latin1' },
    (erro, saida) => {
      consultando = false;
      if (g !== geracao) return;
      if (erro) consultadoEm = Date.now();
      else definirUnidadesDeRede(lerSaidaNetUse(saida));
    },
  );
}

function ehUnidadeDeRede(
  letra: string,
  unidades: ReadonlySet<string> | null,
): boolean {
  return unidades === null || unidades.has(letra.toUpperCase());
}

/**
 * O caminho é de rede: UNC (\\servidor\pasta ou //servidor/pasta, também
 * \\?\UNC\...) ou unidade mapeada de rede. Unidade local e caminho de
 * dispositivo de unidade local (\\?\C:\...) não são. `unidades`: as letras
 * das unidades de rede (null: não se sabe, toda letra conta como de rede);
 * sem ele, as da última consulta, que é refeita de tempos em tempos.
 */
export function ehCaminhoDeRede(
  caminho: string,
  unidades?: ReadonlySet<string> | null,
): boolean {
  if (unidades === undefined) {
    if (Date.now() - consultadoEm > RECONSULTA_MS) consultarUnidadesDeRede();
    unidades = unidadesDeRede;
  }
  if (/^[\\/]{2}[?.][\\/]UNC[\\/]/i.test(caminho)) return true;
  const dispositivo = /^[\\/]{2}[?.][\\/]/.test(caminho);
  if (!dispositivo && /^[\\/]{2}[^\\/]/.test(caminho)) return true;
  const letra = /^(?:[\\/]{2}[?.][\\/])?([A-Za-z]):/.exec(caminho)?.[1];
  return letra ? ehUnidadeDeRede(letra, unidades) : false;
}

/**
 * `promessa` com o prazo `ms` se o caminho é de rede (`seEsgotar` se ela não
 * terminar a tempo); caminho local espera o quanto precisar.
 */
export function comPrazoDeRede<T, E>(
  caminho: string,
  promessa: Promise<T>,
  ms: number,
  seEsgotar: E,
): Promise<T | E> {
  return ehCaminhoDeRede(caminho)
    ? comLimite(promessa, ms, seEsgotar)
    : promessa;
}

/** Marca de prazo esgotado (nenhum valor de verdade é igual a ela). */
const ESGOTOU = Symbol('esgotou');

/**
 * Texto de uma NF-e ou cópia editada, decodificado como UTF-8 (como sempre
 * foi). Lança ArquivoRecusadoError, com a mensagem para a pessoa, se o
 * arquivo de rede não responde em `prazo`, é grande demais, tem
 * DOCTYPE ou está em uso por outro programa; os outros erros de disco seguem
 * como estão. O prazo vale para a primeira resposta (o stat): uma vez que a
 * pasta respondeu, a leitura pode levar o tempo que precisar.
 */
export async function lerXmlSeguro(
  caminho: string,
  disco: Disco = discoReal,
  prazo = ESPERA_CAMINHO_MS,
): Promise<string> {
  const recusar = (motivo: string | null) => {
    if (motivo) throw new ArquivoRecusadoError(motivo);
  };
  const tamanho = await comPrazoDeRede(
    caminho,
    disco.tamanho(caminho).catch(traduzir),
    prazo,
    ESGOTOU,
  );
  if (tamanho === ESGOTOU)
    throw new ArquivoRecusadoError(mensagemSemResposta(caminho));
  recusar(problemaTamanhoNfe(tamanho));
  const bytes = await disco.ler(caminho).catch(traduzir);
  // O arquivo pode ter crescido entre o stat e a leitura.
  recusar(problemaTamanhoNfe(bytes.byteLength));
  const texto = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).toString('utf8');
  recusar(verificarXmlSeguro(texto));
  return texto;
}

export type InfoCaminho = (caminho: string) => Promise<{ isFile(): boolean }>;

/** O que se sabe de um caminho dentro do prazo. */
export type Situacao = 'arquivo' | 'outro' | 'sem-resposta';

/**
 * 'arquivo', 'outro' (pasta, não existe, sem permissão) ou 'sem-resposta'
 * (caminho de rede que não respondeu em `ms`), sem prender o processo
 * principal. Caminho local não tem prazo.
 */
export async function situacaoAtePrazo(
  caminho: string,
  ms = ESPERA_CAMINHO_MS,
  info: InfoCaminho = stat,
): Promise<Situacao> {
  const r = await comPrazoDeRede(
    caminho,
    info(caminho).then(
      (s): Situacao => (s.isFile() ? 'arquivo' : 'outro'),
      (): Situacao => 'outro',
    ),
    ms,
    'sem-resposta' as const,
  );
  return r;
}

/** true se `caminho` é um arquivo, sabendo em até `ms`. */
export async function ehArquivoAtePrazo(
  caminho: string,
  ms = ESPERA_CAMINHO_MS,
  info: InfoCaminho = stat,
): Promise<boolean> {
  return (await situacaoAtePrazo(caminho, ms, info)) === 'arquivo';
}

/** Resultado de procurar o arquivo pedido entre os candidatos. */
export type Escolha =
  | { caminho: string; semResposta: false }
  | { caminho: string; semResposta: true }
  | null;

/**
 * O primeiro candidato que é um arquivo. Se nenhum é, mas algum não
 * respondeu no prazo, devolve o primeiro desses com `semResposta` (a pessoa
 * pediu para abrir: vê a mensagem). Nenhum dos dois: null.
 */
export async function escolherCandidato(
  candidatos: readonly string[],
  situacao: (caminho: string) => Promise<Situacao> = (c) => situacaoAtePrazo(c),
): Promise<Escolha> {
  let semResposta: string | null = null;
  for (const caminho of candidatos) {
    const s = await situacao(caminho);
    if (s === 'arquivo') return { caminho, semResposta: false };
    if (s === 'sem-resposta' && semResposta === null) semResposta = caminho;
  }
  return semResposta === null
    ? null
    : { caminho: semResposta, semResposta: true };
}

/**
 * Checagem de fundo: o caminho existe? Sem resposta no prazo conta como
 * existente (em silêncio): a nota recente continua clicável, e o clique,
 * que é um pedido da pessoa, mostra a mensagem se a rede seguir fora.
 */
export async function existeOuSemResposta(
  caminho: string,
  ms = ESPERA_CAMINHO_MS,
  acesso: (caminho: string) => Promise<unknown> = access,
): Promise<boolean> {
  return comPrazoDeRede(
    caminho,
    acesso(caminho).then(
      () => true,
      () => false,
    ),
    ms,
    true,
  );
}

/** Caminho de dispositivo do Windows: \\?\..., \\.\... (ou com barras /). */
export function ehCaminhoDeDispositivo(caminho: string): boolean {
  return /^[\\/]{2}[?.][\\/]/.test(caminho);
}

/**
 * Motivo para não abrir um caminho vindo da janela (arquivo solto), ou null.
 * Exige caminho absoluto com extensão .xml ou .psxml, recusa caminhos de
 * dispositivo e exige arquivo comum pelo lstat (link simbólico e junção
 * ficam de fora). O tamanho é conferido depois, em lerXmlSeguro.
 */
export async function problemaCaminhoSolto(
  caminho: unknown,
  extensoes: readonly string[],
  info: InfoCaminho = lstat,
  ms = ESPERA_CAMINHO_MS,
): Promise<string | null> {
  if (
    typeof caminho !== 'string' ||
    !path.isAbsolute(caminho) ||
    !extensoes.includes(path.extname(caminho).toLowerCase())
  )
    return MENSAGEM_EXTENSAO;
  if (ehCaminhoDeDispositivo(caminho)) return MENSAGEM_NAO_COMUM;
  try {
    const s = await comPrazoDeRede(caminho, info(caminho), ms, ESGOTOU);
    if (s === ESGOTOU) return mensagemSemResposta(caminho);
    return s.isFile() ? null : MENSAGEM_NAO_COMUM;
  } catch (erro) {
    if (emUso(erro)) return MENSAGEM_EM_USO;
    return 'O arquivo não foi encontrado.';
  }
}
