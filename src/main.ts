import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import {
  access,
  constants,
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
    // A janela só aparece em ready-to-show (primeiro desenho já com o CSS).
    // Até lá o fundo é o do app: --cor-fundo de src/styles/tokens.css, que
    // vem de --ps-branco (#ffffff). O main não lê CSS; se o token mudar, mude aqui.
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // O app é offline: não abre janelas novas nem navega para fora da página.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // Anotações não salvas: o fechamento espera o renderer perguntar ao usuário.
  // Se ele seguir (salvou ou descartou), chama fechar-janela, que libera.
  mainWindow.on('close', (event) => {
    if (!anotacoesPendentes || fechamentoLiberado) return;
    if (mainWindow.webContents.isCrashed()) return;
    event.preventDefault();
    mainWindow.webContents.send('pedido-fechar');
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// Caminho do arquivo que está aberto na tela. Se for uma NF-e original, o app
// nunca grava nele: salvar recusa qualquer destino que resolva para ele. Uma
// cópia editada pode ser substituída (sempre com a pergunta de substituir).
let arquivoAberto: string | null = null;
let abertoEhCopia = false;

/** true enquanto o renderer tem anotações alteradas e não salvas. */
let anotacoesPendentes = false;
/** Liberado pelo renderer depois de perguntar; o próximo close não é barrado. */
let fechamentoLiberado = false;

const EXTENSOES_ABERTURA = ['.xml', '.psxml'];

/**
 * Nome local do elemento raiz, sem prefixo. Pula BOM, declaração XML,
 * comentários, instruções de processamento e DOCTYPE. String vazia se não achar.
 */
function nomeRaiz(xml: string): string {
  const corpo = xml
    .replace(/^﻿/, '')
    .replace(/^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/, '');
  const m = /^<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/.exec(corpo);
  return m ? m[1] : '';
}

async function lerArquivoAberto(caminho: string): Promise<ArquivoAberto> {
  const texto = await readFile(caminho, 'utf8');
  arquivoAberto = caminho;
  abertoEhCopia = nomeRaiz(texto) === 'psCopiaEditada';
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

/** Nome de arquivo temporário novo, na mesma pasta de `destino`. */
function nomeTemporario(destino: string): string {
  return path.join(
    path.dirname(destino),
    `.${path.basename(destino)}.${randomUUID()}.tmp`,
  );
}

/** Grava `dados` em um arquivo temporário novo, na mesma pasta de `destino`. */
async function gravarTemporario(
  destino: string,
  dados: string | Buffer,
): Promise<string> {
  const temporario = nomeTemporario(destino);
  try {
    await writeFile(temporario, dados, { flag: 'wx' });
  } catch (erro) {
    await rm(temporario, { force: true });
    throw erro;
  }
  return temporario;
}

/**
 * Desfaz as trocas já feitas, da última para a primeira: devolve a reserva ao
 * lugar do arquivo final ou, se o arquivo não existia antes, apaga o novo.
 * Devolve os caminhos que não puderam ser restaurados.
 */
async function desfazerTrocas(
  trocados: { destino: string; reserva: string | null }[],
  temporarios: string[],
): Promise<string[]> {
  const falhas: string[] = [];
  for (const { destino, reserva } of [...trocados].reverse()) {
    try {
      if (reserva) {
        await rename(reserva, destino);
        temporarios.splice(temporarios.indexOf(reserva), 1);
      } else {
        await rm(destino, { force: true });
      }
    } catch {
      falhas.push(destino);
    }
  }
  return falhas;
}

/** Um arquivo a gravar: texto pronto ou o PDF da tela atual (gerado depois). */
type Saida =
  | { destino: string; texto: string }
  | { destino: string; pdf: Electron.PrintToPDFOptions };

/**
 * Grava as saídas na pasta de destino, com as mesmas regras para o modo
 * Conferência e o DANFE: recusa gravar sobre a NF-e original aberta, pergunta
 * antes de substituir e grava primeiro em temporários (gravação segura).
 * `nomes(base)` monta os caminhos a partir do nome base do arquivo aberto.
 */
async function gravarSaidas(
  event: Electron.IpcMainInvokeEvent,
  nomes: (pasta: string, base: string) => Saida[],
): Promise<
  | { status: 'salvo'; destinos: string[] }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string }
> {
  const janela = BrowserWindow.fromWebContents(event.sender);
  if (!janela) return { status: 'erro', mensagem: 'Janela não encontrada.' };
  if (!arquivoAberto) {
    return { status: 'erro', mensagem: 'Nenhum arquivo aberto.' };
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

  const saidas = nomes(pasta, nomeBase(arquivoAberto));
  const destinos = saidas.map((s) => s.destino);

  for (const destino of destinos) {
    if (!abertoEhCopia && (await mesmoArquivo(destino, arquivoAberto))) {
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
  for (const destino of destinos) {
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

  const dados: (string | Buffer)[] = [];
  for (const s of saidas) {
    if ('texto' in s) {
      dados.push(s.texto);
      continue;
    }
    try {
      dados.push(await event.sender.printToPDF(s.pdf));
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível gerar o PDF: ${mensagemDe(erro)}`,
      };
    }
  }

  // Grava todos em temporários na pasta de destino e só depois substitui
  // os finais. Antes de cada troca guarda uma reserva do arquivo antigo: se
  // uma troca falhar, as anteriores são desfeitas e todos ficam como
  // estavam. No fim, temporários e reservas que sobraram são apagados.
  const temporarios: string[] = [];
  const trocados: { destino: string; reserva: string | null }[] = [];
  try {
    const pares: { destino: string; tmp: string }[] = [];
    for (const [i, destino] of destinos.entries()) {
      const tmp = await gravarTemporario(destino, dados[i]);
      temporarios.push(tmp);
      pares.push({ destino, tmp });
    }

    for (const { destino, tmp } of pares) {
      let reserva: string | null = null;
      if (await existe(destino)) {
        reserva = nomeTemporario(destino);
        await copyFile(destino, reserva, constants.COPYFILE_EXCL);
        temporarios.push(reserva);
      }
      // rename substitui o arquivo final existente na mesma pasta.
      await rename(tmp, destino);
      temporarios.splice(temporarios.indexOf(tmp), 1);
      trocados.push({ destino, reserva });
    }
    return { status: 'salvo', destinos };
  } catch (erro) {
    const naoDesfeitos = await desfazerTrocas(trocados, temporarios);
    const aviso =
      naoDesfeitos.length > 0
        ? ` Não foi possível restaurar: ${naoDesfeitos.join(', ')}.`
        : '';
    return {
      status: 'erro',
      mensagem: `Não foi possível gravar o arquivo: ${mensagemDe(erro)}${aviso}`,
    };
  } finally {
    await Promise.all(temporarios.map((t) => rm(t, { force: true })));
  }
}

ipcMain.handle(
  'salvar',
  async (event, textoCopia: unknown): Promise<ResultadoSalvar> => {
    if (typeof textoCopia !== 'string' || textoCopia === '') {
      return { status: 'erro', mensagem: 'Cópia editada vazia.' };
    }
    // A cópia é gravada antes do PDF, como antes.
    const r = await gravarSaidas(event, (pasta, base) => [
      { destino: path.join(pasta, `${base}-ps.psxml`), texto: textoCopia },
      {
        destino: path.join(pasta, `${base}-ps.pdf`),
        pdf: {
          pageSize: 'A4',
          landscape: false,
          printBackground: true,
          margins: {
            top: MARGEM_PDF,
            bottom: MARGEM_PDF,
            left: MARGEM_PDF,
            right: MARGEM_PDF,
          },
        },
      },
    ]);
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', pdf: r.destinos[1], copia: r.destinos[0] };
  },
);

// DANFE: só o PDF. As margens são do próprio layout (cada folha é um bloco de
// 210 x 297 mm), então o Electron imprime sem margem.
ipcMain.handle('salvar-danfe', async (event): Promise<ResultadoSalvarDanfe> => {
  const r = await gravarSaidas(event, (pasta, base) => [
    {
      destino: path.join(pasta, `${base}-danfe.pdf`),
      pdf: {
        pageSize: 'A4',
        landscape: false,
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      },
    },
  ]);
  if (r.status !== 'salvo') return r;
  return { status: 'salvo', pdf: r.destinos[0] };
});

// ---------- anotações não salvas ----------

ipcMain.on('anotacoes-pendentes', (_event, pendentes: unknown) => {
  anotacoesPendentes = pendentes === true;
});

ipcMain.handle(
  'perguntar-alteracoes',
  async (event): Promise<RespostaAlteracoes> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Anotações não salvas',
      message: 'Há anotações não salvas. Deseja salvar antes de continuar?',
      buttons: ['Salvar', 'Descartar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    };
    const { response } = janela
      ? await dialog.showMessageBox(janela, opcoes)
      : await dialog.showMessageBox(opcoes);
    return (
      (['salvar', 'descartar', 'cancelar'] as const)[response] ?? 'cancelar'
    );
  },
);

ipcMain.handle('fechar-janela', (event) => {
  fechamentoLiberado = true;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ---------- imprimir ----------

// No DANFE as margens são do layout: imprime em A4 sem margem do Electron.
const OPCOES_IMPRESSAO: Record<
  ModoImpressao,
  Electron.WebContentsPrintOptions
> = {
  conferencia: {
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
  danfe: {
    silent: false,
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'none' },
  },
};

ipcMain.handle(
  'imprimir',
  (event, modo: unknown): Promise<ResultadoImprimir> =>
    new Promise((resolve) => {
      event.sender.print(
        OPCOES_IMPRESSAO[modo === 'danfe' ? 'danfe' : 'conferencia'],
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
