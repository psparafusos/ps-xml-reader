// Para onde vai um arquivo pedido para abrir (botão Abrir, arrastar, nota
// recente, duplo clique ou "Abrir com"): a tela da nota (NF-e, NFC-e ou
// cópia editada), a aba XML no modo Documento (outro documento fiscal: CT-e,
// NFS-e, evento da NF-e; src/docfiscal/tipo.ts) ou o leitor genérico de XML
// (qualquer outro XML). Decide pelo elemento raiz, lido só no começo do
// arquivo, sem ler o arquivo inteiro.
//
// .psxml sempre vai para a nota. Na dúvida (arquivo que não abre, que não
// responde ou com começo estranho que tem cara de NF-e), também: a leitura
// de sempre da NF-e dá a mensagem certa. Começo que só demora (arquivo
// grande recém-gravado, que o antivírus examina inteiro na primeira
// abertura) não é dúvida: acima do limite da NF-e vai para o leitor
// genérico, o único que o abre; dentro dele, o começo é esperado mais um
// pouco (ver destinoDoArquivo). Funções puras, mais a leitura do começo e
// do tamanho com prazo.

import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { tipoPeloComeco } from '../docfiscal/tipo';
import { comLimite, ESPERA_CAMINHO_MS } from '../seguranca/arquivo';
import { LIMITE_NFE_BYTES } from '../seguranca/xml';

export type Destino = 'nota' | 'documento' | 'leitor';

/** Raízes que a tela da nota abre (as mesmas de RAIZES_ACEITAS em main.ts). */
const RAIZES_DA_NOTA = ['nfeProc', 'NFe', 'psCopiaEditada'];

/** Bytes lidos do começo do arquivo para achar a raiz. */
export const BYTES_DO_COMECO = 64 * 1024;

/**
 * Texto do começo do arquivo: UTF-16 pela marca BOM ou pelos zeros
 * alternados de `<?` e `<`; senão, como Latin-1 (só os nomes ASCII importam),
 * sem o BOM UTF-8 (EF BB BF), que em Latin-1 viraria "ï»¿" antes do "<".
 */
export function textoDoComeco(b: Uint8Array): string {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)
    return new TextDecoder('latin1').decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff)
    return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0x3c && b[1] === 0x00)
    return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0x00 && b[1] === 0x3c)
    return new TextDecoder('utf-16be').decode(b);
  return new TextDecoder('latin1').decode(b);
}

/**
 * Nome local do elemento raiz, sem prefixo. Pula BOM, declaração XML,
 * comentários, instruções de processamento e DOCTYPE (com ou sem a parte
 * entre colchetes). null se o começo não chegou até a raiz ou não parece XML.
 */
export function raizDoComeco(texto: string): string | null {
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (i < texto.length && /\s/.test(texto[i])) i++;
    if (texto.startsWith('<?', i)) {
      const fim = texto.indexOf('?>', i + 2);
      if (fim < 0) return null;
      i = fim + 2;
    } else if (texto.startsWith('<!--', i)) {
      const fim = texto.indexOf('-->', i + 4);
      if (fim < 0) return null;
      i = fim + 3;
    } else if (texto.startsWith('<!DOCTYPE', i)) {
      const colchete = texto.indexOf('[', i);
      const maior = texto.indexOf('>', i);
      if (maior < 0) return null;
      if (colchete >= 0 && colchete < maior) {
        const fecha = texto.indexOf(']', colchete);
        if (fecha < 0) return null;
        const fim = texto.indexOf('>', fecha);
        if (fim < 0) return null;
        i = fim + 1;
      } else i = maior + 1;
    } else break;
  }
  const m = /^<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/.exec(texto.slice(i));
  return m ? m[1] : null;
}

/**
 * Destino pelo nome do arquivo e pelo começo dele (null: não deu para ler).
 * Sem o começo, decide pelo tamanho (null: também não se sabe): acima do
 * limite da NF-e, o leitor genérico; senão, a nota.
 */
export function destinoPeloComeco(
  caminho: string,
  comeco: Uint8Array | null,
  tamanho: number | null = null,
): Destino {
  if (path.extname(caminho).toLowerCase() !== '.xml') return 'nota';
  if (comeco === null)
    return tamanho !== null && tamanho > LIMITE_NFE_BYTES ? 'leitor' : 'nota';
  const texto = textoDoComeco(comeco);
  const raiz = raizDoComeco(texto);
  if (raiz === null) return 'leitor';
  if (RAIZES_DA_NOTA.includes(raiz)) return 'nota';
  return tipoPeloComeco(raiz, texto) !== null ? 'documento' : 'leitor';
}

/** Lê até BYTES_DO_COMECO bytes do começo do arquivo. */
async function lerComeco(caminho: string): Promise<Uint8Array> {
  const f = await open(caminho, 'r');
  try {
    const b = new Uint8Array(BYTES_DO_COMECO);
    const { bytesRead } = await f.read(b, 0, b.length, 0);
    return b.subarray(0, bytesRead);
  } finally {
    await f.close();
  }
}

/** Tamanho do arquivo em bytes (só os dados do arquivo, sem abrir o conteúdo). */
async function lerTamanho(caminho: string): Promise<number> {
  return (await stat(caminho)).size;
}

/**
 * Quanto mais o começo pode demorar quando o arquivo respondeu ao tamanho e
 * está dentro do limite da NF-e: o mesmo tempo máximo da leitura da NF-e no
 * serviço (TEMPO_MAXIMO_MS.nfe em src/servico/principal.ts), que leria o
 * arquivo inteiro de qualquer jeito se ele fosse para a nota.
 */
export const ESPERA_COMECO_LENTO_MS = 15_000;

/** Marca de prazo esgotado (diferente de null, que é erro na leitura). */
const ESGOTOU = Symbol('esgotou');

/**
 * Destino do arquivo, lendo o começo com prazo. Arquivo em uso ou sumido
 * (a leitura falha): 'nota', e a leitura de sempre explica. Começo que não
 * chega em ESPERA_CAMINHO_MS: o tamanho decide (também com prazo). Acima do
 * limite da NF-e, o leitor genérico (a nota só recusaria); dentro dele, o
 * começo ainda é esperado por ESPERA_COMECO_LENTO_MS, para um XML que não é
 * NF-e não ir para a nota e ser recusado. Arquivo grande recém-gravado cai
 * aqui: o antivírus examina o arquivo inteiro na primeira abertura (de 1,2 a
 * 4 s medidos com 60 MB). Sem o tamanho (pasta que não responde): 'nota'.
 */
export async function destinoDoArquivo(
  caminho: string,
  ler: (caminho: string) => Promise<Uint8Array> = lerComeco,
  tamanho: (caminho: string) => Promise<number> = lerTamanho,
): Promise<Destino> {
  if (path.extname(caminho).toLowerCase() !== '.xml') return 'nota';
  const leitura = ler(caminho).catch(() => null);
  const comeco = await comLimite(leitura, ESPERA_CAMINHO_MS, ESGOTOU);
  if (comeco !== ESGOTOU && comeco !== null)
    return destinoPeloComeco(caminho, comeco);
  const bytes = await comLimite(
    tamanho(caminho).catch(() => null),
    ESPERA_CAMINHO_MS,
    null,
  );
  if (comeco === ESGOTOU && bytes !== null && bytes <= LIMITE_NFE_BYTES) {
    const tarde = await comLimite(leitura, ESPERA_COMECO_LENTO_MS, null);
    return destinoPeloComeco(caminho, tarde, bytes);
  }
  return destinoPeloComeco(caminho, null, bytes);
}
