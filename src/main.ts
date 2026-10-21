import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import {
  access,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';

app.setAppUserModelId('com.squirrel.PSXmlReader.PSXmlReader');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 10 mm em polegadas. printToPDF recebe margens em polegadas.
const MARGEM_PDF = 10 / 25.4;
// 10 mm em pixels (96 por polegada). print recebe margens em pixels.
const MARGEM_IMPRESSAO = Math.round(MARGEM_PDF * 96);

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

// Caminho do arquivo que está aberto na tela. O app nunca grava nele: salvar
// recusa qualquer destino que resolva para este mesmo arquivo.
let arquivoAberto: string | null = null;

const EXTENSOES_ABERTURA = ['.xml', '.psxml'];

async function lerArquivoAberto(caminho: string): Promise<ArquivoAberto> {
  const texto = await readFile(caminho, 'utf8');
  arquivoAberto = caminho;
  return { nome: path.basename(caminho), texto };
}

ipcMain.handle(
  'abrir-arquivo',
  async (event): Promise<ArquivoAberto | null> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Abrir XML da NF-e',
      filters: [
        { name: 'XML da NF-e ou cópia editada', extensions: ['xml', 'psxml'] },
      ],
      properties: ['openFile'],
    };
    const { canceled, filePaths } = janela
      ? await dialog.showOpenDialog(janela, opcoes)
      : await dialog.showOpenDialog(opcoes);
    if (canceled || filePaths.length === 0) return null;
    return lerArquivoAberto(filePaths[0]);
  },
);

// Arrastar e soltar: o renderer só conhece o caminho do arquivo solto.
ipcMain.handle(
  'abrir-caminho',
  async (_event, caminho: unknown): Promise<ArquivoAberto> => {
    if (
      typeof caminho !== 'string' ||
      !path.isAbsolute(caminho) ||
      !EXTENSOES_ABERTURA.includes(path.extname(caminho).toLowerCase())
    ) {
      throw new Error('Selecione um arquivo .xml ou .psxml.');
    }
    return lerArquivoAberto(caminho);
  },
);

// ---------- pasta de destino (config.json em userData) ----------

