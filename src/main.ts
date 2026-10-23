import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
} from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
import { EXTENSAO, tratarEventoSquirrel } from './associacao';
import { ehImpressoraCupom } from './impressoras';

// Eventos do Squirrel antes de qualquer outra inicialização: atalhos
// (electron-squirrel-startup, que sai quando o Update.exe termina) e a
// associação do .psxml no registro do usuário (src/associacao.ts).
tratarEventoSquirrel(process.argv[1]);
if (started) {
  app.quit();
}

app.setAppUserModelId('com.squirrel.PSXmlReader.PSXmlReader');

// ---------- arquivo passado na linha de comando (duplo clique) ----------

/**
 * Arquivo a abrir nos argumentos: o primeiro caminho .psxml ou .xml que existe
 * no disco. Ignora as opções (--squirrel-firstrun, as do Chromium) e o resto
 * que o npm start passa (o executável do Electron, a pasta do app), que não
 * são arquivos com essas extensões. Relativo vale a partir de `pasta`.
 */
function arquivoDosArgumentos(argv: string[], pasta: string): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (ext !== EXTENSAO && ext !== '.xml') continue;
    const caminho = path.resolve(pasta, arg);
    try {
      if (statSync(caminho).isFile()) return caminho;
    } catch {
      // Não existe: ignora.
    }
  }
  return null;
}

/** Arquivo pedido e ainda não aberto pelo renderer (ver 'abrir-externo'). */
let arquivoExterno = started
  ? null
  : arquivoDosArgumentos(process.argv, process.cwd());

// Instância única: se o app já está aberto, o arquivo vai para a janela
// existente (evento second-instance) e esta instância sai. O caminho vai em
// additionalData, porque o argv que chega lá pode vir reordenado.
const instanciaPrincipal =
  !started && app.requestSingleInstanceLock({ arquivo: arquivoExterno });
if (!started && !instanciaPrincipal) app.quit();

/** A janela do app (uma só). */
let janelaPrincipal: BrowserWindow | null = null;

app.on('second-instance', (_event, argv, pasta, dados) => {
  const pedido = (dados as { arquivo?: unknown } | null)?.arquivo;
  const arquivo =
    typeof pedido === 'string'
      ? arquivoDosArgumentos(['', pedido], pasta)
      : arquivoDosArgumentos(argv, pasta);
  const janela = janelaPrincipal;
  if (!janela || janela.isDestroyed()) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
  if (!arquivo) return;
  // O renderer pergunta sobre anotações não salvas e só então pede o arquivo.
  arquivoExterno = arquivo;
  janela.webContents.send('arquivo-externo');
});

// 10 mm em polegadas. printToPDF recebe margens em polegadas.
const MARGEM_PDF = 10 / 25.4;
// 10 mm em pixels (96 por polegada). print recebe margens em pixels.
const MARGEM_IMPRESSAO = Math.round(MARGEM_PDF * 96);

// Tamanho mínimo da janela (bordas e barra de título incluídas, em pixels
// lógicos). Menor tela atendida: 1366 x 768 com escala de 125% no Windows, ou
// seja 1366 / 1,25 = 1092,8 por 768 / 1,25 = 614,4. A barra de tarefas do
// Windows 11 tem 48 de altura, então a área de trabalho é 1092,8 x 566,4. A
// janela maximizada ocupa a área de trabalho, então o mínimo precisa caber
// nela: 1024 x 560, com folga.
const LARGURA_MINIMA = 1024;
const ALTURA_MINIMA = 560;
const LARGURA_PADRAO = 1280;
const ALTURA_PADRAO = 860;

// ---------- tamanho e posição da janela (config.json, chave "janela") ----------

interface EstadoJanela {
  x: number;
  y: number;
  width: number;
  height: number;
  maximizada: boolean;
}

