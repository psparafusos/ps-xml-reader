// Leitor mínimo de arquivo .zip (o .xlsx é um zip com XML dentro). Lógica
// pura: recebe os bytes e devolve o conteúdo de cada arquivo. Só entende os
// métodos 0 (guardado) e 8 (deflate), que são os que o Excel usa; zip64,
// criptografia e arquivos em vários volumes são recusados com erro.

import { inflateRawSync } from 'node:zlib';

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

/** Lê o diretório central e devolve nome do arquivo -> bytes descomprimidos. */
export function lerZip(dados: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength);
  const fim = acharFimDoDiretorio(buf);
  const total = buf.readUInt16LE(fim + 10);
  let pos = buf.readUInt32LE(fim + 16);
  const arquivos = new Map<string, Uint8Array>();

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(pos) !== ASSINATURA_CENTRAL) {
      throw new Error(`zip: diretório central corrompido na entrada ${i}`);
    }
    const flags = buf.readUInt16LE(pos + 8);
    const metodo = buf.readUInt16LE(pos + 10);
    const tamComprimido = buf.readUInt32LE(pos + 20);
    const tamNome = buf.readUInt16LE(pos + 28);
    const tamExtra = buf.readUInt16LE(pos + 30);
    const tamComentario = buf.readUInt16LE(pos + 32);
    const posLocal = buf.readUInt32LE(pos + 42);
    const nome = buf.toString('utf8', pos + 46, pos + 46 + tamNome);
    pos += 46 + tamNome + tamExtra + tamComentario;

    if (flags & 0x1) throw new Error(`zip: ${nome} está criptografado`);
    if (tamComprimido === 0xffffffff || posLocal === 0xffffffff) {
      throw new Error(`zip: ${nome} usa zip64, não suportado`);
    }
    if (buf.readUInt32LE(posLocal) !== ASSINATURA_LOCAL) {
      throw new Error(`zip: cabeçalho local de ${nome} não encontrado`);
    }
    const inicio =
      posLocal +
      30 +
      buf.readUInt16LE(posLocal + 26) +
      buf.readUInt16LE(posLocal + 28);
    const bruto = buf.subarray(inicio, inicio + tamComprimido);
    if (metodo === 0) arquivos.set(nome, bruto);
    else if (metodo === 8) arquivos.set(nome, inflateRawSync(bruto));
    else throw new Error(`zip: ${nome} usa o método ${metodo}, não suportado`);
  }
  return arquivos;
}

function acharFimDoDiretorio(buf: Buffer): number {
  // O registro final tem 22 bytes mais um comentário de até 65535 bytes.
  const limite = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= limite; i--) {
    if (buf.readUInt32LE(i) === ASSINATURA_FIM) return i;
  }
  throw new Error(
    'zip: fim do diretório central não encontrado (não é um .zip?)',
  );
}
