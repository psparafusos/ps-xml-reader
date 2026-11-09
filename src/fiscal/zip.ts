// Leitor mínimo de arquivo .zip (o .xlsx é um zip com XML dentro). Lógica
// pura: recebe os bytes e devolve o conteúdo dos arquivos pedidos. Só
// entende os métodos 0 (guardado) e 8 (deflate), que são os que o Excel usa;
// zip64, criptografia e arquivos em vários volumes são recusados com erro.
//
// Preguiçoso: lerZip só lê o diretório central (nomes, tamanhos e posições);
// cada parte só é descomprimida quando pedida em get(), e uma vez só.
//
// Limites contra bomba de descompactação (um zip pequeno que vira
// gigabytes): número de entradas, tamanho de cada parte descomprimida e soma
// das partes descomprimidas. O tamanho que o diretório central declara é
// conferido antes (acima do limite: nem descomprime) e depois (o real tem de
// ser igual ao declarado). Passou de um limite: LimiteExcedido, com a
// mensagem para a pessoa.

import { inflateRawSync } from 'node:zlib';

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

export interface LimitesZip {
  /** Entradas no diretório central. */
  entradas: number;
  /** Bytes descomprimidos de uma parte. */
  porEntrada: number;
  /** Bytes descomprimidos de todas as partes pedidas, somadas. */
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

/** Zip aberto: os nomes já lidos, o conteúdo só quando pedido. */
export interface Zip {
  /** Nomes das partes, na ordem do diretório central. */
  nomes(): string[];
  has(nome: string): boolean;
  /** Conteúdo descomprimido da parte, ou undefined se não existe. */
  get(nome: string): Uint8Array | undefined;
}

interface Entrada {
  nome: string;
  metodo: number;
  /** Onde começa o corpo comprimido (depois do cabeçalho local). */
  inicio: number;
  tamComprimido: number;
  /** Tamanho descomprimido que o diretório central declara. */
  tamDeclarado: number;
}

const megas = (bytes: number) => Math.ceil(bytes / (1024 * 1024));

/**
 * Lê o diretório central e devolve o zip aberto. Erro de formato (não é
 * zip, cortado, criptografado, zip64, método desconhecido) sai aqui, antes de
 * descomprimir qualquer parte.
 */
export function lerZip(
  dados: Uint8Array,
  limites: LimitesZip = LIMITES_ZIP,
): Zip {
  const buf = Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength);
  const fim = acharFimDoDiretorio(buf);
  const total = buf.readUInt16LE(fim + 10);
  if (total > limites.entradas) {
    throw new LimiteExcedido(
      `O arquivo tem mais de ${limites.entradas.toLocaleString('pt-BR')} partes, demais para uma planilha.`,
    );
  }
  let pos = buf.readUInt32LE(fim + 16);
  const entradas = new Map<string, Entrada>();

  for (let i = 0; i < total; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== ASSINATURA_CENTRAL) {
      throw new Error(`zip: diretório central corrompido na entrada ${i}`);
    }
    const flags = buf.readUInt16LE(pos + 8);
    const metodo = buf.readUInt16LE(pos + 10);
    const tamComprimido = buf.readUInt32LE(pos + 20);
    const tamDeclarado = buf.readUInt32LE(pos + 24);
    const tamNome = buf.readUInt16LE(pos + 28);
    const tamExtra = buf.readUInt16LE(pos + 30);
    const tamComentario = buf.readUInt16LE(pos + 32);
    const posLocal = buf.readUInt32LE(pos + 42);
    const nome = buf.toString('utf8', pos + 46, pos + 46 + tamNome);
    pos += 46 + tamNome + tamExtra + tamComentario;

    if (flags & 0x1) throw new Error(`zip: ${nome} está criptografado`);
    if (
      tamComprimido === 0xffffffff ||
      tamDeclarado === 0xffffffff ||
      posLocal === 0xffffffff
    ) {
      throw new Error(`zip: ${nome} usa zip64, não suportado`);
    }
    if (metodo !== 0 && metodo !== 8) {
      throw new Error(`zip: ${nome} usa o método ${metodo}, não suportado`);
    }
    if (
      posLocal + 30 > buf.length ||
      buf.readUInt32LE(posLocal) !== ASSINATURA_LOCAL
    ) {
      throw new Error(`zip: cabeçalho local de ${nome} não encontrado`);
    }
    const inicio =
      posLocal +
      30 +
      buf.readUInt16LE(posLocal + 26) +
      buf.readUInt16LE(posLocal + 28);
    if (inicio + tamComprimido > buf.length) {
      throw new Error(`zip: ${nome} está cortado`);
    }
    entradas.set(nome, { nome, metodo, inicio, tamComprimido, tamDeclarado });
  }

  const lidas = new Map<string, Uint8Array>();
  let somados = 0;

  const descomprimir = (e: Entrada): Uint8Array => {
    // O que esta parte ainda pode ocupar: o limite por parte ou o que sobra
    // do total, o menor.
    const doTotal = limites.total - somados;
    const limite = Math.min(limites.porEntrada, doTotal);
    const excedeu = () =>
      new LimiteExcedido(
        limite === limites.porEntrada
          ? `A planilha descomprimida passa do limite de ${megas(limites.porEntrada)} MB por parte.`
          : `A planilha descomprimida passa do limite de ${megas(limites.total)} MB no total.`,
      );
    const naoConfere = () =>
      new Error(
        `zip: ${e.nome} não tem o tamanho que o arquivo declara (${e.tamDeclarado} bytes)`,
      );
    // Declarado acima do limite: recusa sem descomprimir nada.
    if (e.tamDeclarado > limite) throw excedeu();
    const bruto = buf.subarray(e.inicio, e.inicio + e.tamComprimido);
    let conteudo: Uint8Array;
    if (e.metodo === 0) {
      conteudo = bruto;
    } else {
      try {
        // Nunca mais que o declarado: um zip que mente sobre o tamanho para
        // aqui, sem ocupar a memória que a mentira esconderia.
        conteudo = inflateRawSync(bruto, {
          maxOutputLength: Math.max(1, e.tamDeclarado),
        });
      } catch (erro) {
        // Saída maior que maxOutputLength: o zlib para e lança RangeError.
        if (erro instanceof RangeError) throw naoConfere();
        throw erro;
      }
    }
    if (conteudo.byteLength !== e.tamDeclarado) throw naoConfere();
    somados += conteudo.byteLength;
    return conteudo;
  };

  return {
    nomes: () => [...entradas.keys()],
    has: (nome) => entradas.has(nome),
    get: (nome) => {
      const pronta = lidas.get(nome);
      if (pronta) return pronta;
      const e = entradas.get(nome);
      if (!e) return undefined;
      const conteudo = descomprimir(e);
      lidas.set(nome, conteudo);
      return conteudo;
    },
  };
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
