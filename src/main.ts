import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  screen,
  session,
  shell,
} from 'electron';
import { ouvir, tratar } from './ipcSeguro';
import { registrarEsquemaApp, servirEsquemaApp } from './protocoloApp';
import { PAGINA_INICIAL } from './seguranca/protocolo';
import { execFile } from 'node:child_process';
import {
  access,
  constants,
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { EXTENSAO, tratarEventoSquirrel } from './associacao';
import { registrarDocumentos, verificarAoAbrir } from './documentos';
import { ehImpressoraCupom } from './impressoras';
import { configPadrao, validarConfig } from './nfe/config';
import {
  lerArquivoPerfil,
  nomeArquivoPerfil,
  nomeLivre,
  novoIdPerfil,
  perfilAtivo,
  perfilComNome,
  perfisParaGravar,
  problemaNomePerfil,
  textoArquivoPerfil,
  PASTA_PERFIS_EXCLUIDOS,
  type Perfil,
  type Perfis,
} from './nfe/perfis';
import { guardarCopiaPerfil, type MotivoCopiaPerfil } from './perfisExcluidos';
import { MARGEM_FOLHA_MM } from './nfe/folha';
import {
  ALTURA_MINIMA,
  ALTURA_PADRAO,
  LARGURA_MINIMA,
  LARGURA_PADRAO,
  estadoSalvo,
  posicaoVisivel,
  type EstadoJanela,
} from './tamanhoJanela';
import {
  ferramentasDoPerfil,
  lerFerramentas,
  lerFerramentasPorPerfil,
  type AbrirNotasEm,
  semPerfisExcluidos,
} from './nfe/ferramentasPerfil';
import {
  EXTENSAO_BACKUP,
  importarBackup,
  lerArquivoBackup,
  listarDadosApp,
  montarBackup,
  nomeArquivoBackup,
  resumoBackup,
  textoBackup,
  type Backup,
} from './dadosApp';
import {
  chaveDoArquivo,
  cnpjDaConfig,
  DIAS_AVISO_VENCIMENTO_PADRAO,
  DIAS_NOTA_ANTIGA_PADRAO,
  diasDaConfig,
  nomePodeSerConferencia,
} from './nfe/avisos';
import { problemaCnpj } from './nfe/cnpj';
// XML que não é NF-e abre no leitor genérico (parte 3); NF-e acima de 5 MB é
// lida no serviço de leitura pesada (parte 2).
import { destinoDoArquivo } from './leitorXml/destino';
import {
  abrirNoLeitor,
  caminhoNoLeitor,
  esquecerLeitor,
  guardarNoLeitor,
} from './leitorXml/principal';
import { lerNfeNoServico } from './servico/principal';
import { problemaNomeArquivo } from './nfe/nome';
import {
  ESPERA_CAMINHO_MS,
  comLimite,
  ehCaminhoDeDispositivo,
  escolherCandidato,
  existeOuSemResposta,
  mensagemSemResposta,
  problemaCaminhoSolto,
} from './seguranca/arquivo';
import { opcoesPerigosas } from './seguranca/argumentos';
import {
  ArquivoRecusadoError,
  problemaTamanhoNfe,
  verificarXmlSeguro,
} from './seguranca/xml';
import {
  estaNaLista,
  lerRecentes,
  registrarRecente,
  removerRecente,
  type NotaRecente,
} from './nfe/recentes';

// Eventos do Squirrel antes de qualquer outra inicialização: atalhos
// (electron-squirrel-startup, que sai quando o Update.exe termina) e a
// associação do .psxml no registro do usuário (src/associacao.ts).
tratarEventoSquirrel(process.argv[1]);
if (started) {
  app.quit();
}

// Opções que dariam controle do app por fora (depuração remota, inspetor,
// opções do V8, outra pasta de dados): no app instalado, sai antes de criar
// janela (src/seguranca/argumentos.ts). No npm start valem, para testar.
const opcoesRecusadas = app.isPackaged ? opcoesPerigosas(process.argv) : [];
if (opcoesRecusadas.length > 0) {
  console.error(`Opções recusadas: ${opcoesRecusadas.join(' ')}`);
  app.exit(1);
}
/** O app está saindo antes de começar (evento do Squirrel ou opção recusada). */
const saindo = started || opcoesRecusadas.length > 0;

// A tela vem do protocolo próprio app://ps/ (src/protocoloApp.ts), não de
// file://. O esquema precisa ser registrado antes de o app ficar pronto.
registrarEsquemaApp();

// O mesmo AUMID que o Squirrel grava nos atalhos, para a barra de tarefas
// juntar o atalho fixado e a janela aberta: com.squirrel.<id>.<exe>, com o id
// do pacote (name do MakerSquirrel, PSXmlReader) e o nome do executável sem
// .exe, os dois sem espaços. "PS Reader.exe" vira com.squirrel.PSXmlReader.PSReader.
app.setAppUserModelId(
  `com.squirrel.PSXmlReader.${path.basename(process.execPath, '.exe').replace(/ /g, '')}`,
);

// ---------- arquivo passado na linha de comando (duplo clique) ----------

/**
 * Caminhos candidatos nos argumentos: os .psxml e .xml, na ordem. Ignora as
 * opções (--squirrel-firstrun, as do Chromium) e o resto que o npm start
 * passa (o executável do Electron, a pasta do app), que não são arquivos com
 * essas extensões. Relativo vale a partir de `pasta`. Não toca no disco.
 */
function candidatosDosArgumentos(argv: string[], pasta: string): string[] {
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-'))
    .filter((arg) =>
      [EXTENSAO, '.xml'].includes(path.extname(arg).toLowerCase()),
    )
    .map((arg) => path.resolve(pasta, arg));
}

/**
 * Pedido de abrir vindo do duplo clique: o primeiro candidato que é um
 * arquivo (cada um tem até 2 s para responder, sem prender o processo
 * principal nem as outras janelas). Se nenhum é, mas algum não respondeu, o
 * pedido leva a mensagem da pasta de rede (a pessoa pediu para abrir).
 */
async function pedidoDosCandidatos(
  candidatos: string[],
): Promise<PedidoArquivo | null> {
  const escolha = await escolherCandidato(candidatos);
  if (!escolha) return null;
  return {
    caminho: escolha.caminho,
    modo: null,
    sessao: true,
    ...(escolha.semResposta
      ? { recusa: mensagemSemResposta(escolha.caminho) }
      : {}),
  };
}

/** Candidatos da linha de comando (duplo clique com o app fechado). */
const candidatosIniciais = saindo
  ? []
  : candidatosDosArgumentos(process.argv, process.cwd());

// Instância única: um processo só, com várias janelas. Se o app já está
// aberto, os caminhos vão para ele (evento second-instance) e esta instância
// sai. Vão em additionalData, porque o argv que chega lá pode vir
// reordenado. `arquivo` (o primeiro) é o que as versões até a 1.2.4 leem.
const instanciaPrincipal =
  !saindo &&
  app.requestSingleInstanceLock({
    arquivo: candidatosIniciais[0] ?? null,
    arquivos: candidatosIniciais,
  });
if (!saindo && !instanciaPrincipal) app.quit();

/** Caminhos de additionalData: a lista nova ou o `arquivo` das versões antigas. */
function candidatosRecebidos(dados: unknown): string[] | null {
  const d = (typeof dados === 'object' && dados !== null ? dados : {}) as {
    arquivos?: unknown;
    arquivo?: unknown;
  };
  if (Array.isArray(d.arquivos))
    return d.arquivos.filter((a): a is string => typeof a === 'string');
  return typeof d.arquivo === 'string' ? [d.arquivo] : null;
}

// Duplo clique com o app aberto: o arquivo segue as regras de entregarArquivo
// (janela que já o tem, janela vazia ou janela nova). Um .psxml aberto assim
// faz da pasta dele a pasta de destino só daquela janela.
app.on('second-instance', (_event, argv, pasta, dados) => {
  const recebidos = candidatosRecebidos(dados);
  const candidatos = recebidos
    ? candidatosDosArgumentos(['', ...recebidos], pasta)
    : candidatosDosArgumentos(argv, pasta);
  void pedidoDosCandidatos(candidatos).then((pedido) => {
    if (pedido) {
      const { caminho, ...resto } = pedido;
      entregarArquivo(caminho, resto);
      return;
    }
    // Sem arquivo: só traz o app para a frente.
    const j = janelaEmFoco();
    if (j) trazerParaFrente(j);
  });
});

// Proteções para toda página que o app criar (as janelas de nota e qualquer
// outra que venha a existir): nenhuma navegação para fora, nenhum quadro
// navegando, nenhuma janela nova e nenhum <webview>. O app é offline e tem
// uma página só. A única exceção é a recarga do Vite no npm start.
app.on('web-contents-created', (_event, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    if (!recargaDoDesenvolvimento(url)) event.preventDefault();
  });
  wc.on('will-frame-navigate', (event) => {
    if (!(event.isMainFrame && recargaDoDesenvolvimento(event.url)))
      event.preventDefault();
  });
  wc.on('will-attach-webview', (event) => event.preventDefault());
});

// 10 mm em polegadas. printToPDF recebe margens em polegadas.
const MARGEM_PDF = MARGEM_FOLHA_MM / 25.4;
// 10 mm em pixels (96 por polegada). print recebe margens em pixels.
const MARGEM_IMPRESSAO = Math.round(MARGEM_PDF * 96);

