// Leitor mínimo de arquivo .zip (o .xlsx é um zip com XML dentro). Lógica
// pura: recebe os bytes e devolve o conteúdo de cada arquivo. Só entende os
// métodos 0 (guardado) e 8 (deflate), que são os que o Excel usa; zip64,
// criptografia e arquivos em vários volumes são recusados com erro.
//
// Limites contra bomba de descompactação (um zip pequeno que vira
// gigabytes): número de entradas, tamanho de cada entrada descomprimida e
// soma de todas. Passou de um deles: LimiteExcedido, com a mensagem para a
// pessoa, sem descomprimir o resto.

import { inflateRawSync } from 'node:zlib';

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

export interface LimitesZip {
  /** Entradas no diretório central. */
  entradas: number;
  /** Bytes descomprimidos de uma entrada. */
  porEntrada: number;
  /** Bytes descomprimidos de todas as entradas somadas. */
  total: number;
}

export const LIMITES_ZIP: LimitesZip = {
  entradas: 2000,
  porEntrada: 64 * 1024 * 1024,
  total: 200 * 1024 * 1024,
};

/** Arquivo que passa de um limite de leitura: a mensagem é para a pessoa. */
export class LimiteExcedido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'LimiteExcedido';
  }
}

const megas = (bytes: number) => Math.ceil(bytes / (1024 * 1024));

/** Lê o diretório central e devolve nome do arquivo -> bytes descomprimidos. */
export function lerZip(
  dados: Uint8Array,
  limites: LimitesZip = LIMITES_ZIP,
): Map<string, Uint8Array> {
  const buf = Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength);
  const fim = acharFimDoDiretorio(buf);
  const total = buf.readUInt16LE(fim + 10);
  if (total > limites.entradas) {
    throw new LimiteExcedido(
      `O arquivo tem mais de ${limites.entradas.toLocaleString('pt-BR')} partes, demais para uma planilha.`,
    );
  }
  let pos = buf.readUInt32LE(fim + 16);
  const arquivos = new Map<string, Uint8Array>();
  let somados = 0;

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

    // O que esta entrada ainda pode ocupar: o limite por entrada ou o que
    // sobra do total, o menor.
    const doTotal = limites.total - somados;
    const limite = Math.min(limites.porEntrada, doTotal);
    const excedeu = () =>
      new LimiteExcedido(
        limite === limites.porEntrada
          ? `A planilha descomprimida passa do limite de ${megas(limites.porEntrada)} MB por parte.`
          : `A planilha descomprimida passa do limite de ${megas(limites.total)} MB no total.`,
      );
    let conteudo: Uint8Array;
    if (metodo === 0) {
      conteudo = bruto;
    } else if (metodo === 8) {
      try {
        conteudo = inflateRawSync(bruto, {
          maxOutputLength: Math.max(1, limite),
        });
      } catch (erro) {
        // Saída maior que maxOutputLength: o zlib para e lança RangeError.
        if (erro instanceof RangeError) throw excedeu();
        throw erro;
      }
    } else {
      throw new Error(`zip: ${nome} usa o método ${metodo}, não suportado`);
    }
    if (conteudo.byteLength > limite) throw excedeu();
    somados += conteudo.byteLength;
    arquivos.set(nome, conteudo);
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
