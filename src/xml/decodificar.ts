// Decodificação de um arquivo XML qualquer, para o processo principal (o
// texto vai pronto para a janela). Lógica pura sobre bytes, sem Electron e sem
// DOM, para rodar também nos testes.
//
// Ordem: BOM primeiro (UTF-8, UTF-16 LE e BE); sem BOM, UTF-16 reconhecido
// pelos dois primeiros bytes ("<" e zero, ou zero e "<"); depois a
// declaração encoding="..." nos primeiros 1 KB; sem declaração, UTF-8 (o
// padrão do XML). O TextDecoder só recebe rótulos de uma lista fechada e
// roda com fatal: true; se a decodificação falhar, o texto é mostrado como
// windows-1252 com um aviso. O arquivo é recusado se estiver vazio (0 bytes
// ou só espaços) ou se parecer binário (byte zero fora do UTF-16, mais de
// 10% de bytes inválidos nos primeiros 64 KB, ou nada começando com "<"
// depois do BOM e dos espaços).

import {
  BYTES_AMOSTRA_BINARIO,
  BYTES_DECLARACAO,
  FRACAO_BINARIO,
  MENSAGEM_BINARIO,
  MENSAGEM_VAZIO,
} from './limites';

/** As únicas codificações aceitas (lista fechada). */
export type Codificacao =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'iso-8859-1'
  | 'windows-1252'
  | 'us-ascii';

/**
 * De onde veio a codificação usada. "inicio": UTF-16 sem BOM, reconhecido
 * pelos dois primeiros bytes ("<" seguido de zero, ou zero seguido de "<").
 */
export type OrigemCodificacao =
  | 'bom'
  | 'inicio'
  | 'declaracao'
  | 'padrao'
  | 'reserva';

export interface TextoDecodificado {
  ok: true;
  /** O texto sem o BOM. */
  texto: string;
  /** A codificação usada de fato (windows-1252 quando caiu na reserva). */
  codificacao: Codificacao;
  origem: OrigemCodificacao;
  /** O rótulo escrito na declaração, como estava (até 40 caracteres). */
  declarada: string | null;
  /** Aviso para a pessoa, ou null. */
  aviso: string | null;
}

export interface ArquivoRecusado {
  ok: false;
  motivo: 'binario' | 'vazio';
  mensagem: string;
}

export type ResultadoDecodificacao = TextoDecodificado | ArquivoRecusado;

/** Rótulos aceitos na declaração (sem diferenciar maiúsculas). */
const ROTULOS: Record<string, Codificacao> = {
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  'iso-8859-1': 'iso-8859-1',
  'iso8859-1': 'iso-8859-1',
  iso_8859_1: 'iso-8859-1',
  'iso_8859-1': 'iso-8859-1',
  latin1: 'iso-8859-1',
  'latin-1': 'iso-8859-1',
  l1: 'iso-8859-1',
  'windows-1252': 'windows-1252',
  cp1252: 'windows-1252',
  'us-ascii': 'us-ascii',
  ascii: 'us-ascii',
};

const RE_DECLARACAO =
  /^<\?xml[ \t\r\n][^>]*?\bencoding[ \t\r\n]*=[ \t\r\n]*(["'])([^"'<>]{0,40})\1/;

const binario = (): ArquivoRecusado => ({
  ok: false,
  motivo: 'binario',
  mensagem: MENSAGEM_BINARIO,
});

const vazio = (): ArquivoRecusado => ({
  ok: false,
  motivo: 'vazio',
  mensagem: MENSAGEM_VAZIO,
});

/** Byte que nunca aparece num XML em codificação de 8 bits (controles). */
function byteInvalido(b: number): boolean {
  return b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d;
}

/** Caractere proibido no XML 1.0 (controles, U+FFFE, U+FFFF). */
function caractereInvalido(c: number): boolean {
  return (
    (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) ||
    c === 0xfffe ||
    c === 0xffff
  );
}

/** Amostra de 8 bits com byte zero ou bytes inválidos demais. */
function pareceBinario8(bytes: Uint8Array): boolean {
  const fim = Math.min(bytes.length, BYTES_AMOSTRA_BINARIO);
  let invalidos = 0;
  for (let i = 0; i < fim; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (byteInvalido(b)) invalidos++;
  }
  return fim > 0 && invalidos / fim > FRACAO_BINARIO;
}

/** O mesmo teste sobre o texto já decodificado de UTF-16. */
function pareceBinario16(texto: string): boolean {
  const fim = Math.min(texto.length, BYTES_AMOSTRA_BINARIO / 2);
  let invalidos = 0;
  for (let i = 0; i < fim; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0) return true;
    if (caractereInvalido(c)) invalidos++;
  }
  return fim > 0 && invalidos / fim > FRACAO_BINARIO;
}

/** O primeiro caractere depois dos espaços do XML, ou -1 se só há espaços. */
function primeiroSemEspaco(texto: string): number {
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
    return c;
  }
  return -1;
}

