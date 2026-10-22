import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from 'electron';
import { execFile } from 'node:child_process';
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

// ---------- config.json em userData (pasta de destino, última pasta) ----------

interface Config {
  pastaDestino?: unknown;
  ultimaPastaAbertura?: unknown;
}

function caminhoConfig(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

async function lerConfig(): Promise<Config> {
  try {
    const config: unknown = JSON.parse(await readFile(caminhoConfig(), 'utf8'));
    if (typeof config === 'object' && config !== null) return config as Config;
  } catch {
    // Sem config (primeira execução) ou arquivo ilegível: config vazia.
  }
  return {};
}

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
  await gravarConfig({ pastaDestino: pasta });
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

// Impressora de cupom (térmica): o nome da impressora padrão contém uma destas
// palavras, sem diferenciar maiúsculas nem acentos ("térmica" e "termica").
// É a única lista; para incluir outra marca ou modelo, acrescente aqui.
const PALAVRAS_IMPRESSORA_CUPOM = ['elgin', 'pos', 'térmica', '80mm', '58mm'];

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function ehImpressoraCupom(nome: string): boolean {
  const n = semAcento(nome);
  return PALAVRAS_IMPRESSORA_CUPOM.some((p) => n.includes(semAcento(p)));
}

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
