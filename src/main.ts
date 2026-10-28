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
import {
  configPadrao,
  lerConfigTexto,
  NOME_EXPORTACAO,
  textoConfig,
  validarConfig,
  type ConfigConferencia,
} from './nfe/config';
import { MARGEM_FOLHA_MM } from './nfe/folha';
import { problemaNomeArquivo } from './nfe/nome';

// Eventos do Squirrel antes de qualquer outra inicialização: atalhos
// (electron-squirrel-startup, que sai quando o Update.exe termina) e a
// associação do .psxml no registro do usuário (src/associacao.ts).
tratarEventoSquirrel(process.argv[1]);
if (started) {
  app.quit();
}

// O mesmo AUMID que o Squirrel grava nos atalhos, para a barra de tarefas
// juntar o atalho fixado e a janela aberta: com.squirrel.<id>.<exe>, com o id
// do pacote (name do MakerSquirrel, PSXmlReader) e o nome do executável sem
// .exe, os dois sem espaços. "PS Reader.exe" vira com.squirrel.PSXmlReader.PSReader.
app.setAppUserModelId(
  `com.squirrel.PSXmlReader.${path.basename(process.execPath, '.exe').replace(/ /g, '')}`,
);

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

/** Arquivo da linha de comando (duplo clique com o app fechado). */
const arquivoInicial = started
  ? null
  : arquivoDosArgumentos(process.argv, process.cwd());

// Instância única: um processo só, com várias janelas. Se o app já está
// aberto, o arquivo vai para ele (evento second-instance) e esta instância
// sai. O caminho vai em additionalData, porque o argv que chega lá pode vir
// reordenado.
const instanciaPrincipal =
  !started && app.requestSingleInstanceLock({ arquivo: arquivoInicial });
if (!started && !instanciaPrincipal) app.quit();

// Duplo clique com o app aberto: o arquivo segue as regras de entregarArquivo
// (janela que já o tem, janela vazia ou janela nova). Um .psxml aberto assim
// faz da pasta dele a pasta de destino só daquela janela.
app.on('second-instance', (_event, argv, pasta, dados) => {
  const pedido = (dados as { arquivo?: unknown } | null)?.arquivo;
  const arquivo =
    typeof pedido === 'string'
      ? arquivoDosArgumentos(['', pedido], pasta)
      : arquivoDosArgumentos(argv, pasta);
  if (arquivo) {
    entregarArquivo(arquivo, { modo: null, sessao: true });
    return;
  }
  // Sem arquivo: só traz o app para a frente.
  const j = janelaEmFoco();
  if (j) trazerParaFrente(j);
});

// 10 mm em polegadas. printToPDF recebe margens em polegadas.
const MARGEM_PDF = MARGEM_FOLHA_MM / 25.4;
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

// ---------- janelas (uma nota por janela) ----------

/** Arquivo que a janela vai abrir assim que o renderer pedir. */
interface PedidoArquivo {
  caminho: string;
  /** Abre direto neste modo (Nova janela pela tela de escolha); null: o normal. */
  modo: ModoImpressao | null;
  /** Duplo clique: um .psxml faz da pasta dele a pasta desta janela. */
  sessao: boolean;
}

/**
 * Estado de cada janela. Cada uma tem a sua nota; configuração e pasta de
 * destino salva são do app inteiro (config.json) e valem para todas.
 */
interface Janela {
  janela: BrowserWindow;
  /** Ordem de criação: a mais antiga aberta guarda tamanho e posição. */
  ordem: number;
  /**
   * Arquivo aberto na janela; null na tela inicial. Se for uma NF-e original,
   * o app nunca grava nele: salvar recusa qualquer destino que resolva para
   * ele. Uma cópia editada pode ser regravada.
   */
  arquivoAberto: string | null;
  abertoEhCopia: boolean;
  /** O renderer tem anotações alteradas e não salvas. */
  pendentes: boolean;
  /** Já perguntou e pode fechar: o próximo close não é barrado. */
  liberada: boolean;
  /**
   * Pasta de destino só desta janela: a de um .psxml aberto nela por duplo
   * clique. Só em memória, nunca vai para o config.json; some ao fechar a
   * janela ou ao escolher uma pasta no botão.
   */
  pastaSessao: string | null;
  /** Arquivo a entregar ao renderer (abrir-externo). */
  pedido: PedidoArquivo | null;
  /** XML lido para a escolha por cima da nota (Abrir aqui ou Nova janela). */
  candidato: string | null;
}