/** O rótulo da declaração, lido como ASCII nos primeiros 1 KB. */
function lerDeclaracao(bytes: Uint8Array): string | null {
  const inicio = bytes.subarray(0, BYTES_DECLARACAO);
  let ascii = '';
  for (let i = 0; i < inicio.length; i++) {
    ascii += String.fromCharCode(inicio[i] < 0x80 ? inicio[i] : 0x3f);
  }
  const achado = RE_DECLARACAO.exec(ascii);
  return achado ? achado[2] : null;
}

/** Decodifica com fatal: true; null se os bytes não conferem. */
function decodificarEstrito(
  bytes: Uint8Array,
  codificacao: Codificacao,
): string | null {
  if (codificacao === 'us-ascii') {
    // O TextDecoder trata us-ascii como windows-1252 (padrão WHATWG) e nunca
    // falha; aqui um byte acima de 0x7F quer dizer que não é ASCII.
    for (let i = 0; i < bytes.length; i++) if (bytes[i] > 0x7f) return null;
  }
  try {
    return new TextDecoder(codificacao, {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    return null;
  }
}

function avisoReserva(rotulo: string): string {
  return `A codificação declarada (${rotulo}) não confere com o conteúdo; mostrando como windows-1252.`;
}

/** Decodifica o arquivo inteiro, ou diz que ele parece binário ou está vazio. */
export function decodificarXml(bytes: Uint8Array): ResultadoDecodificacao {
  // 1. BOM.
  let bom: Codificacao | null = null;
  let corpo = bytes;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bom = 'utf-8';
    corpo = bytes.subarray(3);
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    bom = 'utf-16le';
    corpo = bytes.subarray(2);
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    bom = 'utf-16be';
    corpo = bytes.subarray(2);
  }

  // UTF-16 sem BOM: só pelos dois primeiros bytes ("<" e zero, ou zero e
  // "<"). Qualquer outro começo com byte zero continua sendo binário.
  let semBom16: Codificacao | null = null;
  if (bom === null && corpo[0] === 0x3c && corpo[1] === 0x00) {
    semBom16 = 'utf-16le';
  } else if (bom === null && corpo[0] === 0x00 && corpo[1] === 0x3c) {
    semBom16 = 'utf-16be';
  }

  const utf16 = bom === 'utf-16le' || bom === 'utf-16be' || semBom16 !== null;
  if (!utf16 && pareceBinario8(corpo)) return binario();

  // 2. Declaração (só fora do UTF-16: nele, o BOM ou o começo decide).
  const declarada = utf16 ? null : lerDeclaracao(corpo);

  let codificacao: Codificacao;
  let origem: OrigemCodificacao;
  let rotulo: string;
  let aviso: string | null = null;
  if (semBom16) {
    codificacao = semBom16;
    origem = 'inicio';
    rotulo = `${semBom16.toUpperCase()} pelo começo do arquivo`;
  } else if (bom) {
    codificacao = bom;
    origem = 'bom';
    rotulo = declarada ?? `${bom.toUpperCase()} pelo BOM`;
  } else if (declarada !== null) {
    const conhecida = ROTULOS[declarada.toLowerCase()];
    rotulo = declarada;
    if (conhecida) {
      codificacao = conhecida;
      origem = 'declaracao';
    } else {
      // Desconhecida (ou UTF-16 sem BOM): windows-1252 com aviso.
      codificacao = 'windows-1252';
      origem = 'reserva';
      aviso = avisoReserva(rotulo);
    }
  } else {
    codificacao = 'utf-8';
    origem = 'padrao';
    rotulo = 'nenhuma; UTF-8 por padrão';
  }

  // 3. Decodificação estrita, com reserva em windows-1252.
  let texto = decodificarEstrito(corpo, codificacao);
  // UTF-16 que não decodifica não vira windows-1252: os zeros seguiriam lá.
  if (texto === null && utf16) return binario();
  if (texto === null) {
    codificacao = 'windows-1252';
    origem = 'reserva';
    aviso = avisoReserva(rotulo);
    texto = new TextDecoder('windows-1252').decode(corpo);
  }

  // 4. Depois de decodificar: UTF-16 com cara de binário, vazio (0 bytes
  // ou só espaços) ou sem "<" no começo.
  if (utf16 && pareceBinario16(texto)) return binario();
  const primeiro = primeiroSemEspaco(texto);
  if (primeiro === -1) return vazio();
  if (primeiro !== 0x3c) return binario();

  return { ok: true, texto, codificacao, origem, declarada, aviso };
}