/**
 * Faixa do alto da janela (barra de título) que precisa estar dentro da área
 * de trabalho de algum monitor para a posição salva valer: com ela a pessoa
 * consegue pegar e arrastar a janela.
 */
const FAIXA_VISIVEL = { largura: 120, altura: 30 };

function estadoValido(e: unknown): e is EstadoJanela {
  if (typeof e !== 'object' || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    ['x', 'y', 'width', 'height'].every(
      (k) => typeof o[k] === 'number' && Number.isFinite(o[k]),
    ) &&
    typeof o.maximizada === 'boolean' &&
    (o.width as number) >= LARGURA_MINIMA &&
    (o.height as number) >= ALTURA_MINIMA
  );
}

/** true se a barra de título cai na área de trabalho de algum monitor conectado. */
function posicaoVisivel(j: EstadoJanela): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    const largura = Math.min(j.x + j.width, a.x + a.width) - Math.max(j.x, a.x);
    const altura =
      Math.min(j.y + FAIXA_VISIVEL.altura, a.y + a.height) - Math.max(j.y, a.y);
    return largura >= FAIXA_VISIVEL.largura && altura >= FAIXA_VISIVEL.altura;
  });
}

/**
 * Tamanho e posição de abertura: os salvos ao fechar, se ainda caem num
 * monitor conectado; senão, o tamanho padrão centralizado no monitor principal.
 * Lido de forma síncrona: a janela é criada logo em seguida.
 */
function posicaoInicial(): EstadoJanela {
  const salvo = lerConfigSync().janela;
  if (estadoValido(salvo) && posicaoVisivel(salvo)) return salvo;
  const a = screen.getPrimaryDisplay().workArea;
  const width = Math.min(LARGURA_PADRAO, a.width);
  const height = Math.min(ALTURA_PADRAO, a.height);
  return {
    x: Math.round(a.x + (a.width - width) / 2),
    y: Math.round(a.y + (a.height - height) / 2),
    width,
    height,
    maximizada: false,
  };
}

/**
 * Guarda tamanho e posição no fechamento. getNormalBounds dá o tamanho de
 * antes de maximizar, para a janela voltar a ele ao sair do maximizado.
 * Gravação síncrona: o processo termina logo depois de fechar a janela.
 */
function guardarJanela(janela: BrowserWindow): void {
  try {
    gravarConfigSync({
      janela: { ...janela.getNormalBounds(), maximizada: janela.isMaximized() },
    });
  } catch {
    // Sem gravar, a próxima abertura usa o tamanho padrão. Não impede fechar.
  }
}

