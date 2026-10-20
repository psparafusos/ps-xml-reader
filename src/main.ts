import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';

app.setAppUserModelId('com.squirrel.PSXmlReader.PSXmlReader');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 10 mm em polegadas. printToPDF recebe margens em polegadas.
const MARGEM_PDF = 10 / 25.4;

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Leitor NF-e PS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // O app é offline: não abre janelas novas nem navega para fora da página.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

ipcMain.handle('abrir-xml', async (event): Promise<string | null> => {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const opcoes: Electron.OpenDialogOptions = {
    title: 'Abrir XML da NF-e',
    filters: [{ name: 'XML da NF-e', extensions: ['xml'] }],
    properties: ['openFile'],
  };
  const { canceled, filePaths } = janela
    ? await dialog.showOpenDialog(janela, opcoes)
    : await dialog.showOpenDialog(opcoes);
  if (canceled || filePaths.length === 0) return null;
  return readFile(filePaths[0], 'utf8');
});

ipcMain.handle(
  'salvar-pdf',
  async (event, nomeSugerido: unknown): Promise<ResultadoSalvarPdf> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    if (!janela) return { status: 'erro', mensagem: 'Janela não encontrada.' };

    // O nome vem do renderer: remove qualquer caractere que não pode estar
    // em nome de arquivo, inclusive separadores de pasta.
    const base =
      typeof nomeSugerido === 'string'
        ? // oxlint-disable-next-line no-control-regex -- caracteres de controle são proibidos em nome de arquivo
          nomeSugerido.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim()
        : '';
    const nome = base.toLowerCase().endsWith('.pdf')
      ? base
      : `${base || 'NFe'}.pdf`;

    let pdf: Buffer;
    try {
      pdf = await event.sender.printToPDF({
        pageSize: 'A4',
        landscape: false,
        printBackground: true,
        margins: {
          top: MARGEM_PDF,
          bottom: MARGEM_PDF,
          left: MARGEM_PDF,
          right: MARGEM_PDF,
        },
      });
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível gerar o PDF: ${mensagemDe(erro)}`,
      };
    }

    const { canceled, filePath } = await dialog.showSaveDialog(janela, {
      title: 'Salvar PDF',
      defaultPath: nome,
      buttonLabel: 'Salvar',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { status: 'cancelado' };

    try {
      await writeFile(filePath, pdf);
      return { status: 'salvo', caminho: filePath };
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível gravar o arquivo: ${mensagemDe(erro)}`,
      };
    }
  },
);

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

app.whenReady().then(() => {
  // Sem menu: o menu padrão do Electron vem em inglês e não é usado.
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
