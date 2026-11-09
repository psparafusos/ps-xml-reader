// Envoltório único dos canais entre a janela e o processo principal. Todo
// ipcMain.handle e ipcMain.on do app passa por tratar() ou ouvir(), que
// conferem o remetente antes de chamar o handler: só o quadro principal
// (event.senderFrame === event.sender.mainFrame) da página do próprio app
// (src/seguranca/remetente.ts). Um iframe ou uma página que não seja a do
// app nunca chega aos handlers.

import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { remetenteValido } from './seguranca/remetente';

/** URL da página do app: a mesma que criarJanela carrega. */
export function paginaDoApp(): string {
  return MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : pathToFileURL(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      ).href;
}

function remetenteDoApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const quadro = event.senderFrame;
  return remetenteValido(
    {
      url: quadro?.url ?? null,
      principal: quadro !== null && quadro === event.sender.mainFrame,
    },
    paginaDoApp(),
  );
}

/** ipcMain.handle com a conferência do remetente; recusado: o invoke falha. */
export function tratar(
  canal: string,
  fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(canal, (event, ...args: unknown[]) => {
    if (!remetenteDoApp(event)) {
      console.warn(`Pedido recusado no canal ${canal}: remetente estranho.`);
      throw new Error('Pedido recusado.');
    }
    return fn(event, ...args);
  });
}

/** ipcMain.on com a conferência do remetente; recusado: ignorado. */
export function ouvir(
  canal: string,
  fn: (event: IpcMainEvent, ...args: unknown[]) => void,
): void {
  ipcMain.on(canal, (event, ...args: unknown[]) => {
    if (!remetenteDoApp(event)) {
      console.warn(`Mensagem ignorada no canal ${canal}: remetente estranho.`);
      return;
    }
    fn(event, ...args);
  });
}