const janelas = new Map<number, Janela>();
let proximaOrdem = 0;

/** Estado da janela de um evento do renderer. */
function estadoDe(wc: Electron.WebContents): Janela {
  const j = janelas.get(wc.id);
  if (!j) throw new Error('Janela não encontrada.');
  return j;
}

const abertas = () =>
  [...janelas.values()].filter((j) => !j.janela.isDestroyed());

/** A janela em foco, ou a última aberta. */
function janelaEmFoco(): Janela | null {
  const foco = BrowserWindow.getFocusedWindow();
  const lista = abertas();
  return (
    lista.find((j) => j.janela === foco) ?? lista[lista.length - 1] ?? null
  );
}

function trazerParaFrente(j: Janela): void {
  if (j.janela.isMinimized()) j.janela.restore();
  j.janela.show();
  j.janela.focus();
}

/** Avisa as outras janelas (configuração ou pasta de destino salva mudou). */
function avisarOutras(
  origem: Electron.WebContents,
  canal: string,
  ...args: unknown[]
): void {
  for (const j of abertas())
    if (j.janela.webContents !== origem)
      j.janela.webContents.send(canal, ...args);
}

/** Deslocamento de uma janela nova em relação à anterior. */
const DESLOCAMENTO_JANELA = 32;

/**
 * Posição de uma janela nova: a da janela anterior (tamanho normal, fora do
 * maximizado), um pouco para a direita e para baixo. Se sair da área de
 * trabalho daquele monitor, volta para o canto dela.
 */
function posicaoPerto(anterior: Janela): EstadoJanela {
  const b = anterior.janela.getNormalBounds();
  const a = screen.getDisplayMatching(b).workArea;
  let x = b.x + DESLOCAMENTO_JANELA;
  let y = b.y + DESLOCAMENTO_JANELA;
  if (x + b.width > a.x + a.width) x = a.x;
  if (y + b.height > a.y + a.height) y = a.y;
  return { x, y, width: b.width, height: b.height, maximizada: false };
}

/**
 * Cria uma janela. A primeira usa o tamanho e a posição lembrados; as outras
 * abrem deslocadas da anterior (a última aberta). `pedido`: arquivo que ela
 * abre logo.
 */