// ---------- tamanho e posição da janela (config.json, chave "janela") ----------

// Tamanho mínimo e padrão e a leitura do que foi salvo: src/tamanhoJanela.ts.

/**
 * Tamanho e posição de abertura: os salvos ao fechar, se ainda caem num
 * monitor conectado; senão, o tamanho padrão centralizado no monitor principal.
 * Lido de forma síncrona: a janela é criada logo em seguida.
 */
function posicaoInicial(): EstadoJanela {
  const salvo = estadoSalvo(lerConfigSync().janela);
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  if (salvo && posicaoVisivel(salvo, areas)) return salvo;
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
  /** Abre direto neste modo (nota já conferida: Conferência); null: o normal. */
  modo: ModoImpressao | null;
  /** Duplo clique: um .psxml faz da pasta dele a pasta desta janela. */
  sessao: boolean;
  /**
   * Recuperar este rascunho ao abrir (aviso da abertura do app).
   * `semOriginal`: `caminho` é a cópia .recuperado.psxml do rascunho.
   */
  rascunho?: { id: string; semOriginal: boolean };
  /**
   * O arquivo já foi recusado antes de chegar à janela (pasta de rede que
   * não respondeu): a janela só mostra esta mensagem, sem ler nada.
   */
  recusa?: string;
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
  /** .psxml achados pela busca de nota já conferida: só esses o renderer abre. */
  conferidos: Set<string>;
  /** Último .psxml salvo por esta janela (vai para as notas recentes). */
  ultimoSalvo: string | null;
  /**
   * Rascunho da nota desta janela (src/rascunhos.ts): o que ela gravou por
   * último ou o que veio com o arquivo aberto. null sem nota.
   */
  rascunhoId: string | null;
  /**
   * Nota recuperada sem o original (a janela abriu a cópia de dentro do
   * rascunho): o rascunho continua apontando para o arquivo de antes.
   */
  origemRascunho: { caminho: string; tipo: 'xml' | 'psxml' } | null;
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
    // Barra de título própria (index.html, .titulo-janela): a faixa preta de
    // 36 px é do app; minimizar, maximizar e fechar são os do Windows,
    // desenhados por cima, na cor da barra (--ps-preto) e com símbolos claros.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#161616', symbolColor: '#ffffff', height: 36 },
    // Os padrões seguros do Electron, explícitos: janela isolada, sem Node e
    // em sandbox, com as regras de origem do navegador. DevTools só no
    // npm start.
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
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
    conferidos: new Set(),
    ultimoSalvo: null,
    rascunhoId: null,
    origemRascunho: null,
  };
  const id = janela.webContents.id;
  janelas.set(id, j);
  janela.on('closed', () => janelas.delete(id));

  janela.once('ready-to-show', () => {
    // maximize também mostra a janela.
    if (inicial.maximizada) janela.maximize();
    janela.show();
  });

  // Navegação e janelas novas: barradas em app.on('web-contents-created').

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

  // npm start: servidor do Vite. Empacotado: app://ps/index.html, servido só
  // da pasta do renderer (src/protocoloApp.ts).
  janela.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL || PAGINA_INICIAL);
  return j;
}

/**
 * Recarga da página pelo servidor do Vite (npm start): mesma origem e mesmo
 * caminho da página do app. No app empacotado nunca vale.
 */
function recargaDoDesenvolvimento(url: string): boolean {
  if (app.isPackaged || !MAIN_WINDOW_VITE_DEV_SERVER_URL) return false;
  try {
    const destino = new URL(url);
    const pagina = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return (
      destino.origin === pagina.origin && destino.pathname === pagina.pathname
    );
  } catch {
    return false;
  }
}

/** Janela que já está com este arquivo aberto (nota ou leitor), se houver. */
function janelaComArquivo(caminho: string): Janela | null {
  return (
    abertas().find((j) => {
      const noLeitor = caminhoNoLeitor(j.janela.webContents.id);
      return (
        (j.arquivoAberto && mesmoCaminho(j.arquivoAberto, caminho)) ||
        (j.pedido && mesmoCaminho(j.pedido.caminho, caminho)) ||
        (noLeitor !== null && mesmoCaminho(noLeitor, caminho))
      );
    }) ?? null
  );
}

