// Para onde vai um arquivo pedido para abrir (botão Abrir, arrastar, nota
// recente, duplo clique ou "Abrir com"): a tela da nota (NF-e ou cópia
// editada) ou o leitor genérico de XML (qualquer outro XML). Decide pelo
// elemento raiz, lido só no começo do arquivo, sem ler o arquivo inteiro.
//
// .psxml sempre vai para a nota. Na dúvida (arquivo que não abre, que não
// responde ou com começo estranho que tem cara de NF-e), também: a leitura
// de sempre da NF-e dá a mensagem certa. Funções puras, mais a leitura do
// começo com prazo.

import { open } from 'node:fs/promises';
import path from 'node:path';
import { comLimite, ESPERA_CAMINHO_MS } from '../seguranca/arquivo';

export type Destino = 'nota' | 'leitor';

/** Raízes que a tela da nota abre (as mesmas de RAIZES_ACEITAS em main.ts). */
const RAIZES_DA_NOTA = ['nfeProc', 'NFe', 'psCopiaEditada'];

/** Bytes lidos do começo do arquivo para achar a raiz. */
export const BYTES_DO_COMECO = 64 * 1024;

/**
 * Texto do começo do arquivo: UTF-16 pela marca BOM ou pelos zeros
 * alternados de `<?` e `<`; senão, como Latin-1 (só os nomes ASCII importam).
 */
export function textoDoComeco(b: Uint8Array): string {
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

/** Destino pelo nome do arquivo e pelo começo dele (null: não deu para ler). */
export function destinoPeloComeco(
  caminho: string,
  comeco: Uint8Array | null,
): Destino {
  if (path.extname(caminho).toLowerCase() !== '.xml') return 'nota';
  if (comeco === null) return 'nota';
  const raiz = raizDoComeco(textoDoComeco(comeco));
  return raiz !== null && RAIZES_DA_NOTA.includes(raiz) ? 'nota' : 'leitor';
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

/**
 * Destino do arquivo, lendo o começo com prazo (pasta de rede que não
 * responde, arquivo em uso ou sumido: 'nota', e a leitura de sempre explica).
 */
export async function destinoDoArquivo(
  caminho: string,
  ler: (caminho: string) => Promise<Uint8Array> = lerComeco,
): Promise<Destino> {
  if (path.extname(caminho).toLowerCase() !== '.xml') return 'nota';
  const comeco = await comLimite(
    ler(caminho).catch(() => null),
    ESPERA_CAMINHO_MS,
    null,
  );
  return destinoPeloComeco(caminho, comeco);
}
