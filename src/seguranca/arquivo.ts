// Leitura de NF-e e .psxml do disco no processo principal, com as barreiras
// de src/seguranca/xml.ts: o tamanho é conferido antes de ler (nada passa de
// LIMITE_NFE_BYTES para a memória) e o DOCTYPE antes de o texto ir para a
// janela. Também o que vale para caminhos vindos de fora: tempo limite para
// pasta de rede que não responde e recusa de caminhos que não são arquivo
// comum. O acesso ao disco vem por parâmetro para os testes.

import { lstat, readFile, stat } from 'node:fs/promises';
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

/** Tempo máximo para saber se um caminho existe (unidade de rede fora). */
export const ESPERA_CAMINHO_MS = 2000;

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

/**
 * Texto de uma NF-e ou cópia editada, decodificado como UTF-8 (como sempre
 * foi). Lança ArquivoRecusadoError, com a mensagem para a pessoa, se o
 * arquivo é grande demais, tem DOCTYPE ou está em uso por outro programa;
 * os outros erros de disco seguem como estão.
 */
export async function lerXmlSeguro(
  caminho: string,
  disco: Disco = discoReal,
): Promise<string> {
  const recusar = (motivo: string | null) => {
    if (motivo) throw new ArquivoRecusadoError(motivo);
  };
  recusar(problemaTamanhoNfe(await disco.tamanho(caminho).catch(traduzir)));
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

/** `promessa`, ou `seEsgotar` se ela não terminar em `ms`. */
export function comLimite<T>(
  promessa: Promise<T>,
  ms: number,
  seEsgotar: T,
): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<T>((r) => {
    relogio = setTimeout(() => r(seEsgotar), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(relogio));
}

export type InfoCaminho = (caminho: string) => Promise<{ isFile(): boolean }>;

/**
 * true se `caminho` é um arquivo, sabendo em até `ms`. Pasta de rede fora do
 * ar, que o Windows demora dezenas de segundos para recusar: false, sem
 * prender o processo principal.
 */
export function ehArquivoAtePrazo(
  caminho: string,
  ms = ESPERA_CAMINHO_MS,
  info: InfoCaminho = stat,
): Promise<boolean> {
  return comLimite(
    info(caminho).then(
      (s) => s.isFile(),
      () => false,
    ),
    ms,
    false,
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
): Promise<string | null> {
  if (
    typeof caminho !== 'string' ||
    !path.isAbsolute(caminho) ||
    !extensoes.includes(path.extname(caminho).toLowerCase())
  )
    return MENSAGEM_EXTENSAO;
  if (ehCaminhoDeDispositivo(caminho)) return MENSAGEM_NAO_COMUM;
  try {
    const s = await comLimite(info(caminho), ESPERA_CAMINHO_MS, null);
    if (s === null) return 'O arquivo não respondeu a tempo (pasta de rede?).';
    return s.isFile() ? null : MENSAGEM_NAO_COMUM;
  } catch (erro) {
    if (emUso(erro)) return MENSAGEM_EM_USO;
    return 'O arquivo não foi encontrado.';
  }
}