/** Janela na tela inicial: sem nota, sem pedido e sem o leitor aberto. */
function janelaVazia(j: Janela): boolean {
  return (
    !j.arquivoAberto &&
    !j.pedido &&
    caminhoNoLeitor(j.janela.webContents.id) === null
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
  const vazia = abertas().find(janelaVazia);
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

ouvir('resposta-fechar', (event, pode: unknown) => {
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

ouvir('anotacoes-pendentes', (event, pendentes: unknown) => {
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

/**
 * Lê um arquivo e o torna o arquivo aberto da janela `j`. `texto`: já lido
 * por lerNfeNoServico. Arquivo grande demais ou com DOCTYPE: lança
 * ArquivoRecusadoError, e a janela continua como estava.
 */
async function lerArquivoNaJanela(
  j: Janela,
  caminho: string,
  texto?: string,
  recuperar?: { id: string; semOriginal: boolean },
): Promise<ArquivoAberto> {
  const conteudo =
    texto ?? (await lerNfeNoServico(caminho, j.janela.webContents));
  j.arquivoAberto = caminho;
  const raiz = nomeRaiz(conteudo);
  j.abertoEhCopia = raiz === 'psCopiaEditada';
  const rascunho = rascunhoDaAbertura(j, caminho, conteudo, recuperar);
  // Nota recuperada de dentro do rascunho: o nome e a pasta são os do
  // arquivo de antes, nunca os da pasta dos rascunhos.
  if (rascunho?.semOriginal) {
    guardarNoLeitor(j.janela.webContents, caminho, j.abertoEhCopia);
    return {
      nome: path.basename(rascunho.caminho),
      texto: conteudo,
      modoInicial: 'conferencia',
      rascunho,
    };
  }
  // A aba XML lê o mesmo arquivo quando a pessoa pedir (do .psxml, o
  // original guardado dentro da cópia).
  guardarNoLeitor(j.janela.webContents, caminho, j.abertoEhCopia);
  // A cópia editada (.psxml) abre na Conferência; o XML da NF-e segue o
  // "NF-e abre em" do perfil ativo (XML: no DANFE; PSXML: na Conferência).
  const modoInicial: ModoImpressao =
    j.abertoEhCopia || (await abrirNotasEmDoPerfil()) === 'psxml'
      ? 'conferencia'
      : 'danfe';
  // Aberto com sucesso (é NF-e ou cópia editada): a pasta dele vira o ponto de
  // partida do próximo diálogo de abrir. Falha ao gravar não impede a abertura.
  if (RAIZES_ACEITAS.includes(raiz)) {
    await gravarConfig({ ultimaPastaAbertura: path.dirname(caminho) }).catch(
      () => {},
    );
  }
  return {
    nome: path.basename(caminho),
    texto: conteudo,
    modoInicial,
    ...(rascunho ? { rascunho } : {}),
  };
}

/**
 * "NF-e abre em" do perfil ativo (chave ferramentasPerfis do config.json).
 * Sem nada salvo, ou se a leitura falhar: XML (DANFE).
 */
async function abrirNotasEmDoPerfil(): Promise<AbrirNotasEm> {
  try {
    const p = await lerPerfis();
    const porPerfil = lerFerramentasPorPerfil(
      (await lerConfig()).ferramentasPerfis,
      p.lista.map((x) => x.id),
    );
    return ferramentasDoPerfil(porPerfil, perfilAtivo(p).id).abrirEm;
  } catch {
    return 'xml';
  }
}

/**
 * Abrir arquivo pelo botão, Ctrl+O, arrastando para a janela `j` ou pela
 * nota recente:
 * - já aberto em alguma janela (nota ou leitor): ela vem para a frente;
 * - `j` na tela inicial: abre nela;
 * - com nota aberta: janela nova (XML no DANFE, .psxml na Conferência),
 *   e a nota desta janela fica como está.
 * XML que não é NF-e vai para o leitor genérico (src/leitorXml/), só
 * leitura, pela mesma regra. A NF-e é lida antes (lerNfeNoServico: no
 * principal até 5 MB, no serviço acima): recusada, a mensagem aparece nesta
 * janela e nenhuma janela nova abre.
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
  const destino = await destinoDoArquivo(caminho);
  if (destino !== 'nota') {
    if (!janelaVazia(j)) {
      criarJanela({ caminho, modo: null, sessao: false });
      return { status: 'nova-janela' };
    }
    abrirNoLeitor(j.janela.webContents, caminho, destino === 'documento');
    return { status: 'leitor' };
  }
  let texto: string;
  try {
    texto = await lerNfeNoServico(caminho, j.janela.webContents);
  } catch (erro) {
    if (erro instanceof ArquivoRecusadoError)
      return { status: 'recusado', mensagem: erro.message };
    throw erro;
  }
  if (!j.arquivoAberto)
    return {
      status: 'aqui',
      arquivo: await lerArquivoNaJanela(j, caminho, texto),
    };
  criarJanela({ caminho, modo: null, sessao: false });
  return { status: 'nova-janela' };
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

tratar('abrir-arquivo', async (event): Promise<ResultadoAbrir> => {
  const j = estadoDe(event.sender);
  const inicial = await pastaInicialAbertura();
  const { canceled, filePaths } = await dialog.showOpenDialog(j.janela, {
    title: 'Abrir XML de documento fiscal',
    filters: [
      {
        name: 'XML de documento fiscal ou cópia editada',
        extensions: ['xml', 'psxml'],
      },
    ],
    properties: ['openFile'],
    ...(inicial ? { defaultPath: inicial } : {}),
  });
  if (canceled || filePaths.length === 0) return { status: 'cancelado' };
  return decidirAbertura(j, filePaths[0]);
});

// Arrastar e soltar: o renderer só conhece o caminho do arquivo solto.
tratar(
  'abrir-caminho',
  async (event, caminho: unknown): Promise<ResultadoAbrir> => {
    // Só arquivo comum, com a extensão certa: nada de \\?\, \\.\, link
    // simbólico ou pasta. O tamanho é conferido em decidirAbertura.
    const problema = await problemaCaminhoSolto(caminho, EXTENSOES_ABERTURA);
    if (problema) return { status: 'recusado', mensagem: problema };
    return decidirAbertura(estadoDe(event.sender), caminho as string);
  },
);

/** A janela voltou para a tela inicial (Início ou arquivo que não abriu). */
ouvir('sem-nota', (event) => {
  const j = janelas.get(event.sender.id);
  if (!j) return;
  j.arquivoAberto = null;
  j.rascunhoId = null;
  j.origemRascunho = null;
  j.abertoEhCopia = false;
  esquecerLeitor(event.sender.id);
});

// Arquivo pedido de fora para esta janela (duplo clique, linha de comando,
// Nova janela): o renderer pede ao abrir e depois de cada aviso
// 'arquivo-externo'. null se não há. Um .psxml aberto por duplo clique faz da
// pasta dele a pasta de destino só desta janela.
tratar(
  'abrir-externo',
  async (event): Promise<ArquivoExterno | ArquivoRecusado | null> => {
    const j = estadoDe(event.sender);
    const pedido = j.pedido;
    j.pedido = null;
    if (!pedido) return null;
    if (pedido.recusa) return { status: 'recusado', mensagem: pedido.recusa };
    // XML que não é NF-e: a aba XML abre por cima da tela inicial (no modo
    // Documento, se for outro documento fiscal).
    const destino = await destinoDoArquivo(pedido.caminho);
    if (destino !== 'nota') {
      abrirNoLeitor(
        j.janela.webContents,
        pedido.caminho,
        destino === 'documento',
      );
      return null;
    }
    let arquivo: ArquivoAberto;
    try {
      arquivo = await lerArquivoNaJanela(
        j,
        pedido.caminho,
        undefined,
        pedido.rascunho,
      );
    } catch (erro) {
      if (erro instanceof ArquivoRecusadoError)
        return { status: 'recusado', mensagem: erro.message };
      throw erro;
    }
    const copia =
      pedido.sessao &&
      j.abertoEhCopia &&
      path.extname(pedido.caminho).toLowerCase() === EXTENSAO;
    if (copia) j.pastaSessao = path.dirname(pedido.caminho);
    return {
      ...arquivo,
      // Nota recuperada: a pasta desta sessão volta se o rascunho a tinha.
      pastaSessao: copia || pedido.rascunho ? j.pastaSessao : null,
      modo: pedido.modo,
    };
  },
);

// ---------- config.json em userData (pasta de destino, última pasta, janela, conferência) ----------

interface Config {
  pastaDestino?: unknown;
  ultimaPastaAbertura?: unknown;
  janela?: unknown;
  /**
   * Personalização da Parte A (src/nfe/config.ts). Lida só para migrar para
   * os perfis; fica como estava, para uma versão anterior do app ainda ler.
   */
  conferencia?: unknown;
  /** Perfis de configuração da conferência (src/nfe/perfis.ts). */
  perfis?: unknown;
  /**
   * CNPJ da loja, o destinatário esperado das notas (aviso de nota de outra
   * empresa). Sem ele, ou inválido, a verificação não roda e a primeira
   * janela mostra a tela de boas-vindas, que pede o CNPJ.
   */
  cnpjEmpresa?: unknown;
  /** Parcela que vence em até tantos dias: aviso leve (padrão 15). */
  diasAvisoVencimento?: unknown;
  /** Nota emitida há mais que tantos dias: aviso leve (padrão 30). */
  diasNotaAntiga?: unknown;
  /** Notas recentes da tela inicial (src/nfe/recentes.ts), no máximo 8. */
  notasRecentes?: unknown;
  /** Ferramentas do painel por perfil (src/nfe/ferramentasPerfil.ts). */
  ferramentasPerfis?: unknown;
}

// ---------- config.json seguro (src/configSeguro.ts): início do bloco ----------
// Gravação atômica (temporário e rename) com config.json.bak, uma por vez;
// arquivo ilegível e perfis inválidos guardados e recuperados. Houve
// recuperação: a tela mostra o aviso uma vez (canal config-recuperacoes).
import { criarConfigSeguro } from './configSeguro';

const configSeguro = criarConfigSeguro<Config>({
  pasta: () => app.getPath('userData'),
  aoRecuperar: () => avisarTodas('config-recuperada'),
});

tratar('config-recuperacoes', () => configSeguro.tirarAvisos());
// ---------- config.json seguro: fim do bloco ----------

// ---------- rascunhos das anotações: início do bloco ----------
// Rascunho contínuo de cada nota com anotações não salvas, na pasta de dados
// (src/rascunhos.ts), e o aviso de recuperar na abertura do app. A janela
// manda só o .psxml montado e os dados de exibição; arquivo, pasta de
// destino e id vêm do estado da janela aqui. Os canais rodam inteiros, sem
// await, na ordem de chegada: um "apagar" nunca passa na frente do "gravar"
// que veio antes.
import {
  criarRascunhos,
  idDoRascunho,
  idValido,
  type Rascunho,
} from './rascunhos';

const rascunhos = criarRascunhos({ pasta: () => app.getPath('userData') });

/**
 * O aviso já foi entregue nesta execução. --squirrel-firstrun (o app que o
 * instalador abre) não mostra: o aviso fica para a primeira abertura normal.
 */
let avisoRascunhosFeito = process.argv.includes('--squirrel-firstrun');

/** Chave de acesso no texto da NF-e ou do .psxml, sem montar o DOM. */
function chaveDoTexto(texto: string): string | null {
  const m = /<(?:[\w.-]+:)?infNFe\b[^>]*?\bId\s*=\s*["']NFe(\d{44})["']/.exec(
    texto,
  );
  return m ? m[1] : null;
}

/** Outra janela (fora `j`) está com a nota deste rascunho. */
function rascunhoEmUso(id: string, j?: Janela): boolean {
  return abertas().some(
    (o) => o !== j && (o.rascunhoId === id || o.pedido?.rascunho?.id === id),
  );
}

function resumoRascunho(r: Rascunho): ResumoRascunho {
  return {
    id: r.id,
    fornecedor: r.fornecedor,
    numero: r.numero,
    serie: r.serie,
    alteradoEm: r.alteradoEm,
  };
}

/**
 * Rascunho do arquivo que a janela acabou de abrir. `recuperar`: veio do
 * aviso da abertura, e a nota abre recuperada. Senão, o rascunho da mesma
 * nota (pela chave; sem chave, pelo caminho), se outra janela não está com
 * ele, vai junto para a janela perguntar. Guarda o id na janela: o próximo
 * gravar e apagar dela usam este.
 */
function rascunhoDaAbertura(
  j: Janela,
  caminho: string,
  texto: string,
  recuperar?: { id: string; semOriginal: boolean },
): RascunhoNaAbertura | null {
  j.origemRascunho = null;
  const deRecuperar = recuperar ? rascunhos.ler(recuperar.id) : null;
  if (recuperar && deRecuperar) {
    const r = deRecuperar;
    j.rascunhoId = r.id;
    if (recuperar.semOriginal)
      j.origemRascunho = { caminho: r.caminho, tipo: r.tipo };
    else if (
      r.tipo === 'psxml' &&
      r.pastaDestino &&
      mesmoCaminho(r.caminho, caminho) &&
      mesmaPasta(r.pastaDestino, path.dirname(r.caminho))
    )
      // O .psxml estava aberto com a pasta dele como pasta desta sessão.
      j.pastaSessao = r.pastaDestino;
    return {
      ...resumoRascunho(r),
      psxml: r.psxml,
      recuperar: true,
      semOriginal: recuperar.semOriginal,
      caminho: r.caminho,
    };
  }
  j.rascunhoId = idDoRascunho(chaveDoTexto(texto), caminho);
  const r = rascunhos.ler(j.rascunhoId);
  if (!r || rascunhoEmUso(r.id, j)) return null;
  return {
    ...resumoRascunho(r),
    psxml: r.psxml,
    recuperar: false,
    semOriginal: false,
    caminho: r.caminho,
  };
}

const textoCurto = (v: unknown) =>
  typeof v === 'string' ? v.slice(0, 200) : '';

ouvir('rascunho-gravar', (event, dados: unknown) => {
  const j = janelas.get(event.sender.id);
  if (!j || !j.arquivoAberto || !j.rascunhoId) return;
  const d = (typeof dados === 'object' && dados !== null ? dados : {}) as {
    [k: string]: unknown;
  };
  if (typeof d.psxml !== 'string' || d.psxml === '') return;
  const origem = j.origemRascunho ?? {
    caminho: j.arquivoAberto,
    tipo: j.abertoEhCopia ? ('psxml' as const) : ('xml' as const),
  };
  const { pastaDestino } = lerConfigSync();
  const r = rascunhos.gravar({
    // A chave é a do arquivo aberto (lida aqui), não a que a janela manda.
    chave: j.rascunhoId.startsWith('nfe-') ? j.rascunhoId.slice(4) : null,
    caminho: origem.caminho,
    tipo: origem.tipo,
    pastaDestino:
      j.pastaSessao ??
      (typeof pastaDestino === 'string' && pastaDestino !== ''
        ? pastaDestino
        : null),
    fornecedor: textoCurto(d.fornecedor),
    numero: textoCurto(d.numero),
    serie: textoCurto(d.serie),
    versaoApp: app.getVersion(),
    psxml: d.psxml,
  });
  // Nota sem chave que passou a trabalhar numa cópia: o id segue o arquivo.
  j.rascunhoId = r.id;
});

ouvir('rascunho-apagar', (event) => {
  const j = janelas.get(event.sender.id);
  if (j?.rascunhoId) rascunhos.apagar(j.rascunhoId);
});

// Descartar do aviso e "Abrir sem elas": nunca o rascunho de outra janela.
tratar(
  'rascunho-descartar',
  (event, id: unknown): boolean =>
    idValido(id) &&
    !rascunhoEmUso(id, estadoDe(event.sender)) &&
    rascunhos.apagar(id),
);

// Uma vez por execução, para a primeira janela que pedir (depois de abrir o
// arquivo do duplo clique, se havia). Fora os que já estão em alguma janela.
tratar('rascunhos-aviso', (): ResumoRascunho[] => {
  if (avisoRascunhosFeito) return [];
  avisoRascunhosFeito = true;
  return rascunhos
    .listar()
    .filter(
      (r) =>
        !rascunhoEmUso(r.id) &&
        !abertas().some(
          (o) =>
            (o.arquivoAberto && mesmoCaminho(o.arquivoAberto, r.caminho)) ||
            (o.pedido && mesmoCaminho(o.pedido.caminho, r.caminho)),
        ),
    )
    .map(resumoRascunho);
});

/**
 * O original ainda está no caminho gravado e é a mesma nota? Devolve o
 * texto; null se sumiu, não responde em 2 s, foi recusado ou é outra nota.
 */
async function originalDoRascunho(
  r: Rascunho,
  wc: Electron.WebContents,
): Promise<string | null> {
  if (ehCaminhoDeDispositivo(r.caminho)) return null;
  const existe = await comLimite(
    stat(r.caminho).then(
      (s) => s.isFile(),
      () => false,
    ),
    ESPERA_CAMINHO_MS,
    false,
  );
  if (!existe) return null;
  try {
    const texto = await lerNfeNoServico(r.caminho, wc);
    return r.chave === null || chaveDoTexto(texto) === r.chave ? texto : null;
  } catch {
    return null;
  }
}

/**
 * Recuperar do aviso: a janela que já está com a nota vem para a frente;
 * esta janela, se está na tela inicial, abre a nota; senão, uma janela nova.
 * Sempre na Conferência. Sem o original, abre a cópia de dentro do rascunho.
 */
tratar(
  'rascunho-recuperar',
  async (event, id: unknown): Promise<ResultadoRecuperarRascunho> => {
    const j = estadoDe(event.sender);
    const r = idValido(id) ? rascunhos.ler(id) : null;
    if (!r)
      return {
        status: 'recusado',
        mensagem: 'Estas anotações não estão mais guardadas.',
      };
    const dona = abertas().find(
      (o) => o.rascunhoId === r.id || o.pedido?.rascunho?.id === r.id,
    );
    if (dona) {
      trazerParaFrente(dona);
      return { status: 'outra-janela' };
    }
    const original = await originalDoRascunho(r, j.janela.webContents);
    const semOriginal = original === null;
    let caminho = r.caminho;
    try {
      if (semOriginal) caminho = rascunhos.gravarRecuperado(r);
    } catch {
      return {
        status: 'recusado',
        mensagem: 'Não foi possível abrir as anotações guardadas.',
      };
    }
    const ja = janelaComArquivo(caminho);
    if (ja) {
      trazerParaFrente(ja);
      return { status: 'outra-janela' };
    }
    const pedido = { id: r.id, semOriginal };
    if (!janelaVazia(j)) {
      criarJanela({
        caminho,
        modo: 'conferencia',
        sessao: false,
        rascunho: pedido,
      });
      return { status: 'nova-janela' };
    }
    const arquivo = await lerArquivoNaJanela(
      j,
      caminho,
      original ?? r.psxml,
      pedido,
    );
    return { status: 'aqui', arquivo, pastaSessao: j.pastaSessao };
  },
);
// ---------- rascunhos das anotações: fim do bloco ----------

/** Versão síncrona de lerConfig, para abrir e fechar a janela. */
function lerConfigSync(): Config {
  return configSeguro.lerSync();
}

function gravarConfigSync(parcial: Config): void {
  configSeguro.gravarSync(parcial);
}

async function lerConfig(): Promise<Config> {
  return configSeguro.ler();
}

tratar('versao', (): string => app.getVersion());

registrarDocumentos();

// ---------- notas recentes (tela inicial) ----------

/** Notas recentes com a marca de quais arquivos ainda existem. */
async function listaRecentes(): Promise<NotaRecenteTela[]> {
  const lista = lerRecentes((await lerConfig()).notasRecentes);
  // Checagem de fundo: pasta de rede que não responde em 2 s fica em
  // silêncio e a nota continua clicável (o clique mostra a mensagem).
  return Promise.all(
    lista.map(async (r) => ({
      ...r,
      existe: await existeOuSemResposta(r.caminho),
    })),
  );
}

/** Fila de gravação: duas janelas registrando ao mesmo tempo não se atropelam. */
let filaRecentes: Promise<unknown> = Promise.resolve();
function mudarRecentes(
  mudar: (lista: NotaRecente[]) => NotaRecente[],
): Promise<void> {
  const r = filaRecentes.then(async () => {
    const lista = lerRecentes((await lerConfig()).notasRecentes);
    await gravarConfig({ notasRecentes: mudar(lista) });
  });
  filaRecentes = r.catch(() => undefined);
  return r.then(() => {
    for (const j of abertas()) j.janela.webContents.send('recentes-mudou');
  });
}

tratar('recentes', () => listaRecentes());

// A nota aberta (ou o .psxml que esta janela acabou de salvar) entra no topo.
tratar('registrar-recente', async (event, dados: unknown) => {
  const j = estadoDe(event.sender);
  const d = (typeof dados === 'object' && dados !== null ? dados : {}) as {
    [k: string]: unknown;
  };
  const salvo =
    typeof d.salvo === 'string' &&
    j.ultimoSalvo !== null &&
    mesmoCaminho(d.salvo, j.ultimoSalvo)
      ? j.ultimoSalvo
      : null;
  const caminho = salvo ?? j.arquivoAberto;
  // A cópia de dentro de um rascunho (nota recuperada sem o original) não
  // vai para as recentes: só o .psxml que a pessoa salvar.
  if (!caminho || rascunhos.dentroDaPasta(caminho)) return;
  const [nota] = lerRecentes([
    {
      caminho,
      chave: texto(d.chave),
      fornecedor: texto(d.fornecedor),
      numero: texto(d.numero),
      itens: typeof d.itens === 'number' ? d.itens : 0,
      acesso: new Date().toISOString(),
      situacao: d.situacao,
      alerta: texto(d.alerta),
    },
  ]);
  if (nota) await mudarRecentes((lista) => registrarRecente(lista, nota));
});

// Só abre o que está na lista (o caminho não vem livre da tela).
tratar(
  'abrir-recente',
  async (event, caminho: unknown): Promise<ResultadoAbrir> => {
    const lista = lerRecentes((await lerConfig()).notasRecentes);
    if (typeof caminho !== 'string' || !estaNaLista(lista, caminho))
      return { status: 'cancelado' };
    return decidirAbertura(estadoDe(event.sender), caminho);
  },
);

// Sem caminho: limpa a lista toda. Com caminho: tira só aquela entrada.
tratar('limpar-recentes', async (_event, caminho: unknown) => {
  await mudarRecentes((lista) =>
    typeof caminho === 'string' ? removerRecente(lista, caminho) : [],
  );
  return listaRecentes();
});

/** Ajustes dos avisos da nota no config.json, com os padrões. */
tratar('config-avisos', async (): Promise<ConfigAvisos> => {
  const c = await lerConfig();
  return {
    cnpjEmpresa: cnpjDaConfig(c.cnpjEmpresa),
    diasAvisoVencimento: diasDaConfig(
      c.diasAvisoVencimento,
      DIAS_AVISO_VENCIMENTO_PADRAO,
    ),
    diasNotaAntiga: diasDaConfig(c.diasNotaAntiga, DIAS_NOTA_ANTIGA_PADRAO),
  };
});

/** Grava as chaves de `parcial` mantendo as demais (src/configSeguro.ts). */
async function gravarConfig(parcial: Config): Promise<void> {
  return configSeguro.gravar(parcial);
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

/** true se os dois caminhos são o mesmo (sem diferenciar maiúsculas). */
const mesmoCaminho = (a: string, b: string) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** true se as duas pastas são a mesma (sem diferenciar maiúsculas). */
const mesmaPasta = (a: string, b: string) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

tratar('pasta-destino', (event): Promise<PastaDestino> =>
  pastaEfetiva(estadoDe(event.sender)),
);

/**
 * Nota já conferida: os .psxml da pasta de destino em uso com a mesma chave
 * da nota aberta (fora o próprio arquivo aberto), do mais novo para o mais
 * antigo. Só lê os nomes da pasta; abre apenas os que têm _NF<número> no
 * nome. Sem pasta, ou pasta inacessível: lista vazia.
 */
tratar(
  'buscar-conferidos',
  async (event, chave: unknown, nNF: unknown): Promise<ArquivoConferido[]> => {
    const j = estadoDe(event.sender);
    j.conferidos.clear();
    if (typeof chave !== 'string' || !/^\d{44}$/.test(chave)) return [];
    if (typeof nNF !== 'string') return [];
    const { caminho: pasta } = await pastaEfetiva(j);
    if (!pasta) return [];
    // Checagem de fundo: pasta de rede que não responde em 2 s fica em
    // silêncio (nenhuma nota conferida achada).
    let nomes: string[] | null;
    try {
      nomes = await comLimite(readdir(pasta), ESPERA_CAMINHO_MS, null);
    } catch {
      return [];
    }
    if (!nomes) return [];
    const achados: ArquivoConferido[] = [];
    for (const nome of nomes.filter((n) => nomePodeSerConferencia(n, nNF))) {
      const caminho = path.join(pasta, nome);
      if (j.arquivoAberto && mesmoCaminho(caminho, j.arquivoAberto)) continue;
      try {
        const info = await comLimite(stat(caminho), ESPERA_CAMINHO_MS, null);
        if (!info || !info.isFile() || problemaTamanhoNfe(info.size)) continue;
        // Mesmas barreiras da abertura: grande demais ou com DOCTYPE não conta.
        const texto = (await readFile(caminho)).toString('utf8');
        if (verificarXmlSeguro(texto)) continue;
        if (chaveDoArquivo(texto) !== chave) continue;
        achados.push({ caminho, nome, modificado: info.mtime.toISOString() });
      } catch {
        // Ilegível (sem permissão, apagado no meio): não conta.
      }
    }
    achados.sort((a, b) => b.modificado.localeCompare(a.modificado));
    for (const a of achados) j.conferidos.add(a.caminho);
    return achados;
  },
);

/**
 * Abre numa janela nova um .psxml achado por buscar-conferidos (direto na
 * Conferência). Já aberto em alguma janela: ela vem para a frente.
 */
tratar('abrir-conferido', (event, caminho: unknown): boolean => {
  const j = estadoDe(event.sender);
  if (typeof caminho !== 'string' || !j.conferidos.has(caminho)) return false;
  const ja = janelaComArquivo(caminho);
  if (ja) trazerParaFrente(ja);
  else criarJanela({ caminho, modo: 'conferencia', sessao: false });
  return true;
});

// Abre a pasta de destino no Explorer. shell.openPath devolve "" quando abre e
// a mensagem de erro quando não abre.
tratar('abrir-pasta-destino', async (event): Promise<ResultadoAbrirPasta> => {
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
});

tratar('escolher-pasta', async (event): Promise<string | null> => {
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

// ---------- perfis de configuração da conferência ----------

/** Nome do usuário do Windows, para o primeiro perfil. */
function nomeUsuario(): string {
  try {
    return userInfo().username;
  } catch {
    return '';
  }
}

/**
 * Perfis salvos. Na primeira vez (sem a chave perfis), a configuração da
 * Parte A vira o primeiro perfil, com o nome do usuário do Windows, e já fica
 * gravada. Chave inválida: cópia do original e recuperação perfil a perfil
 * (src/configSeguro.ts).
 */
async function lerPerfis(): Promise<Perfis> {
  return configSeguro.lerPerfis(nomeUsuario());
}

/** O que o renderer precisa: a lista (id e nome), o ativo e a config dele. */
function estadoDosPerfis(p: Perfis): EstadoPerfis {
  const ativo = perfilAtivo(p);
  return {
    lista: p.lista.map((x) => ({ id: x.id, nome: x.nome })),
    ativo: ativo.id,
    nomeAtivo: ativo.nome,
    config: ativo.config,
  };
}

/**
 * Grava os perfis e avisa as outras janelas, que aplicam o perfil ativo na
 * hora. Erro vira a mensagem para o renderer.
 */
async function gravarPerfis(
  p: Perfis,
  origem: Electron.WebContents,
): Promise<ResultadoPerfis> {
  try {
    await gravarConfig({ perfis: perfisParaGravar(p) });
  } catch (erro) {
    return {
      status: 'erro',
      mensagem: `Não foi possível salvar a configuração: ${mensagemDe(erro)}`,
    };
  }
  const estado = estadoDosPerfis(p);
  avisarOutras(origem, 'perfis-mudou', estado);
  return { status: 'ok', estado };
}

/** Mudança nos perfis: lê, aplica `mudar` e grava (mensagem de erro se falhar). */
async function mudarPerfis(
  event: Electron.IpcMainInvokeEvent,
  mudar: (p: Perfis) => string | null,
): Promise<ResultadoPerfis> {
  const p = await lerPerfis();
  let problema: string | null;
  try {
    problema = mudar(p);
  } catch (erro) {
    problema = mensagemDe(erro);
  }
  if (problema) return { status: 'erro', mensagem: problema };
  return gravarPerfis(p, event.sender);
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Cópia do perfil como está, em perfis-excluidos na pasta de dados
 * (src/perfisExcluidos.ts), antes de excluir, substituir por um importado ou
 * voltar ao padrão. Devolve o caminho da cópia. Sem a cópia, lança (dentro
 * de mudarPerfis vira a mensagem) e nada muda.
 */
function guardarAntes(
  perfil: Perfil,
  motivo: MotivoCopiaPerfil,
  acao: string,
): string {
  try {
    return guardarCopiaPerfil(
      app.getPath('userData'),
      perfil,
      motivo,
      new Date(),
    );
  } catch (erro) {
    throw new Error(
      `${acao}: a cópia de segurança do perfil não pôde ser gravada na pasta ${PASTA_PERFIS_EXCLUIDOS} (${mensagemDe(erro)}). Nada foi alterado.`,
      { cause: erro },
    );
  }
}

tratar('perfis', async (): Promise<EstadoPerfis> =>
  estadoDosPerfis(await lerPerfis()),
);

/** Aplicar no editor de colunas: grava no perfil ativo. */
tratar(
  'gravar-config-conferencia',
  (event, config: unknown): Promise<ResultadoPerfis> =>
    mudarPerfis(event, (p) => {
      perfilAtivo(p).config = validarConfig(config);
      return null;
    }),
);

tratar('ativar-perfil', (event, id: unknown): Promise<ResultadoPerfis> =>
  mudarPerfis(event, (p) => {
    if (!p.lista.some((x) => x.id === id)) return 'Perfil não encontrado.';
    p.ativo = id as string;
    return null;
  }),
);

/** Perfil novo, cópia do ativo, que passa a ser o ativo. */
tratar('criar-perfil', (event, nome: unknown): Promise<ResultadoPerfis> =>
  mudarPerfis(event, (p) => {
    const n = texto(nome).trim();
    const problema = problemaNomePerfil(n, p.lista);
    if (problema) return problema;
    const id = novoIdPerfil(p.lista);
    p.lista.push({
      id,
      nome: n,
      config: structuredClone(perfilAtivo(p).config),
    });
    p.ativo = id;
    return null;
  }),
);

tratar(
  'renomear-perfil',
  (event, id: unknown, nome: unknown): Promise<ResultadoPerfis> =>
    mudarPerfis(event, (p) => {
      const perfil = p.lista.find((x) => x.id === id);
      if (!perfil) return 'Perfil não encontrado.';
      const n = texto(nome).trim();
      const problema = problemaNomePerfil(n, p.lista, perfil.id);
      if (problema) return problema;
      perfil.nome = n;
      return null;
    }),
);

/**
 * Exclui um perfil (nunca o último). Antes, a cópia dele em perfis-excluidos.
 * Excluir o ativo ativa o primeiro. As ferramentas do perfil excluído saem
 * da chave ferramentasPerfis.
 */
tratar(
  'excluir-perfil',
  async (event, id: unknown): Promise<ResultadoPerfis> => {
    let copia: string | undefined;
    const r = await mudarPerfis(event, (p) => {
      if (p.lista.length <= 1) return 'O último perfil não pode ser excluído.';
      const i = p.lista.findIndex((x) => x.id === id);
      if (i < 0) return 'Perfil não encontrado.';
      copia = guardarAntes(p.lista[i], 'excluido', 'Perfil não excluído');
      p.lista.splice(i, 1);
      if (p.ativo === id) p.ativo = p.lista[0].id;
      return null;
    });
    if (r.status === 'ok') {
      const c = await lerConfig();
      if (c.ferramentasPerfis !== undefined) {
        await gravarConfig({
          ferramentasPerfis: semPerfisExcluidos(
            c.ferramentasPerfis,
            r.estado.lista.map((x) => x.id),
          ),
        }).catch(() => {});
        avisarTodas('ferramentas-mudou');
      }
      return { ...r, copia };
    }
    return r;
  },
);

/**
 * Exporta o perfil ativo para "PS Reader - perfil <nome>.json", onde o
 * usuário escolher. Pasta de destino, última pasta e janela são da máquina e
 * ficam de fora.
 */
tratar('exportar-perfil', async (event): Promise<ResultadoExportarConfig> => {
  const j = estadoDe(event.sender);
  const perfil = perfilAtivo(await lerPerfis());
  const { canceled, filePath } = await dialog.showSaveDialog(j.janela, {
    title: 'Exportar perfil',
    defaultPath: path.join(
      app.getPath('documents'),
      nomeArquivoPerfil(perfil.nome),
    ),
    filters: [{ name: 'Perfil do PS Reader', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { status: 'cancelado' };
  try {
    await writeFile(filePath, textoArquivoPerfil(perfil), 'utf8');
    perfisExportados.set(event.sender, filePath);
    return { status: 'exportado', caminho: filePath };
  } catch (erro) {
    return {
      status: 'erro',
      mensagem: `Não foi possível exportar o perfil: ${mensagemDe(erro)}`,
    };
  }
});

/** O último perfil exportado de cada janela (o Abrir pasta do aviso). */
const perfisExportados = new WeakMap<Electron.WebContents, string>();

/**
 * Abrir pasta do aviso de perfil exportado: o Explorer na pasta, com o
 * arquivo selecionado. Só o arquivo que esta janela acabou de exportar.
 */
tratar(
  'mostrar-perfil-exportado',
  async (event): Promise<ResultadoAbrirPasta> => {
    const caminho = perfisExportados.get(event.sender);
    if (!caminho)
      return { status: 'erro', mensagem: 'Nenhum perfil exportado agora.' };
    try {
      await access(caminho);
    } catch {
      return {
        status: 'erro',
        mensagem: `O arquivo exportado não está mais em ${caminho}.`,
      };
    }
    shell.showItemInFolder(caminho);
    return { status: 'aberta' };
  },
);

/**
 * Importar: lê o arquivo escolhido e valida tudo, sem gravar. Aceita um
 * perfil exportado ou a configuração da Parte A. `existe`: já há um perfil
 * com esse nome (o renderer pergunta se substitui ou mantém os dois).
 */
tratar('importar-perfil', async (event): Promise<ResultadoImportarPerfil> => {
  const j = estadoDe(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(j.janela, {
    title: 'Importar perfil',
    // Onde o Exportar sugere gravar.
    defaultPath: app.getPath('documents'),
    filters: [{ name: 'Perfil do PS Reader', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return { status: 'cancelado' };
  try {
    const perfil = lerArquivoPerfil(await readFile(filePaths[0], 'utf8'));
    const lista = (await lerPerfis()).lista;
    return {
      status: 'lido',
      perfil,
      existe: perfilComNome(perfil.nome, lista) !== null,
      nomeCopia: nomeLivre(perfil.nome, lista),
    };
  } catch (erro) {
    return {
      status: 'erro',
      mensagem: `Perfil não importado; nada foi alterado. ${mensagemDe(erro)}`,
    };
  }
});

/**
 * Acrescenta o perfil lido no importar. Nome repetido: `substituir` troca o
 * conteúdo do perfil com esse nome, depois de guardar a cópia dele em
 * perfis-excluidos; `manter` (Importar como cópia) acrescenta como
 * "<nome> (2)". O perfil ativo continua o mesmo (se for o substituído,
 * aplica o novo).
 */
tratar(
  'adicionar-perfil',
  async (event, perfil: unknown, modo: unknown): Promise<ResultadoPerfis> => {
    let copia: string | undefined;
    const r = await mudarPerfis(event, (p) => {
      const o = perfil as { nome?: unknown; config?: unknown } | null;
      const nome = texto(o?.nome).trim();
      const config = validarConfig(o?.config);
      const igual = perfilComNome(nome, p.lista);
      if (igual && modo === 'substituir') {
        copia = guardarAntes(igual, 'substituido', 'Perfil não substituído');
        igual.config = config;
        return null;
      }
      const livre = igual ? nomeLivre(nome, p.lista) : nome;
      const problema = problemaNomePerfil(livre, p.lista);
      if (problema) return problema;
      p.lista.push({ id: novoIdPerfil(p.lista), nome: livre, config });
      return null;
    });
    return r.status === 'ok' ? { ...r, copia } : r;
  },
);

/**
 * Volta o perfil ativo ao padrão (o nome fica). A tela confirma antes, no
 * visual do app; aqui, a cópia do perfil em perfis-excluidos e a mudança.
 */
tratar('restaurar-config', async (event): Promise<ResultadoPerfis> => {
  let copia: string | undefined;
  const r = await mudarPerfis(event, (p) => {
    const ativo = perfilAtivo(p);
    copia = guardarAntes(ativo, 'padrao', 'Perfil não voltou ao padrão');
    ativo.config = configPadrao();
    return null;
  });
  return r.status === 'ok' ? { ...r, copia } : r;
});

// ---------- Configurações: ferramentas por perfil, avisos, dados do app e backup ----------

/** Ferramentas de todos os perfis (o padrão para quem não tem nada salvo). */
async function estadoFerramentas(): Promise<EstadoFerramentas> {
  const p = await lerPerfis();
  const porPerfil = lerFerramentasPorPerfil(
    (await lerConfig()).ferramentasPerfis,
    p.lista.map((x) => x.id),
  );
  return {
    ativo: perfilAtivo(p).id,
    lista: p.lista.map((x) => ({
      id: x.id,
      nome: x.nome,
      ferramentas: ferramentasDoPerfil(porPerfil, x.id),
    })),
  };
}

/** Avisa todas as janelas (inclusive a que pediu) de uma mudança feita nas Configurações. */
function avisarTodas(canal: string, ...args: unknown[]): void {
  for (const j of abertas()) j.janela.webContents.send(canal, ...args);
}

tratar('ferramentas-perfis', () => estadoFerramentas());

tratar(
  'gravar-ferramentas-perfil',
  async (
    _event,
    id: unknown,
    ferramentas: unknown,
  ): Promise<ResultadoFerramentas> => {
    const p = await lerPerfis();
    if (typeof id !== 'string' || !p.lista.some((x) => x.id === id))
      return { status: 'erro', mensagem: 'Perfil não encontrado.' };
    const porPerfil = lerFerramentasPorPerfil(
      (await lerConfig()).ferramentasPerfis,
      p.lista.map((x) => x.id),
    );
    porPerfil[id] = lerFerramentas(ferramentas);
    try {
      await gravarConfig({ ferramentasPerfis: porPerfil });
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível salvar as ferramentas: ${mensagemDe(erro)}`,
      };
    }
    const estado = await estadoFerramentas();
    avisarTodas('ferramentas-mudou');
    return { status: 'ok', estado };
  },
);

/** Os ajustes dos avisos lidos do config.json, com os padrões. */
function avisosDaConfig(c: Config): ConfigAvisos {
  return {
    cnpjEmpresa: cnpjDaConfig(c.cnpjEmpresa),
    diasAvisoVencimento: diasDaConfig(
      c.diasAvisoVencimento,
      DIAS_AVISO_VENCIMENTO_PADRAO,
    ),
    diasNotaAntiga: diasDaConfig(c.diasNotaAntiga, DIAS_NOTA_ANTIGA_PADRAO),
  };
}

/**
 * CNPJ da loja e dias dos avisos, da aba Geral. CNPJ vazio ou inválido não
 * grava nada (não há CNPJ padrão).
 */
tratar(
  'gravar-config-avisos',
  async (_event, p: unknown): Promise<ResultadoConfigAvisos> => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as {
      cnpjEmpresa?: unknown;
      diasAvisoVencimento?: unknown;
      diasNotaAntiga?: unknown;
    };
    const parcial: Config = {};
    if (o.cnpjEmpresa !== undefined) {
      const t = texto(o.cnpjEmpresa);
      const problema = problemaCnpj(t);
      if (problema) return { status: 'erro', mensagem: problema };
      parcial.cnpjEmpresa = cnpjDaConfig(t);
    }
    for (const k of ['diasAvisoVencimento', 'diasNotaAntiga'] as const) {
      if (o[k] === undefined) continue;
      if (diasDaConfig(o[k], -1) === -1)
        return {
          status: 'erro',
          mensagem: 'Os dias precisam ser um número inteiro de 0 a 3650.',
        };
      parcial[k] = o[k];
    }
    try {
      await gravarConfig(parcial);
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível salvar: ${mensagemDe(erro)}`,
      };
    }
    avisarTodas('avisos-mudou');
    return { status: 'ok', config: avisosDaConfig(await lerConfig()) };
  },
);

// ---------- tela de boas-vindas: início do bloco ----------
// Primeira abertura normal sem CNPJ da loja gravado (instalação nova, ou
// atualização de uma versão que tinha o CNPJ no código): a primeira tela de
// cada janela pede o CNPJ (src/boasVindas.ts). O app aberto pelo instalador
// (--squirrel-firstrun) não mostra: a tela fica para a primeira abertura
// normal. Nada é gravado antes do Começar; o CNPJ vai por último, e é ele
// que marca a tela como feita.
import { cnpjDestinatarioDoTexto, cnpjMaisFrequente } from './nfe/cnpj';

const abertoPeloInstalador = process.argv.includes('--squirrel-firstrun');

/** Pasta de destino sugerida, quando não há uma gravada. */
const pastaSugerida = () => path.join(app.getPath('documents'), 'PS Reader');

/** Pasta escolhida no diálogo da tela, por janela (só o diálogo vale). */
const pastasBoasVindas = new Map<number, string>();

/** CNPJ do destinatário de uma nota recente; null se não dá para ler. */
async function cnpjDaRecente(caminho: string): Promise<string | null> {
  try {
    const info = await comLimite(stat(caminho), ESPERA_CAMINHO_MS, null);
    if (!info || !info.isFile() || problemaTamanhoNfe(info.size)) return null;
    const bruto = await comLimite(readFile(caminho), ESPERA_CAMINHO_MS, null);
    if (!bruto) return null;
    const texto = bruto.toString('utf8');
    if (verificarXmlSeguro(texto)) return null;
    return cnpjDestinatarioDoTexto(texto);
  } catch {
    return null;
  }
}

tratar('boas-vindas', async (): Promise<EstadoBoasVindas | null> => {
  if (abertoPeloInstalador) return null;
  const c = await lerConfig();
  if (cnpjDaConfig(c.cnpjEmpresa)) return null;
  const [perfis, pasta, cnpjs] = await Promise.all([
    lerPerfis(),
    lerPastaDestino(),
    Promise.all(
      lerRecentes(c.notasRecentes).map((r) => cnpjDaRecente(r.caminho)),
    ),
  ]);
  return {
    nomePerfil: perfilAtivo(perfis).nome,
    pasta: pasta ?? pastaSugerida(),
    pastaSugerida: pasta === null,
    cnpjSugerido: cnpjMaisFrequente(cnpjs),
  };
});

tratar('boas-vindas-escolher-pasta', async (event): Promise<string | null> => {
  const j = estadoDe(event.sender);
  const atual =
    pastasBoasVindas.get(event.sender.id) ??
    (await lerPastaDestino()) ??
    app.getPath('documents');
  const opcoes: Electron.OpenDialogOptions = {
    title: 'Pasta de destino',
    buttonLabel: 'Escolher pasta',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: atual,
  };
  const { canceled, filePaths } = await dialog.showOpenDialog(j.janela, opcoes);
  if (canceled || filePaths.length === 0) return null;
  pastasBoasVindas.set(event.sender.id, filePaths[0]);
  return filePaths[0];
});

tratar(
  'boas-vindas-concluir',
  async (event, p: unknown): Promise<ResultadoBoasVindas> => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as {
      cnpj?: unknown;
      nomePerfil?: unknown;
      pasta?: unknown;
    };
    const cnpjTexto = texto(o.cnpj);
    const problemaDoCnpj = problemaCnpj(cnpjTexto);
    if (problemaDoCnpj)
      return { status: 'erro', campo: 'cnpj', mensagem: problemaDoCnpj };
    const perfis = await lerPerfis();
    const ativo = perfilAtivo(perfis);
    const nome = texto(o.nomePerfil).trim();
    const renomear = nome !== ativo.nome;
    if (renomear) {
      const problema = problemaNomePerfil(nome, perfis.lista, ativo.id);
      if (problema)
        return { status: 'erro', campo: 'perfil', mensagem: problema };
    }
    let pasta: string | null = null;
    if (o.pasta === 'escolhida') {
      pasta = pastasBoasVindas.get(event.sender.id) ?? null;
      if (!pasta)
        return {
          status: 'erro',
          campo: 'pasta',
          mensagem: 'Escolha a pasta de novo.',
        };
    } else if (o.pasta === 'sugerida') {
      pasta = pastaSugerida();
      try {
        await mkdir(pasta, { recursive: true });
      } catch (erro) {
        return {
          status: 'erro',
          campo: 'pasta',
          mensagem: `Não foi possível criar a pasta ${pasta}: ${mensagemDe(erro)}. Escolha outra.`,
        };
      }
    }
    try {
      if (pasta) await gravarConfig({ pastaDestino: pasta });
      if (renomear) {
        ativo.nome = nome;
        await gravarConfig({ perfis: perfisParaGravar(perfis) });
      }
      await gravarConfig({ cnpjEmpresa: cnpjDaConfig(cnpjTexto) });
    } catch (erro) {
      return {
        status: 'erro',
        campo: 'geral',
        mensagem: `Não foi possível salvar a configuração: ${mensagemDe(erro)}`,
      };
    }
    pastasBoasVindas.delete(event.sender.id);
    const estado = estadoDosPerfis(perfis);
    if (pasta) avisarOutras(event.sender, 'pasta-mudou');
    if (renomear) avisarOutras(event.sender, 'perfis-mudou', estado);
    avisarTodas('avisos-mudou');
    return { status: 'ok', perfis: estado, pasta: await lerPastaDestino() };
  },
);
// ---------- tela de boas-vindas: fim do bloco ----------

tratar('dados-app', async (): Promise<EstadoDadosApp> => ({
  pasta: app.getPath('userData'),
  itens: await listarDadosApp(app.getPath('userData')),
}));

tratar('abrir-pasta-dados', async (): Promise<ResultadoAbrirPasta> => {
  const pasta = app.getPath('userData');
  await mkdir(pasta, { recursive: true }).catch(() => {});
  const erro = await shell.openPath(pasta);
  return erro
    ? { status: 'erro', mensagem: `Não foi possível abrir a pasta: ${erro}` }
    : { status: 'aberta' };
});

tratar('exportar-backup', async (event): Promise<ResultadoExportarConfig> => {
  const j = estadoDe(event.sender);
  const agora = new Date();
  const { canceled, filePath } = await dialog.showSaveDialog(j.janela, {
    title: 'Exportar backup',
    defaultPath: path.join(app.getPath('documents'), nomeArquivoBackup(agora)),
    filters: [{ name: 'Backup do PS Reader', extensions: [EXTENSAO_BACKUP] }],
  });
  if (canceled || !filePath) return { status: 'cancelado' };
  try {
    const b = await montarBackup(
      app.getPath('userData'),
      agora,
      app.getVersion(),
    );
    await writeFile(filePath, textoBackup(b), 'utf8');
    return { status: 'exportado', caminho: filePath };
  } catch (erro) {
    return {
      status: 'erro',
      mensagem: `Não foi possível exportar o backup: ${mensagemDe(erro)}`,
    };
  }
});

/** Backup lido e validado, esperando a confirmação (um por vez). */
const backupsLidos = new Map<string, Backup>();

tratar('ler-backup', async (event): Promise<ResultadoLerBackup> => {
  const j = estadoDe(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(j.janela, {
    title: 'Importar backup',
    filters: [{ name: 'Backup do PS Reader', extensions: [EXTENSAO_BACKUP] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return { status: 'cancelado' };
  let b: Backup;
  try {
    b = await lerArquivoBackup(filePaths[0]);
  } catch (erro) {
    return {
      status: 'erro',
      mensagem: `Backup não importado; nada foi alterado. ${mensagemDe(erro)}`,
    };
  }
  const token = randomUUID();
  backupsLidos.clear();
  backupsLidos.set(token, b);
  const atual = await montarBackup(
    app.getPath('userData'),
    new Date(),
    app.getVersion(),
  );
  return {
    status: 'lido',
    token,
    arquivo: path.basename(filePaths[0]),
    novo: resumoBackup(b),
    atual: resumoBackup(atual),
  };
});

tratar('cancelar-backup', (_event, token: unknown) => {
  if (typeof token === 'string') backupsLidos.delete(token);
});

tratar(
  'confirmar-backup',
  async (_event, token: unknown): Promise<ResultadoImportarBackup> => {
    const b = typeof token === 'string' ? backupsLidos.get(token) : undefined;
    if (!b) return { status: 'cancelado' };
    backupsLidos.delete(token as string);
    let antes: string;
    try {
      // Na fila do config.json: nenhuma gravação entra no meio.
      antes = await configSeguro.naFila(() =>
        importarBackup(app.getPath('userData'), b, new Date()),
      );
    } catch (erro) {
      return {
        status: 'erro',
        mensagem: `Não foi possível importar o backup: ${mensagemDe(erro)}`,
      };
    }
    // Tudo mudou: as janelas releem perfis, pasta, avisos, ferramentas e
    // documentos (as decisões e as preferências vêm junto).
    avisarTodas('perfis-mudou', estadoDosPerfis(await lerPerfis()));
    avisarTodas('pasta-mudou');
    avisarTodas('avisos-mudou');
    avisarTodas('ferramentas-mudou');
    avisarTodas('documentos-mudou');
    return { status: 'ok', pastaAntes: antes };
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

interface OpcoesGravar {
  /** Destinos que são o próprio arquivo aberto: regrava sem perguntar. */
  semPergunta?: (destino: string) => boolean;
  /** O renderer já perguntou e a pessoa escolheu Substituir. */
  substituir?: boolean;
}

/**
 * Grava as saídas na pasta de destino que o botão mostra (pastaEfetiva), com
 * as mesmas regras para o modo Conferência e o DANFE: recusa gravar sobre a
 * NF-e original aberta e grava primeiro em temporários (gravação segura).
 * Arquivo que já existe não é substituído sem `substituir`: volta
 * { status: 'existe' } e o renderer pergunta, no visual do app, Substituir,
 * Salvar cópia ou Cancelar. `nomes(base)` monta os caminhos a partir do nome
 * base (ver nomeBase).
 */
async function gravarSaidas(
  event: Electron.IpcMainInvokeEvent,
  baseDoRenderer: unknown,
  nomes: (pasta: string, base: string) => Saida[],
  opcoes: OpcoesGravar = {},
): Promise<
  | { status: 'salvo'; destinos: string[] }
  | ArquivoExistente
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string }
> {
  const semPergunta = opcoes.semPergunta ?? (() => false);
  const j = estadoDe(event.sender);
  const janela = j.janela;
  const arquivoAberto = j.arquivoAberto;
  const abertoEhCopia = j.abertoEhCopia;
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
  if (existentes.length > 0 && !opcoes.substituir)
    return { status: 'existe', nome: existentes.join(' e '), pasta };

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
/** Opções vindas do renderer: substituir e nome da cópia. */
function opcoesDoRenderer(v: unknown): {
  substituir: boolean;
  nome: string | null;
} {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<
    string,
    unknown
  >;
  return {
    substituir: o.substituir === true,
    nome:
      typeof o.nome === 'string'
        ? o.nome.trim().replace(/\.(psxml|pdf)$/i, '')
        : null,
  };
}

/**
 * Salvar da Conferência: só o .psxml, na pasta de destino que o botão mostra.
 * Cópia editada aberta que está nessa mesma pasta: grava por cima dela, sem
 * perguntar (é o próprio arquivo aberto). Em outra pasta, ou NF-e original:
 * um .psxml com o nome padrão; se ele já existir, volta 'existe' (o renderer
 * pergunta) e o arquivo aberto fica como está.
 */
tratar(
  'salvar',
  async (
    event,
    textoCopia: unknown,
    base: unknown,
    opcoes: unknown,
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
      {
        semPergunta: (destino) =>
          copiaAberta !== null && mesmoCaminho(destino, copiaAberta),
        substituir: opcoesDoRenderer(opcoes).substituir,
      },
    );
    if (r.status !== 'salvo') return r;
    j.ultimoSalvo = r.destinos[0];
    return { status: 'salvo', copia: r.destinos[0] };
  },
);

/**
 * PDF da Conferência (menu do Salvar), na orientação que o
 * renderer calculou para a tabela caber. `opcoes.nome`: grava com esse nome
 * (Salvar cópia), em vez de <base>_Conferencia.pdf.
 */
tratar(
  'salvar-pdf-conferencia',
  async (
    event,
    base: unknown,
    paisagem: unknown,
    opcoes: unknown,
  ): Promise<ResultadoSalvarDanfe> =>
    salvarPdf(event, base, opcoes, '_Conferencia', pdfConferencia(paisagem)),
);

// DANFE: só o PDF (PDF_DANFE: o Electron imprime sem margem).
tratar(
  'salvar-danfe',
  async (
    event,
    base: unknown,
    opcoes: unknown,
  ): Promise<ResultadoSalvarDanfe> =>
    salvarPdf(event, base, opcoes, '_DANFE', PDF_DANFE),
);

/** Grava um PDF (<base><sufixo>.pdf ou o nome da cópia) na pasta de destino. */
async function salvarPdf(
  event: Electron.IpcMainInvokeEvent,
  base: unknown,
  opcoes: unknown,
  sufixo: '_Conferencia' | '_DANFE',
  pdf: Electron.PrintToPDFOptions,
): Promise<ResultadoSalvarDanfe> {
  const { substituir, nome } = opcoesDoRenderer(opcoes);
  if (nome !== null) {
    const problema = problemaNomeArquivo(nome);
    if (problema) return { status: 'erro', mensagem: problema };
  }
  const r = await gravarSaidas(
    event,
    base,
    (pasta, b) => [
      { destino: path.join(pasta, `${nome ?? `${b}${sufixo}`}.pdf`), pdf },
    ],
    { substituir },
  );
  if (r.status !== 'salvo') return r;
  return { status: 'salvo', pdf: r.destinos[0] };
}

/** Sufixo e extensão de cada tipo de cópia. */
const TIPOS_COPIA: Record<TipoCopia, { sufixo: string; extensao: string }> = {
  psxml: { sufixo: '_Conferencia', extensao: EXTENSAO },
  conferencia: { sufixo: '_Conferencia', extensao: '.pdf' },
  danfe: { sufixo: '_DANFE', extensao: '.pdf' },
};

/**
 * Nome sugerido do Salvar cópia: <base><sufixo>_copia1, ou copia2,
 * copia3... se já existir na pasta de destino em uso.
 */
tratar(
  'sugerir-copia',
  async (event, base: unknown, tipo: unknown): Promise<SugestaoCopia> => {
    const j = estadoDe(event.sender);
    const arquivo = j.arquivoAberto;
    if (!arquivo) return { status: 'erro', mensagem: 'Nenhum arquivo aberto.' };
    const efetiva = await pastaEfetiva(j);
    const pasta = efetiva.caminho;
    if (!pasta)
      return { status: 'erro', mensagem: 'Escolha a pasta de destino.' };
    if (!(await ehPasta(pasta)))
      return { status: 'erro', mensagem: pastaSumiu(efetiva) };
    const { sufixo, extensao } =
      TIPOS_COPIA[tipo === 'conferencia' || tipo === 'danfe' ? tipo : 'psxml'];
    const b = nomeBase(base, arquivo);
    for (let n = 1; ; n++) {
      const nome = `${b}${sufixo}_copia${n}`;
      if (!(await existe(path.join(pasta, `${nome}${extensao}`))))
        return { status: 'ok', pasta, nome };
    }
  },
);

/**
 * Salvar cópia do .psxml: grava um .psxml novo com o nome digitado na pasta
 * de destino em uso. O arquivo aberto não muda (gravar sobre ele é recusado).
 * Nome que já existe: volta 'existe' (o renderer pergunta). Depois de gravar,
 * a janela passa a trabalhar na cópia: os próximos Salvar vão para ela.
 */
tratar(
  'salvar-copia',
  async (
    event,
    textoCopia: unknown,
    nome: unknown,
    opcoes: unknown,
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
    const r = await gravarSaidas(
      event,
      null,
      (pasta) => [
        { destino: path.join(pasta, `${limpo}${EXTENSAO}`), texto: textoCopia },
      ],
      { substituir: opcoesDoRenderer(opcoes).substituir },
    );
    if (r.status !== 'salvo') return r;
    j.arquivoAberto = r.destinos[0];
    j.abertoEhCopia = true;
    j.ultimoSalvo = r.destinos[0];
    return { status: 'salvo', copia: r.destinos[0] };
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

tratar(
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
tratar(
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

/**
 * Nega todo pedido de permissão da página (câmera, microfone, notificações,
 * localização, dispositivos USB, serial, HID...). Sem estes handlers o
 * Electron aprova tudo. O app não usa nenhuma: a área de transferência e a
 * impressão passam pelo processo principal.
 */
function negarPermissoes(): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permissao, responder) =>
    responder(false),
  );
  s.setPermissionCheckHandler(() => false);
  s.setDevicePermissionHandler(() => false);
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

app.whenReady().then(async () => {
  // Evento do Squirrel, opção recusada ou segunda instância: o app está
  // saindo, sem janela.
  if (saindo || !instanciaPrincipal) return;
  // Sem menu: o menu padrão do Electron vem em inglês e não é usado.
  Menu.setApplicationMenu(null);
  negarPermissoes();
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) servirEsquemaApp();
  // Rascunhos com mais de 30 dias e sobras da execução anterior saem antes
  // da primeira janela (src/rascunhos.ts).
  rascunhos.limparNaAbertura();
  criarJanela(await pedidoDosCandidatos(candidatosIniciais));
  // Só se a pessoa ligou a verificação online e o "verificar ao abrir".
  void verificarAoAbrir();

  app.on('activate', () => {
    if (abertas().length === 0) criarJanela(null);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ---------- leitor de XML genérico (parte 1): início do bloco ----------
// Canais da tela do leitor (leitor-xml-*), registrados pelo envoltório
// src/ipcSeguro.ts em src/leitorXml/principal.ts. Quem abre a tela é
// decidirAbertura e abrir-externo, acima (XML que não é NF-e).
import { registrarLeitorXml } from './leitorXml/principal';

registrarLeitorXml();
// ---------- leitor de XML genérico (parte 1): fim do bloco ----------

// ---------- serviço de leitura pesada (parte 2): início do bloco ----------
// Leituras pesadas num utilityProcess (src/servico/): XML genérico, NF-e
// grande e planilhas de referência. Aqui só o canal do Cancelar e o
// encerramento do filho ao sair; quem lê chama src/servico/principal.ts.
import { registrarServico } from './servico/principal';

registrarServico();
// ---------- serviço de leitura pesada (parte 2): fim do bloco ----------
