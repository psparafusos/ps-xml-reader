// Protocolo próprio da tela do app (app://ps/...): em vez de file://, a
// janela pede cada arquivo da tela a um handler do processo principal, que
// só serve os arquivos da pasta do renderer empacotado. Assim o fuse
// GrantFileProtocolExtraPrivileges pode ficar desligado (a página não
// precisa de nenhum privilégio de file://).
//
// Lógica pura, sem Electron: resolver a URL pedida para um arquivo dentro
// da pasta do renderer, ou recusar. O handler (src/protocoloApp.ts) só lê o
// que esta função aprovar.

import path from 'node:path';

export const ESQUEMA = 'app';
/** Host fixo: a URL da tela é sempre app://ps/... */
export const HOST = 'ps';
export const PAGINA_INICIAL = `${ESQUEMA}://${HOST}/index.html`;

/** Tipos servidos, por extensão. Extensão fora da lista: 404. */
export const TIPOS: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** Tipo do arquivo pela extensão, ou null se não é servido. */
export function tipoDoArquivo(arquivo: string): string | null {
  return TIPOS[path.extname(arquivo).toLowerCase()] ?? null;
}

/**
 * Caminho no disco do arquivo pedido por `url`, dentro de `raiz` (a pasta
 * do renderer), ou null se o pedido deve dar 404. Recusa:
 * - outro esquema ou outro host;
 * - codificação inválida, caractere nulo, barra invertida (inclusive
 *   codificada, %5C), dois-pontos (letra de unidade, fluxo alternativo do
 *   NTFS), começo com // (UNC) e segmento "..";
 * - pasta (nada de listar) e extensão fora de TIPOS;
 * - qualquer resultado que, normalizado, saia de `raiz`.
 * "app://ps/" vira index.html. Consulta e âncora não importam.
 */
export function resolverCaminhoApp(url: string, raiz: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${ESQUEMA}:` || u.host !== HOST) return null;
  let relativo: string;
  try {
    relativo = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (relativo === '/' || relativo === '') relativo = '/index.html';
  if (
    relativo.includes('\0') ||
    relativo.includes('\\') ||
    relativo.includes(':') ||
    relativo.startsWith('//') ||
    relativo.endsWith('/')
  )
    return null;
  const partes = relativo.slice(1).split('/');
  if (partes.some((p) => p === '' || p === '.' || p === '..')) return null;
  if (!tipoDoArquivo(relativo)) return null;
  const base = path.resolve(raiz);
  const alvo = path.resolve(base, ...partes);
  const dentro =
    path.relative(base, alvo) !== '' &&
    !path.relative(base, alvo).startsWith('..') &&
    !path.isAbsolute(path.relative(base, alvo));
  return dentro ? alvo : null;
}