function caminhoConfig(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

async function lerPastaDestino(): Promise<string | null> {
  try {
    const config: unknown = JSON.parse(await readFile(caminhoConfig(), 'utf8'));
    if (
      typeof config === 'object' &&
      config !== null &&
      'pastaDestino' in config &&
      typeof config.pastaDestino === 'string' &&
      config.pastaDestino !== ''
    ) {
      return config.pastaDestino;
    }
  } catch {
    // Sem config (primeira execução) ou arquivo ilegível: sem pasta.
  }
  return null;
}

ipcMain.handle(
  'pasta-destino',
  (): Promise<string | null> => lerPastaDestino(),
);

ipcMain.handle('escolher-pasta', async (event): Promise<string | null> => {
  const janela = BrowserWindow.fromWebContents(event.sender);
  const atual = await lerPastaDestino();
  const opcoes: Electron.OpenDialogOptions = {
    title: 'Pasta de destino',
    buttonLabel: 'Escolher pasta',
    properties: ['openDirectory', 'createDirectory'],
    ...(atual ? { defaultPath: atual } : {}),
  };
  const { canceled, filePaths } = janela
    ? await dialog.showOpenDialog(janela, opcoes)
    : await dialog.showOpenDialog(opcoes);
  if (canceled || filePaths.length === 0) return null;

  const pasta = filePaths[0];
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(
    caminhoConfig(),
    `${JSON.stringify({ pastaDestino: pasta }, null, 2)}\n`,
    'utf8',
  );
  return pasta;
});

// ---------- salvar (PDF + cópia editada) ----------

/** Nome do arquivo aberto sem extensão e sem sufixo -ps já existente. */
function nomeBase(caminho: string): string {
  return path.basename(caminho, path.extname(caminho)).replace(/(-ps)+$/i, '');
}

/** true se os dois caminhos apontam para o mesmo arquivo. */
async function mesmoArquivo(a: string, b: string): Promise<boolean> {
  const norm = (c: string) => path.resolve(c).toLowerCase();
  if (norm(a) === norm(b)) return true;
  try {
    const [ra, rb] = await Promise.all([realpath(a), realpath(b)]);
    return norm(ra) === norm(rb);
  } catch {
    // Um dos dois não existe: não podem ser o mesmo arquivo.
    return false;
  }
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

ipcMain.handle(
  'salvar',
  async (event, textoCopia: unknown): Promise<ResultadoSalvar> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    if (!janela) return { status: 'erro', mensagem: 'Janela não encontrada.' };
    if (!arquivoAberto) {
      return { status: 'erro', mensagem: 'Nenhum arquivo aberto.' };
    }
    if (typeof textoCopia !== 'string' || textoCopia === '') {
      return { status: 'erro', mensagem: 'Cópia editada vazia.' };
    }

    const pasta = await lerPastaDestino();
    if (!pasta) {
      return { status: 'erro', mensagem: 'Escolha a pasta de destino.' };
    }
    try {
      if (!(await stat(pasta)).isDirectory()) throw new Error();
    } catch {
      return {
        status: 'erro',
        mensagem: `A pasta de destino não existe mais: ${pasta}. Escolha outra.`,
      };
    }

    const base = nomeBase(arquivoAberto);
    const destinoPdf = path.join(pasta, `${base}-ps.pdf`);
    const destinoCopia = path.join(pasta, `${base}-ps.psxml`);

    for (const destino of [destinoPdf, destinoCopia]) {
      if (await mesmoArquivo(destino, arquivoAberto)) {
        const mensagem =
          `Gravação recusada: ${destino} é o próprio arquivo aberto. ` +
          'Escolha outra pasta de destino.';
        await dialog.showMessageBox(janela, {
          type: 'error',
          title: 'Gravação recusada',
          message: mensagem,
          buttons: ['OK'],
        });
        return { status: 'erro', mensagem };
      }
    }

    const existentes: string[] = [];
    for (const destino of [destinoPdf, destinoCopia]) {
      if (await existe(destino)) existentes.push(path.basename(destino));
    }
    if (existentes.length > 0) {
      const { response } = await dialog.showMessageBox(janela, {
        type: 'question',
        title: 'Substituir arquivos',
        message:
          existentes.length === 1
            ? `O arquivo ${existentes[0]} já existe na pasta de destino. Deseja substituir?`
            : `Os arquivos ${existentes.join(' e ')} já existem na pasta de destino. Deseja substituir?`,
        buttons: ['Substituir', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return { status: 'cancelado' };
    }

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

    try {
      await writeFile(destinoPdf, pdf);
      await writeFile(destinoCopia, textoCopia, 'utf8');
      return { status: 'salvo', pdf: destinoPdf, copia: destinoCopia };
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível gravar o arquivo: ${mensagemDe(erro)}`,
      };
    }
  },
);

// ---------- imprimir ----------

ipcMain.handle(
  'imprimir',
  (event): Promise<ResultadoImprimir> =>
    new Promise((resolve) => {
      event.sender.print(
        {
          silent: false,
          printBackground: true,
          margins: {
            marginType: 'custom',
            top: MARGEM_IMPRESSAO,
            bottom: MARGEM_IMPRESSAO,
            left: MARGEM_IMPRESSAO,
            right: MARGEM_IMPRESSAO,
          },
        },
        (sucesso, motivo) => {
          if (sucesso) resolve({ status: 'impresso' });
          else if (motivo === 'Print job canceled')
            resolve({ status: 'cancelado' });
          else
            resolve({
              status: 'erro',
              mensagem: `Não foi possível imprimir: ${motivo}`,
            });
        },
      );
    }),
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