function criarJanela(pedido: PedidoArquivo | null): Janela {
  const anterior = abertas().reduce<Janela | null>(
    (ultima, j) => (!ultima || j.ordem > ultima.ordem ? j : ultima),
    null,
  );
  const inicial = anterior ? posicaoPerto(anterior) : posicaoInicial();
  const janela = new BrowserWindow({
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
  const j: Janela = {
    janela,
    ordem: proximaOrdem++,
    arquivoAberto: null,
    abertoEhCopia: false,
    pendentes: false,
    liberada: false,
    pastaSessao: null,
    pedido,
    candidato: null,
  };
  const id = janela.webContents.id;
  janelas.set(id, j);
  janela.on('closed', () => janelas.delete(id));

  janela.once('ready-to-show', () => {
    // maximize também mostra a janela.
    if (inicial.maximizada) janela.maximize();
    janela.show();
  });

  // O app é offline: não abre janelas do navegador nem navega para fora.
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (event) => event.preventDefault());

  // Todo pedido de fechar passa pelo lote (pedirFechamento), que pergunta
  // nas janelas com anotações não salvas e só então libera. A janela mais
  // antiga aberta guarda tamanho e posição.
  janela.on('close', (event) => {
    if (!j.liberada && !janela.webContents.isCrashed()) {
      event.preventDefault();
      pedirFechamento(j);
      return;
    }
    if (abertas().every((o) => o.ordem >= j.ordem)) guardarJanela(janela);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    janela.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    janela.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  return j;
}

/** Janela que já está com este arquivo aberto, se houver. */
function janelaComArquivo(caminho: string): Janela | null {
  return (
    abertas().find(
      (j) =>
        (j.arquivoAberto && mesmoCaminho(j.arquivoAberto, caminho)) ||
        (j.pedido && mesmoCaminho(j.pedido.caminho, caminho)),
    ) ?? null
  );
}

/**
 * Leva um arquivo pedido de fora (duplo clique, linha de comando) para uma
 * janela: a que já está com ele vem para a frente; senão, uma janela na tela
 * inicial é reaproveitada; senão, abre uma janela nova.
 */
function entregarArquivo(
  caminho: string,
  pedido: Omit<PedidoArquivo, 'caminho'>,
): void {
  const ja = janelaComArquivo(caminho);
  if (ja) {
    trazerParaFrente(ja);
    return;
  }
  const vazia = abertas().find((j) => !j.arquivoAberto && !j.pedido);
  if (vazia) {
    vazia.pedido = { caminho, ...pedido };
    trazerParaFrente(vazia);
    vazia.janela.webContents.send('arquivo-externo');
    return;
  }
  criarJanela({ caminho, ...pedido });
}

// ---------- fechar com anotações não salvas ----------

/** Respostas pendentes do renderer à pergunta de fechar, por janela. */
const respostasFechar = new Map<number, (pode: boolean) => void>();

/** Pede ao renderer da janela a pergunta de sempre; true = pode fechar. */
function perguntarFechar(j: Janela): Promise<boolean> {
  const id = j.janela.webContents.id;
  return new Promise((resolve) => {
    respostasFechar.set(id, resolve);
    j.janela.webContents.send('pedido-fechar');
  });
}

ipcMain.on('resposta-fechar', (event, pode: unknown) => {
  const resolver = respostasFechar.get(event.sender.id);
  respostasFechar.delete(event.sender.id);
  resolver?.(pode === true);
});

/**
 * Janelas cujo fechamento foi pedido. Fechar o app inteiro (por exemplo
 * "Fechar todas as janelas" na barra de tarefas) pede o fechamento de todas
 * quase ao mesmo tempo: elas entram no mesmo lote, e a pergunta é feita uma
 * janela por vez, só nas que têm anotações não salvas. Cancelar em qualquer
 * uma interrompe o fechamento: nenhuma janela do lote fecha. Fechar uma
 * janela só é um lote de uma janela (pergunta só por ela).
 */
let loteFechar: Janela[] = [];
let temporizadorLote: ReturnType<typeof setTimeout> | null = null;
let perguntandoLote = false;
/** Tempo para juntar os pedidos de fechar que chegam juntos. */
const ESPERA_LOTE_MS = 250;

function pedirFechamento(j: Janela): void {
  if (!loteFechar.includes(j)) loteFechar.push(j);
  if (!temporizadorLote && !perguntandoLote)
    temporizadorLote = setTimeout(() => void processarLote(), ESPERA_LOTE_MS);
}

async function processarLote(): Promise<void> {
  temporizadorLote = null;
  perguntandoLote = true;
  const fila = loteFechar;
  loteFechar = [];
  try {
    for (const j of fila) {
      if (j.janela.isDestroyed() || !j.pendentes) continue;
      trazerParaFrente(j);
      if (!(await perguntarFechar(j))) {
        // Cancelou: nenhuma janela do lote fecha, nem as que pediram para
        // fechar enquanto perguntava.
        loteFechar = [];
        return;
      }
    }
    for (const j of fila) {
      if (j.janela.isDestroyed()) continue;
      j.liberada = true;
      j.janela.close();
    }
  } finally {
    perguntandoLote = false;
    if (loteFechar.length > 0 && !temporizadorLote)
      temporizadorLote = setTimeout(() => void processarLote(), 0);
  }
}

ipcMain.on('anotacoes-pendentes', (event, pendentes: unknown) => {
  const j = janelas.get(event.sender.id);
  if (j) j.pendentes = pendentes === true;
});

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

/** Lê um arquivo e o torna o arquivo aberto da janela `j`. */
async function lerArquivoNaJanela(
  j: Janela,
  caminho: string,
  texto?: string,
): Promise<ArquivoAberto> {
  const conteudo = texto ?? (await readFile(caminho, 'utf8'));
  j.arquivoAberto = caminho;
  j.candidato = null;
  const raiz = nomeRaiz(conteudo);
  j.abertoEhCopia = raiz === 'psCopiaEditada';
  // Aberto com sucesso (é NF-e ou cópia editada): a pasta dele vira o ponto de
  // partida do próximo diálogo de abrir. Falha ao gravar não impede a abertura.
  if (RAIZES_ACEITAS.includes(raiz)) {
    await gravarConfig({ ultimaPastaAbertura: path.dirname(caminho) }).catch(
      () => {},
    );
  }
  return { nome: path.basename(caminho), texto: conteudo };
}

/**
 * Abrir arquivo pelo botão, Ctrl+O ou arrastando para a janela `j`:
 * - já aberto em alguma janela: ela vem para a frente;
 * - `j` na tela inicial: abre nela;
 * - .psxml com nota aberta: janela nova, direto na Conferência;
 * - XML com nota aberta: a tela de escolha aparece por cima da nota, com
 *   Abrir aqui e Nova janela (confirmar-abertura).
 */
async function decidirAbertura(
  j: Janela,
  caminho: string,
): Promise<ResultadoAbrir> {
  const ja = janelaComArquivo(caminho);
  if (ja) {
    trazerParaFrente(ja);
    return { status: ja === j ? 'ja-aberto' : 'outra-janela' };
  }
  const texto = await readFile(caminho, 'utf8');
  if (!j.arquivoAberto)
    return {
      status: 'aqui',
      arquivo: await lerArquivoNaJanela(j, caminho, texto),
    };
  if (nomeRaiz(texto) === 'psCopiaEditada') {
    criarJanela({ caminho, modo: null, sessao: false });
    return { status: 'nova-janela' };
  }
  j.candidato = caminho;
  return {
    status: 'escolher',
    arquivo: { nome: path.basename(caminho), texto },
  };
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

ipcMain.handle('abrir-arquivo', async (event): Promise<ResultadoAbrir> => {
  const j = estadoDe(event.sender);
  const inicial = await pastaInicialAbertura();
  const { canceled, filePaths } = await dialog.showOpenDialog(j.janela, {
    title: 'Abrir XML da NF-e',
    filters: [
      { name: 'XML da NF-e ou cópia editada', extensions: ['xml', 'psxml'] },
    ],
    properties: ['openFile'],
    ...(inicial ? { defaultPath: inicial } : {}),
  });
  if (canceled || filePaths.length === 0) return { status: 'cancelado' };
  return decidirAbertura(j, filePaths[0]);
});

// Arrastar e soltar: o renderer só conhece o caminho do arquivo solto.
ipcMain.handle(
  'abrir-caminho',
  async (event, caminho: unknown): Promise<ResultadoAbrir> => {
    if (
      typeof caminho !== 'string' ||
      !path.isAbsolute(caminho) ||
      !EXTENSOES_ABERTURA.includes(path.extname(caminho).toLowerCase())
    ) {
      throw new Error('Selecione um arquivo .xml ou .psxml.');
    }
    return decidirAbertura(estadoDe(event.sender), caminho);
  },
);

/**
 * Resposta à tela de escolha por cima da nota: Abrir aqui (o renderer já
 * perguntou sobre anotações não salvas), Nova janela (no modo escolhido) ou
 * Cancelar.
 */
ipcMain.handle(
  'confirmar-abertura',
  async (
    event,
    destino: unknown,
    modo: unknown,
  ): Promise<ArquivoAberto | null> => {
    const j = estadoDe(event.sender);
    const caminho = j.candidato;
    j.candidato = null;
    if (!caminho || destino === 'cancelar') return null;
    if (destino === 'aqui') {
      j.pastaSessao = null;
      return lerArquivoNaJanela(j, caminho);
    }
    criarJanela({
      caminho,
      modo: modo === 'danfe' || modo === 'conferencia' ? modo : null,
      sessao: false,
    });
    return null;
  },
);

/** A janela voltou para a tela inicial (Início ou arquivo que não abriu). */
ipcMain.on('sem-nota', (event) => {
  const j = janelas.get(event.sender.id);
  if (!j) return;
  j.arquivoAberto = null;
  j.abertoEhCopia = false;
});

// Arquivo pedido de fora para esta janela (duplo clique, linha de comando,
// Nova janela): o renderer pede ao abrir e depois de cada aviso
// 'arquivo-externo'. null se não há. Um .psxml aberto por duplo clique faz da
// pasta dele a pasta de destino só desta janela.
ipcMain.handle(
  'abrir-externo',
  async (event): Promise<ArquivoExterno | null> => {
    const j = estadoDe(event.sender);
    const pedido = j.pedido;
    j.pedido = null;
    if (!pedido) return null;
    const arquivo = await lerArquivoNaJanela(j, pedido.caminho);
    const copia =
      pedido.sessao &&
      j.abertoEhCopia &&
      path.extname(pedido.caminho).toLowerCase() === EXTENSAO;
    if (copia) j.pastaSessao = path.dirname(pedido.caminho);
    return {
      ...arquivo,
      pastaSessao: copia ? j.pastaSessao : null,
      modo: pedido.modo,
    };
  },
);

// ---------- config.json em userData (pasta de destino, última pasta, janela, conferência) ----------

interface Config {
  pastaDestino?: unknown;
  ultimaPastaAbertura?: unknown;
  janela?: unknown;
  /** Personalização da conferência (src/nfe/config.ts). */
  conferencia?: unknown;
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

/**
 * Pasta onde o Salvar da janela grava, a mesma que o botão dela mostra: a
 * pasta só desta janela (duplo clique num .psxml), se houver, senão a pasta
 * salva no config.json.
 */
async function pastaEfetiva(j: Janela): Promise<PastaDestino> {
  if (j.pastaSessao) return { caminho: j.pastaSessao, sessao: true };
  return { caminho: await lerPastaDestino(), sessao: false };
}

const pastaSumiu = ({ caminho, sessao }: PastaDestino) =>
  sessao
    ? `A pasta do arquivo aberto não existe mais: ${caminho}. Escolha outra pasta de destino.`
    : `A pasta de destino não existe mais: ${caminho}. Escolha outra.`;

/** Limite do caminho nas mensagens (o fim do caminho fica sempre inteiro). */
const LIMITE_CAMINHO_MENSAGEM = 60;

/**
 * Caminho encurtado no meio para as mensagens: o disco no começo e as últimas
 * pastas inteiras no fim ("H:\…\notas\testes").
 */
function encurtarCaminho(caminho: string): string {
  if (caminho.length <= LIMITE_CAMINHO_MENSAGEM) return caminho;
  const partes = caminho.split(/[\\/]/).filter((p) => p !== '');
  let fim = partes[partes.length - 1] ?? '';
  for (let i = partes.length - 2; i > 0; i--) {
    const maior = `${partes[i]}\\${fim}`;
    if (partes[0].length + 3 + maior.length > LIMITE_CAMINHO_MENSAGEM) break;
    fim = maior;
  }
  return `${partes[0]}\\…\\${fim}`;
}

/** true se os dois caminhos são o mesmo (sem diferenciar maiúsculas). */
const mesmoCaminho = (a: string, b: string) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** true se as duas pastas são a mesma (sem diferenciar maiúsculas). */
const mesmaPasta = (a: string, b: string) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

ipcMain.handle(
  'pasta-destino',
  (event): Promise<PastaDestino> => pastaEfetiva(estadoDe(event.sender)),
);

// Abre a pasta de destino no Explorer. shell.openPath devolve "" quando abre e
// a mensagem de erro quando não abre.
ipcMain.handle(
  'abrir-pasta-destino',
  async (event): Promise<ResultadoAbrirPasta> => {
    const efetiva = await pastaEfetiva(estadoDe(event.sender));
    const pasta = efetiva.caminho;
    if (!pasta)
      return { status: 'erro', mensagem: 'Escolha a pasta de destino.' };
    if (!(await ehPasta(pasta)))
      return { status: 'erro', mensagem: pastaSumiu(efetiva) };
    const erro = await shell.openPath(pasta);
    return erro
      ? { status: 'erro', mensagem: `Não foi possível abrir a pasta: ${erro}` }
      : { status: 'aberta' };
  },
);

ipcMain.handle('escolher-pasta', async (event): Promise<string | null> => {
  const j = estadoDe(event.sender);
  const janela = j.janela;
  const atual = (await pastaEfetiva(j)).caminho;
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

  // A escolha no botão vence: vira a pasta salva e a pasta só desta janela
  // deixa de valer. As outras janelas passam a mostrar a pasta nova (as que
  // têm pasta própria continuam com ela).
  const pasta = filePaths[0];
  await gravarConfig({ pastaDestino: pasta });
  j.pastaSessao = null;
  avisarOutras(event.sender, 'pasta-mudou');
  return pasta;
});

// ---------- personalização da conferência (colunas, anotações, layout) ----------

/**
 * Personalização salva. Sem a chave (primeira execução ou config antiga) ou
 * com conteúdo inválido: a padrão.
 */
async function lerConferencia(): Promise<ConfigConferencia> {
  const { conferencia } = await lerConfig();
  if (conferencia === undefined) return configPadrao();
  try {
    return validarConfig(conferencia);
  } catch {
    return configPadrao();
  }
}

/**
 * Grava a personalização e avisa as outras janelas, que aplicam na hora;
 * erro vira a mensagem para o renderer.
 */
async function gravarConferencia(
  config: ConfigConferencia,
  origem: Electron.WebContents,
): Promise<ResultadoConfig> {
  try {
    await gravarConfig({ conferencia: config });
    avisarOutras(origem, 'config-mudou', config);
    return { status: 'ok', config };
  } catch (erro) {
    return {
      status: 'erro',
      mensagem: `Não foi possível salvar a configuração: ${mensagemDe(erro)}`,
    };
  }
}

ipcMain.handle(
  'config-conferencia',
  (): Promise<ConfigConferencia> => lerConferencia(),
);

ipcMain.handle(
  'gravar-config-conferencia',
  async (event, config: unknown): Promise<ResultadoConfig> => {
    try {
      return await gravarConferencia(validarConfig(config), event.sender);
    } catch (erro) {
      return { status: 'erro', mensagem: mensagemDe(erro) };
    }
  },
);

/**
 * Exporta a personalização salva para um .json escolhido pelo usuário. Só a
 * personalização: pasta de destino, última pasta e janela são da máquina e
 * ficam de fora.
 */
ipcMain.handle(
  'exportar-config',
  async (event): Promise<ResultadoExportarConfig> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.SaveDialogOptions = {
      title: 'Exportar configuração',
      defaultPath: path.join(app.getPath('documents'), NOME_EXPORTACAO),
      filters: [{ name: 'Configuração do PS Reader', extensions: ['json'] }],
    };
    const { canceled, filePath } = janela
      ? await dialog.showSaveDialog(janela, opcoes)
      : await dialog.showSaveDialog(opcoes);
    if (canceled || !filePath) return { status: 'cancelado' };
    try {
      await writeFile(filePath, textoConfig(await lerConferencia()), 'utf8');
      return { status: 'exportado', caminho: filePath };
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível exportar a configuração: ${mensagemDe(erro)}`,
      };
    }
  },
);

/**
 * Importa um arquivo exportado. O arquivo inteiro é validado antes de
 * aplicar: inválido ou de versão desconhecida devolve o motivo e nada muda.
 */
ipcMain.handle(
  'importar-config',
  async (event): Promise<ResultadoConfig | { status: 'cancelado' }> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Importar configuração',
      filters: [{ name: 'Configuração do PS Reader', extensions: ['json'] }],
      properties: ['openFile'],
    };
    const { canceled, filePaths } = janela
      ? await dialog.showOpenDialog(janela, opcoes)
      : await dialog.showOpenDialog(opcoes);
    if (canceled || filePaths.length === 0) return { status: 'cancelado' };
    let config: ConfigConferencia;
    try {
      config = lerConfigTexto(await readFile(filePaths[0], 'utf8'));
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Configuração não importada; nada foi alterado. ${mensagemDe(erro)}`,
      };
    }
    return gravarConferencia(config, event.sender);
  },
);

/** Volta a personalização ao padrão, depois de confirmar. */
ipcMain.handle(
  'restaurar-config',
  async (event): Promise<ResultadoConfig | { status: 'cancelado' }> => {
    const janela = BrowserWindow.fromWebContents(event.sender);
    const opcoes: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Restaurar padrão',
      message:
        'Voltar as colunas e o layout da conferência ao padrão? As anotações extras saem da tabela, mas o texto já salvo nos arquivos .psxml não se perde.',
      buttons: ['Restaurar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    const { response } = janela
      ? await dialog.showMessageBox(janela, opcoes)
      : await dialog.showMessageBox(opcoes);
    if (response !== 0) return { status: 'cancelado' };
    return gravarConferencia(configPadrao(), event.sender);
  },
);

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
 * Grava as saídas na pasta de destino que o botão mostra (pastaEfetiva), com
 * as mesmas regras para o modo Conferência e o DANFE: recusa gravar sobre a
 * NF-e original aberta, pergunta antes de substituir e grava primeiro em
 * temporários (gravação segura). `nomes(base)` monta os caminhos a partir do
 * nome base (ver nomeBase).
 */
async function gravarSaidas(
  event: Electron.IpcMainInvokeEvent,
  baseDoRenderer: unknown,
  nomes: (pasta: string, base: string) => Saida[],
  /** Destinos que são o próprio arquivo aberto: substitui sem perguntar. */
  semPergunta: (destino: string) => boolean = () => false,
  /**
   * Usa o XML da tela de escolha por cima da nota (Salvar PDF das prévias)
   * em vez do arquivo aberto na janela.
   */
  doCandidato = false,
): Promise<
  | { status: 'salvo'; destinos: string[] }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string }
> {
  const j = estadoDe(event.sender);
  const janela = j.janela;
  const arquivoAberto = doCandidato ? j.candidato : j.arquivoAberto;
  const abertoEhCopia = doCandidato ? false : j.abertoEhCopia;
  if (!arquivoAberto) {
    return { status: 'erro', mensagem: 'Nenhum arquivo aberto.' };
  }

  const efetiva = await pastaEfetiva(j);
  const pasta = efetiva.caminho;
  if (!pasta) {
    return { status: 'erro', mensagem: 'Escolha a pasta de destino.' };
  }
  if (!(await ehPasta(pasta))) {
    return { status: 'erro', mensagem: pastaSumiu(efetiva) };
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
    if (!semPergunta(destino) && (await existe(destino)))
      existentes.push(path.basename(destino));
  }
  if (existentes.length > 0) {
    // A pasta real, encurtada no meio, com o fim inteiro.
    const onde = `em ${encurtarCaminho(pasta)}`;
    const { response } = await dialog.showMessageBox(janela, {
      type: 'question',
      title: 'Substituir arquivos',
      message:
        existentes.length === 1
          ? `O arquivo ${existentes[0]} já existe ${onde}. Deseja substituir?`
          : `Os arquivos ${existentes.join(' e ')} já existem ${onde}. Deseja substituir?`,
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

/** Opções do PDF da conferência na orientação pedida pelo renderer. */
const pdfConferencia = (paisagem: unknown): Electron.PrintToPDFOptions => ({
  ...PDF_CONFERENCIA,
  landscape: paisagem === true,
});

/**
 * Salvar da Conferência: só o .psxml, na pasta de destino que o botão mostra.
 * Cópia editada aberta que está nessa mesma pasta: grava por cima dela, sem
 * perguntar (é o próprio arquivo aberto). Em outra pasta, ou NF-e original:
 * um .psxml com o nome padrão, com a pergunta se ele já existir; o arquivo
 * aberto fica como está.
 */
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
    const j = estadoDe(event.sender);
    const copiaAberta = j.abertoEhCopia ? j.arquivoAberto : null;
    const r = await gravarSaidas(
      event,
      base,
      (pasta, b) => [
        {
          destino:
            copiaAberta && mesmaPasta(path.dirname(copiaAberta), pasta)
              ? copiaAberta
              : path.join(pasta, `${b}_Conferencia.psxml`),
          texto: textoCopia,
        },
      ],
      (destino) => copiaAberta !== null && mesmoCaminho(destino, copiaAberta),
    );
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', copia: r.destinos[0] };
  },
);

/**
 * PDF da Conferência (menu do Salvar e tela de escolha), na orientação que o
 * renderer calculou para a tabela caber.
 */
ipcMain.handle(
  'salvar-pdf-conferencia',
  async (
    event,
    base: unknown,
    paisagem: unknown,
    daEscolha: unknown,
  ): Promise<ResultadoSalvarDanfe> => {
    const r = await gravarSaidas(
      event,
      base,
      (pasta, b) => [
        {
          destino: path.join(pasta, `${b}_Conferencia.pdf`),
          pdf: pdfConferencia(paisagem),
        },
      ],
      undefined,
      daEscolha === true,
    );
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', pdf: r.destinos[0] };
  },
);

/**
 * Nome sugerido do Salvar cópia: <base>_Conferencia_copia1, ou copia2,
 * copia3... se já existir na pasta de destino em uso.
 */
ipcMain.handle(
  'sugerir-copia',
  async (event, base: unknown): Promise<SugestaoCopia> => {
    const j = estadoDe(event.sender);
    const arquivoAberto = j.arquivoAberto;
    if (!arquivoAberto)
      return { status: 'erro', mensagem: 'Nenhum arquivo aberto.' };
    const efetiva = await pastaEfetiva(j);
    const pasta = efetiva.caminho;
    if (!pasta)
      return { status: 'erro', mensagem: 'Escolha a pasta de destino.' };
    if (!(await ehPasta(pasta)))
      return { status: 'erro', mensagem: pastaSumiu(efetiva) };
    const b = nomeBase(base, arquivoAberto);
    for (let n = 1; ; n++) {
      const nome = `${b}_Conferencia_copia${n}`;
      if (!(await existe(path.join(pasta, `${nome}${EXTENSAO}`))))
        return { status: 'ok', pasta, nome };
    }
  },
);

/**
 * Salvar cópia: grava um .psxml novo com o nome digitado na pasta de destino
 * em uso. O arquivo aberto não muda (gravar sobre ele é recusado). Nome que
 * já existe: pergunta antes de substituir. Depois de gravar, a janela passa
 * a trabalhar na cópia: os próximos Salvar vão para ela.
 */
ipcMain.handle(
  'salvar-copia',
  async (
    event,
    textoCopia: unknown,
    nome: unknown,
  ): Promise<ResultadoSalvar> => {
    if (typeof textoCopia !== 'string' || textoCopia === '')
      return { status: 'erro', mensagem: 'Cópia editada vazia.' };
    if (typeof nome !== 'string')
      return { status: 'erro', mensagem: 'Nome da cópia inválido.' };
    const limpo = nome.trim().replace(/\.psxml$/i, '');
    const problema = problemaNomeArquivo(limpo);
    if (problema) return { status: 'erro', mensagem: problema };
    const j = estadoDe(event.sender);
    const aberto = j.arquivoAberto;
    const efetiva = await pastaEfetiva(j);
    if (
      aberto &&
      efetiva.caminho &&
      mesmoCaminho(path.join(efetiva.caminho, `${limpo}${EXTENSAO}`), aberto)
    ) {
      return {
        status: 'erro',
        mensagem:
          'Esse é o próprio arquivo aberto. Para gravar nele use Salvar; para a cópia, escolha outro nome.',
      };
    }
    const r = await gravarSaidas(event, null, (pasta) => [
      { destino: path.join(pasta, `${limpo}${EXTENSAO}`), texto: textoCopia },
    ]);
    if (r.status !== 'salvo') return r;
    j.arquivoAberto = r.destinos[0];
    j.abertoEhCopia = true;
    return { status: 'salvo', copia: r.destinos[0] };
  },
);

// DANFE: só o PDF (PDF_DANFE: o Electron imprime sem margem).
ipcMain.handle(
  'salvar-danfe',
  async (
    event,
    base: unknown,
    daEscolha: unknown,
  ): Promise<ResultadoSalvarDanfe> => {
    const r = await gravarSaidas(
      event,
      base,
      (pasta, b) => [
        {
          destino: path.join(pasta, `${b}_DANFE.pdf`),
          pdf: PDF_DANFE,
        },
      ],
      undefined,
      daEscolha === true,
    );
    if (r.status !== 'salvo') return r;
    return { status: 'salvo', pdf: r.destinos[0] };
  },
);

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
  async (
    event,
    modo: unknown,
    paisagem: unknown,
  ): Promise<ResultadoImprimir> => {
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
        modo === 'danfe'
          ? OPCOES_IMPRESSAO.danfe
          : { ...OPCOES_IMPRESSAO.conferencia, landscape: paisagem === true },
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
  criarJanela(
    arquivoInicial
      ? { caminho: arquivoInicial, modo: null, sessao: true }
      : null,
  );

  app.on('activate', () => {
    if (abertas().length === 0) criarJanela(null);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
