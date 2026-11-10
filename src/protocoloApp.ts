// Serve a tela do app pelo protocolo próprio app://ps/ (só no app
// empacotado e no build de teste; no npm start a tela vem do servidor do
// Vite). Cada pedido passa por resolverCaminhoApp (src/seguranca/protocolo.ts):
// só arquivos da pasta do renderer, com tipo conhecido. Qualquer outra coisa
// recebe 404 sem detalhes.

import { protocol } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  ESQUEMA,
  resolverCaminhoApp,
  tipoDoArquivo,
} from './seguranca/protocolo';

/**
 * Registra o esquema como privilegiado: padrão (URLs com host e caminho,
 * origem própria para a CSP 'self'), seguro (contexto seguro, como https) e
 * com fetch. Precisa ser chamado antes de o app ficar pronto.
 */
export function registrarEsquemaApp(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ESQUEMA,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/** Pasta do renderer empacotado (index.html e assets/). */
export function pastaDoRenderer(): string {
  return path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
}

const naoEncontrado = () => new Response(null, { status: 404 });

/** Liga o handler do app:// (depois do ready). */
export function servirEsquemaApp(raiz = pastaDoRenderer()): void {
  protocol.handle(ESQUEMA, async (pedido) => {
    if (pedido.method !== 'GET') return naoEncontrado();
    const arquivo = resolverCaminhoApp(pedido.url, raiz);
    const tipo = arquivo && tipoDoArquivo(arquivo);
    if (!arquivo || !tipo) return naoEncontrado();
    try {
      if (!(await stat(arquivo)).isFile()) return naoEncontrado();
      return new Response(await readFile(arquivo), {
        status: 200,
        headers: {
          'content-type': tipo,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-cache',
        },
      });
    } catch {
      return naoEncontrado();
    }
  });
}