const createWindow = () => {
  const inicial = posicaoInicial();
  const mainWindow = new BrowserWindow({
    x: inicial.x,
    y: inicial.y,
    width: inicial.width,
    height: inicial.height,
    minWidth: LARGURA_MINIMA,
    minHeight: ALTURA_MINIMA,
    title: 'PS Reader',
    // Empacotado, a janela usa o ícone do executável (packagerConfig.icon).
    // No npm start o executável é o do Electron: o ícone vem de assets\.
    ...(app.isPackaged
      ? {}
      : { icon: path.join(app.getAppPath(), 'assets', 'ps-reader.ico') }),
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
  janelaPrincipal = mainWindow;
  mainWindow.on('closed', () => {
    if (janelaPrincipal === mainWindow) janelaPrincipal = null;
  });

  mainWindow.once('ready-to-show', () => {
    // maximize também mostra a janela.
    if (inicial.maximizada) mainWindow.maximize();
    mainWindow.show();
  });

  // O app é offline: não abre janelas novas nem navega para fora da página.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  // Anotações não salvas: o fechamento espera o renderer perguntar ao usuário.
  // Se ele seguir (salvou ou descartou), chama fechar-janela, que libera.
  // Fechamento que segue: guarda tamanho e posição.
  mainWindow.on('close', (event) => {
    if (
      anotacoesPendentes &&
      !fechamentoLiberado &&
      !mainWindow.webContents.isCrashed()
    ) {
      event.preventDefault();
      mainWindow.webContents.send('pedido-fechar');
      return;
    }
    guardarJanela(mainWindow);
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

/** Raízes de um arquivo que o app abre (NF-e ou cópia editada). */
const RAIZES_ACEITAS = ['nfeProc', 'NFe', 'psCopiaEditada'];

async function lerArquivoAberto(caminho: string): Promise<ArquivoAberto> {
  const texto = await readFile(caminho, 'utf8');
  arquivoAberto = caminho;
  const raiz = nomeRaiz(texto);
  abertoEhCopia = raiz === 'psCopiaEditada';
  // Aberto com sucesso (é NF-e ou cópia editada): a pasta dele vira o ponto de
  // partida do próximo diálogo de abrir. Falha ao gravar não impede a abertura.
  if (RAIZES_ACEITAS.includes(raiz)) {
    await gravarConfig({ ultimaPastaAbertura: path.dirname(caminho) }).catch(
      () => {},
    );
  }
  return { nome: path.basename(caminho), texto };
}

/** Tempo máximo para conferir se a última pasta ainda existe (rede fora). */
const ESPERA_PASTA_MS = 2000;

/**
 * Pasta onde o diálogo de abrir começa: a do último arquivo aberto com
 * sucesso, se ainda existir. Pasta removida (pendrive, rede fora) ou que não
 * responde a tempo: null, e o diálogo abre no padrão do Windows.
 */
async function pastaInicialAbertura(): Promise<string | null> {
  const { ultimaPastaAbertura } = await lerConfig();
  if (typeof ultimaPastaAbertura !== 'string' || ultimaPastaAbertura === '') {
    return null;
  }
  const existe = stat(ultimaPastaAbertura).then(
    (s) => s.isDirectory(),
    () => false,
  );
  const limite = new Promise<boolean>((r) =>
    setTimeout(() => r(false), ESPERA_PASTA_MS),
  );
  return (await Promise.race([existe, limite])) ? ultimaPastaAbertura : null;
}

ipcMain.handle(
  'abrir-arquivo',
  async (event): Promise<ArquivoAberto | null> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    const inicial = await pastaInicialAbertura();
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Abrir XML da NF-e',
      filters: [
        { name: 'XML da NF-e ou cópia editada', extensions: ['xml', 'psxml'] },
      ],
      properties: ['openFile'],
      ...(inicial ? { defaultPath: inicial } : {}),
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

// Duplo clique num .psxml (ou .xml passado na linha de comando): o renderer
// pede o arquivo na abertura e depois de cada aviso 'arquivo-externo', já
// tendo perguntado sobre anotações não salvas. null se não há arquivo pedido.
ipcMain.handle('abrir-externo', async (): Promise<ArquivoAberto | null> => {
  const caminho = arquivoExterno;
  arquivoExterno = null;
  return caminho ? lerArquivoAberto(caminho) : null;
});

// ---------- config.json em userData (pasta de destino, última pasta, janela) ----------

interface Config {
  pastaDestino?: unknown;
  ultimaPastaAbertura?: unknown;
  janela?: unknown;
}

function caminhoConfig(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function interpretarConfig(texto: string): Config {
  const config: unknown = JSON.parse(texto);
  return typeof config === 'object' && config !== null
    ? (config as Config)
    : {};
}

/** Versão síncrona de lerConfig, para abrir e fechar a janela. */
function lerConfigSync(): Config {
  try {
    return interpretarConfig(readFileSync(caminhoConfig(), 'utf8'));
  } catch {
    return {};
  }
}

function gravarConfigSync(parcial: Config): void {
  const config = { ...lerConfigSync(), ...parcial };
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(
    caminhoConfig(),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

async function lerConfig(): Promise<Config> {
  try {
    return interpretarConfig(await readFile(caminhoConfig(), 'utf8'));
  } catch {
    // Sem config (primeira execução) ou arquivo ilegível: config vazia.
    return {};
  }
}

ipcMain.handle('versao', (): string => app.getVersion());

/** Grava as chaves de `parcial` mantendo as demais. */
async function gravarConfig(parcial: Config): Promise<void> {
  const config = { ...(await lerConfig()), ...parcial };
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(
    caminhoConfig(),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

async function lerPastaDestino(): Promise<string | null> {
  const { pastaDestino } = await lerConfig();
  return typeof pastaDestino === 'string' && pastaDestino !== ''
    ? pastaDestino
    : null;
}

async function ehPasta(caminho: string): Promise<boolean> {
  try {
    return (await stat(caminho)).isDirectory();
  } catch {
    return false;
  }
}

const pastaSumiu = (pasta: string) =>
  `A pasta de destino não existe mais: ${pasta}. Escolha outra.`;

ipcMain.handle(
  'pasta-destino',
  (): Promise<string | null> => lerPastaDestino(),
);

// Abre a pasta de destino no Explorer. shell.openPath devolve "" quando abre e
// a mensagem de erro quando não abre.
ipcMain.handle(
  'abrir-pasta-destino',
  async (): Promise<ResultadoAbrirPasta> => {
    const pasta = await lerPastaDestino();
    if (!pasta)
      return { status: 'erro', mensagem: 'Escolha a pasta de destino.' };
    if (!(await ehPasta(pasta)))
      return { status: 'erro', mensagem: pastaSumiu(pasta) };
    const erro = await shell.openPath(pasta);
    return erro
      ? { status: 'erro', mensagem: `Não foi possível abrir a pasta: ${erro}` }
      : { status: 'aberta' };
  },
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
  await gravarConfig({ pastaDestino: pasta });
  return pasta;
});

// ---------- salvar (PDF + cópia editada) ----------

/**
 * Nome base vindo do renderer, montado com os dados da nota
 * (src/nfe/nome.ts): FORNECEDOR_NF<número>, com -S<série> se a série não for 1.
 * Só letras maiúsculas, dígitos, hífen e o "_NF": nada que vire caminho.
 */
const NOME_BASE_VALIDO = /^[A-Z0-9]+(?:-[A-Z0-9]+)*_NF\d+(?:-S\d+)?$/;

/**
 * Nome base dos arquivos salvos: o dos dados da nota; se a nota não tem os
 * dados (sem emitente ou sem número), o do arquivo aberto, sem extensão e sem
 * sufixo de um salvamento anterior (-ps, _Conferencia).
 */
function nomeBase(doRenderer: unknown, caminho: string): string {
  if (
    typeof doRenderer === 'string' &&
    doRenderer.length <= 60 &&
    NOME_BASE_VALIDO.test(doRenderer)
  ) {
    return doRenderer;
  }
  return path
    .basename(caminho, path.extname(caminho))
    .replace(/(-ps|_Conferencia)+$/i, '');
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
 * `nomes(base)` monta os caminhos a partir do nome base (ver nomeBase).
 */
async function gravarSaidas(
  event: Electron.IpcMainInvokeEvent,
  baseDoRenderer: unknown,
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
  if (!(await ehPasta(pasta))) {
    return { status: 'erro', mensagem: pastaSumiu(pasta) };
  }

  const saidas = nomes(pasta, nomeBase(baseDoRenderer, arquivoAberto));
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

/** Opções do PDF da conferência: A4 retrato com margem de 10 mm. */
const PDF_CONFERENCIA: Electron.PrintToPDFOptions = {
  pageSize: 'A4',
  landscape: false,
  printBackground: true,
  margins: {
    top: MARGEM_PDF,
    bottom: MARGEM_PDF,
    left: MARGEM_PDF,
    right: MARGEM_PDF,
  },
};

/** Opções do PDF do DANFE: as margens são do próprio layout (folha de 210 x 297 mm). */
const PDF_DANFE: Electron.PrintToPDFOptions = {
  pageSize: 'A4',
  landscape: false,
  printBackground: true,
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
};

ipcMain.handle(
  'salvar',
  async (
    event,
    textoCopia: unknown,
    base: unknown,
  ): Promise<ResultadoSalvar> => {
    if (typeof textoCopia !== 'string' || textoCopia === '') {
      return { status: 'erro', mensagem: 'Cópia editada vazia.' };
    }
    // A cópia é gravada antes do PDF, como antes.
    const r = await gravarSaidas(event, base, (pasta, b) => [
      {
        destino: path.join(pasta, `${b}_Conferencia.psxml`),
        texto: textoCopia,
      },
      {
        destino: path.join(pasta, `${b}_Conferencia.pdf`),
        pdf: PDF_CONFERENCIA,
      },
    ]);
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', pdf: r.destinos[1], copia: r.destinos[0] };
  },
);

// Conferência pela tela de escolha: só o PDF, com as mesmas opções de salvar
// dentro do modo (não há cópia editada para guardar ainda).
ipcMain.handle(
  'salvar-pdf-conferencia',
  async (event, base: unknown): Promise<ResultadoSalvarDanfe> => {
    const r = await gravarSaidas(event, base, (pasta, b) => [
      {
        destino: path.join(pasta, `${b}_Conferencia.pdf`),
        pdf: PDF_CONFERENCIA,
      },
    ]);
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', pdf: r.destinos[0] };
  },
);

// DANFE: só o PDF (PDF_DANFE: o Electron imprime sem margem).
ipcMain.handle(
  'salvar-danfe',
  async (event, base: unknown): Promise<ResultadoSalvarDanfe> => {
    const r = await gravarSaidas(event, base, (pasta, b) => [
      {
        destino: path.join(pasta, `${b}_DANFE.pdf`),
        pdf: PDF_DANFE,
      },
    ]);
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', pdf: r.destinos[0] };
  },
);

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

// Impressora de cupom (térmica): a lista de nomes fica em src/impressoras.ts.

/**
 * Nome da impressora padrão do Windows, ou null. O Electron lista as
 * impressoras (getPrintersAsync), mas não diz qual é a padrão; o Windows a
 * guarda em HKCU\...\Windows, valor Device ("Nome,winspool,Ne01:"). Lido com
 * o reg.exe do próprio Windows; erro ou demora: null (sem aviso).
 */
function impressoraPadrao(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows',
        '/v',
        'Device',
      ],
      { timeout: 3000, windowsHide: true },
      (erro, saida) => {
        if (erro) return resolve(null);
        const m = /\bDevice\s+REG_SZ\s+([^\r\n]*)/.exec(String(saida));
        const nome = m ? m[1].split(',')[0].trim() : '';
        resolve(nome || null);
      },
    );
  });
}

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
  async (event, modo: unknown): Promise<ResultadoImprimir> => {
    // Antes do diálogo do Windows: se a padrão é de cupom, avisa. Cancelar
    // não abre o diálogo de impressão.
    const padrao = await impressoraPadrao();
    if (padrao && ehImpressoraCupom(padrao)) {
      const janela = BrowserWindow.fromWebContents(event.sender);
      const opcoes: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'Impressora de cupom',
        message: `A impressora padrão (${padrao}) é de cupom. Escolha outra impressora no próximo diálogo.`,
        buttons: ['Continuar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      };
      const { response } = janela
        ? await dialog.showMessageBox(janela, opcoes)
        : await dialog.showMessageBox(opcoes);
      if (response !== 0) return { status: 'cancelado' };
    }
    return new Promise((resolve) => {
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
    });
  },
);

// ---------- área de transferência e menu do botão direito ----------

const AVISOS_COPIA: AvisoCopia[] = ['Copiado', 'Chave copiada', 'Recortado'];
const LIMITE_TEXTO_COPIA = 1_000_000;

const textoValido = (t: unknown): t is string =>
  typeof t === 'string' && t.length <= LIMITE_TEXTO_COPIA;

function itemValido(i: unknown): i is ItemMenuCopia {
  if (typeof i !== 'object' || i === null) return false;
  const o = i as Record<string, unknown>;
  return (
    textoValido(o.rotulo) &&
    o.rotulo.length <= 200 &&
    textoValido(o.texto) &&
    AVISOS_COPIA.includes(o.aviso as AvisoCopia)
  );
}

/**
 * Copia um texto, ou mostra o menu do botão direito e faz a ação escolhida.
 * O renderer diz o que há no lugar do clique (caixa de texto, seleção, célula
 * ou chave); quem monta o menu e escreve na área de transferência é este
 * processo.
 */
ipcMain.handle(
  'area-transferencia',
  async (event, pedido: unknown): Promise<ResultadoAreaTransferencia> => {
    if (typeof pedido !== 'object' || pedido === null)
      return { status: 'nada' };
    const p = pedido as Record<string, unknown>;

    if (p.tipo === 'copiar') {
      if (
        !textoValido(p.texto) ||
        !AVISOS_COPIA.includes(p.aviso as AvisoCopia)
      ) {
        return { status: 'nada' };
      }
      await clipboard.writeText(p.texto);
      return { status: 'copiado', aviso: p.aviso as AvisoCopia };
    }

    if (p.tipo !== 'menu') return { status: 'nada' };
    const janela = BrowserWindow.fromWebContents(event.sender);
    if (!janela) return { status: 'nada' };
    const editavel = p.editavel === true;
    const selecao = textoValido(p.selecao) ? p.selecao : '';
    const itens = Array.isArray(p.itens) ? p.itens.filter(itemValido) : [];
    const wc = event.sender;

    return new Promise((resolve) => {
      let resolvido = false;
      const fim = (r: ResultadoAreaTransferencia) => {
        if (resolvido) return;
        resolvido = true;
        resolve(r);
      };
      const copiar = (texto: string, aviso: AvisoCopia) => () => {
        void clipboard
          .writeText(texto)
          .then(() => fim({ status: 'copiado', aviso }));
      };
      const modelo: Electron.MenuItemConstructorOptions[] = [];
      if (editavel) {
        modelo.push(
          {
            label: 'Recortar',
            enabled: selecao !== '',
            // Primeiro grava a seleção; depois apaga na caixa (cut do Chromium).
            click: () => {
              void clipboard.writeText(selecao).then(() => {
                wc.delete();
                fim({ status: 'copiado', aviso: 'Recortado' });
              });
            },
          },
          {
            label: 'Copiar',
            enabled: selecao !== '',
            click: copiar(selecao, 'Copiado'),
          },
          {
            label: 'Colar',
            click: () => (wc.paste(), fim({ status: 'nada' })),
          },
          { type: 'separator' },
          {
            label: 'Selecionar tudo',
            click: () => (wc.selectAll(), fim({ status: 'nada' })),
          },
        );
      } else if (selecao) {
        modelo.push({ label: 'Copiar', click: copiar(selecao, 'Copiado') });
      }
      if (itens.length > 0) {
        if (modelo.length > 0) modelo.push({ type: 'separator' });
        for (const i of itens)
          modelo.push({ label: i.rotulo, click: copiar(i.texto, i.aviso) });
      }
      if (modelo.length === 0) return fim({ status: 'nada' });
      Menu.buildFromTemplate(modelo).popup({
        window: janela,
        // Fechado sem escolher: o clique, se houve, chega antes de terminar.
        callback: () => setTimeout(() => fim({ status: 'nada' }), 300),
      });
    });
  },
);

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

app.whenReady().then(() => {
  // Evento do Squirrel ou segunda instância: o app está saindo, sem janela.
  if (started || !instanciaPrincipal) return;
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
