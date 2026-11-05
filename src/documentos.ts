// Documentos de referência no processo principal: a pasta "documentos" na
// pasta de dados do app (userData), a importação pelo diálogo de arquivo e a
// verificação online, que só roda com o interruptor ligado e quando a pessoa
// pede (ou ao abrir o app, se ela ligou essa opção). A rede fica só aqui,
// por net.fetch; com o interruptor desligado, nada sai para a internet.
//
// Aqui também roda a análise da ferramenta "ST, MVA e CFOP" (a base fica em
// memória, recarregada quando um documento muda) e ficam as decisões
// lembradas (decisoes.json, na mesma pasta).
//
// A leitura e a validação são de src/fiscal (base.ts, documentos.ts,
// online.ts, analise.ts, entrada.ts), sem Electron. Este arquivo liga aquilo
// aos pedidos da tela.

import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  net,
  shell,
  type WebContents,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analisarItem, type ItemFiscal } from './fiscal/analise';
import {
  carregarBaseFiscal,
  importarDocumento,
  importarSeLeituraPassar,
  removerDocumento,
  lerDocumentos,
  lerSegmentosIncompletos,
  type BaseFiscal,
} from './fiscal/base';
import { baseSemProtocolos } from './previaST';
import {
  chaveDecisao,
  decisaoValida,
  lerDecisoes,
  type DecisaoLembrada,
} from './fiscal/entrada';
import {
  ErroFormato,
  MENSAGEM_SEM_APENDICE,
  NOME_DOCUMENTO,
  mvasLidasCombustiveis,
  type InfoDocumento,
  type TipoDocumento,
  type TipoOnline,
} from './fiscal/documentos';
import { lerCombustiveis } from './fiscal/combustiveis';
import {
  PAGINA,
  baixarArquivo,
  urlPermitida,
  verificarST,
  verificarTipi,
  type Buscar,
  type ResultadoVerificacao,
} from './fiscal/online';
import { buscaSimulada } from './onlineSimulado';
import { lerTabelaST } from './fiscal/st';
import { lerTipi, lerTipiPlanilha } from './fiscal/tipi';
import { lerXlsx, type Aba } from './fiscal/xlsx';
import {
  leituraCombustiveis,
  leituraST,
  leituraTipi,
  lerLeitura,
  mensagemArquivoErrado,
  reconhecerArquivo,
  segmentosIncompletosST,
  type LeituraDocumento,
  type Reconhecido,
} from './leituraDocumentos';

/**
 * Acesso à internet: net.fetch. Só no app de desenvolvimento (não
 * empacotado) a variável PS_READER_ONLINE_SIMULADO troca por arquivos
 * locais (src/onlineSimulado.ts), para testar sem rede.
 */
const buscar: Buscar =
  buscaSimulada(app.isPackaged) ?? ((url, init) => net.fetch(url, init));
const ARQ_PREFERENCIAS = 'preferencias.json';
const ARQ_DECISOES = 'decisoes.json';

const TIPOS: readonly TipoDocumento[] = ['st', 'tipi', 'combustiveis'];
const ehTipo = (v: unknown): v is TipoDocumento =>
  TIPOS.includes(v as TipoDocumento);
/** Só a planilha de ST e a TIPI têm página oficial para a verificação online. */
const ehTipoOnline = (v: unknown): v is TipoOnline =>
  v === 'st' || v === 'tipi';

export function pastaDocumentos(): string {
  return path.join(app.getPath('userData'), 'documentos');
}

const PREFERENCIAS_PADRAO: PreferenciasDocumentos = {
  verificacaoOnline: false,
  verificarAoAbrir: false,
};

async function lerPreferencias(): Promise<PreferenciasDocumentos> {
  try {
    const p = JSON.parse(
      await readFile(path.join(pastaDocumentos(), ARQ_PREFERENCIAS), 'utf8'),
    ) as Partial<PreferenciasDocumentos>;
    return {
      verificacaoOnline: p.verificacaoOnline === true,
      verificarAoAbrir: p.verificarAoAbrir === true,
    };
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

async function gravarPreferencias(p: PreferenciasDocumentos): Promise<void> {
  await mkdir(pastaDocumentos(), { recursive: true });
  await writeFile(
    path.join(pastaDocumentos(), ARQ_PREFERENCIAS),
    `${JSON.stringify(p, null, 2)}\n`,
    'utf8',
  );
}

/** Resultado da última verificação de cada documento (só enquanto o app está aberto). */
const verificacao = new Map<TipoOnline, ResultadoVerificacao>();
let verificando: Promise<void> | null = null;

async function estado(): Promise<EstadoDocumentos> {
  const docs = lerDocumentos(pastaDocumentos());
  return {
    st: docs.st,
    tipi: docs.tipi,
    combustiveis: docs.combustiveis,
    leitura: {
      st: await lerArquivoLeitura('st', docs.st),
      tipi: await lerArquivoLeitura('tipi', docs.tipi),
      combustiveis: await lerArquivoLeitura('combustiveis', docs.combustiveis),
    },
    recusado: {
      st: !docs.st && recusado.has('st'),
      tipi: !docs.tipi && recusado.has('tipi'),
      combustiveis: !docs.combustiveis && recusado.has('combustiveis'),
    },
    preferencias: await lerPreferencias(),
    verificacao: {
      st: verificacao.get('st') ?? null,
      tipi: verificacao.get('tipi') ?? null,
    },
    verificando: verificando !== null,
    // Base gravada antes da leitura das colunas de estados: pede reimportar.
    stSemProtocolos: docs.st !== null && stSemProtocolos(),
    decisoes: Object.values(await lerArquivoDecisoes()).sort((a, b) =>
      `${a.fornecedor} ${a.xProd}`.localeCompare(`${b.fornecedor} ${b.xProd}`),
    ),
  };
}

// ---------- decisões lembradas ----------

async function lerArquivoDecisoes(): Promise<Record<string, DecisaoLembrada>> {
  try {
    return lerDecisoes(
      JSON.parse(
        await readFile(path.join(pastaDocumentos(), ARQ_DECISOES), 'utf8'),
      ),
    );
  } catch {
    return {};
  }
}

/** Grava ao lado e troca, para um arquivo pela metade nunca ficar no lugar. */
async function gravarArquivoDecisoes(
  decisoes: Record<string, DecisaoLembrada>,
): Promise<void> {
  await mkdir(pastaDocumentos(), { recursive: true });
  const destino = path.join(pastaDocumentos(), ARQ_DECISOES);
  await writeFile(
    `${destino}.novo`,
    `${JSON.stringify({ versao: 1, decisoes }, null, 2)}
`,
    'utf8',
  );
  await rename(`${destino}.novo`, destino);
}

/** Pedidos de gravar em fila: dois cliques seguidos não se atropelam. */
let filaDecisoes: Promise<unknown> = Promise.resolve();
function mudarDecisoes(
  mudar: (d: Record<string, DecisaoLembrada>) => void,
): Promise<void> {
  const r = filaDecisoes.then(async () => {
    const d = await lerArquivoDecisoes();
    mudar(d);
    await gravarArquivoDecisoes(d);
  });
  filaDecisoes = r.catch(() => undefined);
  return r;
}

// ---------- análise (ferramenta ST, MVA e CFOP) ----------

let baseEmUso: { chave: string; base: BaseFiscal } | null = null;

/** Base carregada, reaproveitada enquanto os documentos não mudam. */
function baseFiscal(): BaseFiscal {
  const docs = lerDocumentos(pastaDocumentos());
  const chave = `${docs.st?.importadoEm ?? ''}|${docs.tipi?.importadoEm ?? ''}|${docs.combustiveis?.importadoEm ?? ''}`;
  if (baseEmUso?.chave !== chave)
    baseEmUso = { chave, base: carregarBaseFiscal(pastaDocumentos()) };
  return baseEmUso.base;
}

const textoDe = (v: unknown) => (typeof v === 'string' ? v : '');

function stSemProtocolos(): boolean {
  try {
    const st = baseFiscal().st;
    return st !== null && baseSemProtocolos(st.linhas);
  } catch {
    return false;
  }
}

async function analisar(pedido: unknown): Promise<ResultadoAnaliseST> {
  const p = (typeof pedido === 'object' && pedido !== null ? pedido : {}) as {
    itens?: unknown;
    uf?: unknown;
    cnpj?: unknown;
  };
  const base = baseFiscal();
  if (!base.st) return { status: 'sem-st' };
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const cnpj = textoDe(p.cnpj);
  const decisoes = await lerArquivoDecisoes();
  // Lido a cada análise (não vem do cache da base): confirmar a planilha
  // parcial muda a lista sem trocar a base.
  const segmentosIncompletos = lerSegmentosIncompletos(pastaDocumentos());
  const analises = itens.map((i: Record<string, unknown>) => {
    const item: ItemFiscal = {
      nItem: textoDe(i.nItem),
      xProd: textoDe(i.xProd),
      NCM: textoDe(i.NCM),
      CEST: textoDe(i.CEST),
      orig: textoDe(i.orig),
      CST: textoDe(i.CST),
      CSOSN: textoDe(i.CSOSN),
      pICMS: textoDe(i.pICMS),
      vBCST: textoDe(i.vBCST),
      vST: textoDe(i.vST),
      CFOP: textoDe(i.CFOP),
      cstIPI: textoDe(i.cstIPI),
      pIPI: textoDe(i.pIPI),
    };
    return {
      analise: analisarItem(item, textoDe(p.uf), {
        st: base.st!,
        tipi: base.tipi,
        segmentosIncompletos,
        combustiveis: base.combustiveis,
      }),
      lembrada: decisoes[chaveDecisao(cnpj, textoDe(i.cProd))] ?? null,
    };
  });
  return {
    status: 'ok',
    itens: analises,
    semTipi: base.tipi === null,
    historico: Object.values(decisoes),
  };
}

/** Andamento do download do Atualizar, para todas as janelas. */
function avisarProgresso(p: ProgressoDocumento): void {
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send('documento-progresso', p);
}

/** Avisa todas as janelas (a área aberta e o rodapé do painel se redesenham). */
function avisarJanelas(exceto?: WebContents): void {
  for (const w of BrowserWindow.getAllWindows())
    if (w.webContents !== exceto) w.webContents.send('documentos-mudou');
}

const mensagem = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro);

// ---------- importação: reconhecer, conferir, confirmar o parcial ----------

const arqLeitura = (tipo: TipoDocumento) => `${tipo}-leitura.json`;

/** Última tentativa recusada de cada documento (vermelho "incompatível" se nada carregado). */
const recusado = new Set<TipoDocumento>();

interface Pendente {
  tipo: TipoDocumento;
  dados: Uint8Array;
  nome: string;
  servidor: InfoDocumento['servidor'];
}
/** Planilhas com segmentos não lidos, esperando a pessoa confirmar. */
const pendentes = new Map<string, Pendente>();

/** Lê o arquivo sem gravar nada: o que ele parece e o resumo da leitura. */
function lerSemGravar(
  tipo: TipoDocumento,
  dados: Uint8Array,
): {
  reconhecido: Reconhecido;
  relatorio: (() => LeituraDocumento) | null;
  segmentosIncompletos: string[];
  /** Recusa com motivo próprio do leitor (combustíveis de outra UF, por exemplo). */
  erroFormato?: string;
} {
  const ehZip = dados.length > 4 && dados[0] === 0x50 && dados[1] === 0x4b;
  let abas: Aba[] | null = null;
  if (ehZip) {
    try {
      abas = lerXlsx(dados);
    } catch {
      abas = null;
    }
  }
  const reconhecido = reconhecerArquivo(dados, abas);
  if (tipo === 'combustiveis') {
    if (!abas)
      return { reconhecido, relatorio: null, segmentosIncompletos: [] };
    try {
      const c = lerCombustiveis(abas);
      if (mvasLidasCombustiveis(c) === 0)
        return { reconhecido, relatorio: null, segmentosIncompletos: [] };
      return {
        reconhecido,
        relatorio: () => leituraCombustiveis(c.relatorio, '', ''),
        segmentosIncompletos: [],
      };
    } catch (erro) {
      // Achou o Apêndice XIV, mas a planilha não serve (outra UF, sem os
      // grupos): a mensagem do leitor diz o porquê.
      return {
        reconhecido,
        relatorio: null,
        segmentosIncompletos: [],
        erroFormato:
          erro instanceof ErroFormato && erro.message !== MENSAGEM_SEM_APENDICE
            ? erro.message
            : undefined,
      };
    }
  }
  if (tipo === 'st') {
    if (!abas)
      return { reconhecido, relatorio: null, segmentosIncompletos: [] };
    const st = lerTabelaST(abas);
    if (st.linhas.length === 0)
      return { reconhecido, relatorio: null, segmentosIncompletos: [] };
    return {
      reconhecido,
      relatorio: () => leituraST(st.relatorio, '', ''),
      segmentosIncompletos: segmentosIncompletosST(st.relatorio),
    };
  }
  try {
    const tipi = abas
      ? lerTipiPlanilha(abas)
      : lerTipi(new TextDecoder().decode(dados));
    if (tipi.relatorio.totalNcm === 0)
      return { reconhecido, relatorio: null, segmentosIncompletos: [] };
    return {
      reconhecido,
      relatorio: () => leituraTipi(tipi.relatorio, '', ''),
      segmentosIncompletos: [],
    };
  } catch {
    return { reconhecido, relatorio: null, segmentosIncompletos: [] };
  }
}

/**
 * Importa e responde. Arquivo de outro tipo ou sem nada legível: recusa, diz
 * o que ele parece e o que fazer, e não usa nenhum dado (o documento anterior
 * fica). Planilha de ST com segmentos não lidos: só ativa depois de a pessoa
 * confirmar (`confirmado`).
 */
async function importar(
  tipo: TipoDocumento,
  dados: Uint8Array,
  nome: string,
  servidor: InfoDocumento['servidor'],
  confirmado = false,
): Promise<ResultadoImportarDocumento> {
  const recusar = async (m: {
    mensagem: string;
    oQueFazer: string;
  }): Promise<ResultadoImportarDocumento> => {
    if (!lerDocumentos(pastaDocumentos())[tipo]) recusado.add(tipo);
    avisarJanelas();
    return {
      status: 'erro',
      formato: true,
      mensagem: `${nome}: ${m.mensagem} Nenhum dado dele foi usado. ${anterior(tipo)}`,
      oQueFazer: m.oQueFazer,
      estado: await estado(),
    };
  };
  let leitura: ReturnType<typeof lerSemGravar>;
  try {
    leitura = lerSemGravar(tipo, dados);
  } catch (erro) {
    console.error(erro);
    leitura = {
      reconhecido: 'texto',
      relatorio: null,
      segmentosIncompletos: [],
    };
  }
  const outroTipo =
    leitura.reconhecido !== tipo &&
    leitura.reconhecido !== 'planilha' &&
    leitura.reconhecido !== 'texto';
  if (!outroTipo && leitura.erroFormato)
    return recusar({
      ...mensagemArquivoErrado(tipo, leitura.reconhecido),
      mensagem: leitura.erroFormato,
    });
  if (outroTipo || !leitura.relatorio)
    return recusar(mensagemArquivoErrado(tipo, leitura.reconhecido));

  if (leitura.segmentosIncompletos.length > 0 && !confirmado) {
    const token = randomUUID();
    pendentes.clear();
    pendentes.set(token, { tipo, dados, nome, servidor });
    return {
      status: 'parcial',
      token,
      arquivo: nome,
      segmentos: leitura.segmentosIncompletos,
      estado: await estado(),
    };
  }

  try {
    // Arquivo baixado (Atualizar): lido antes numa pasta temporária; só
    // substitui o carregado se a leitura passar.
    const info = (servidor ? importarSeLeituraPassar : importarDocumento)(
      tipo,
      dados,
      nome,
      pastaDocumentos(),
      new Date(),
      servidor,
    );
    const resumo: LeituraDocumento = {
      ...leitura.relatorio(),
      arquivo: info.arquivo,
      importadoEm: info.importadoEm,
    };
    await writeFile(
      path.join(pastaDocumentos(), arqLeitura(tipo)),
      `${JSON.stringify(resumo, null, 2)}\n`,
      'utf8',
    );
    recusado.delete(tipo);
    avisarJanelas();
    return { status: 'ok', info, estado: await estado() };
  } catch (erro) {
    if (erro instanceof ErroFormato)
      return recusar(mensagemArquivoErrado(tipo, leitura.reconhecido));
    console.error(erro);
    return {
      status: 'erro',
      formato: false,
      mensagem: `Não foi possível importar ${nome}: ${mensagem(erro)}`,
      estado: await estado(),
    };
  }
}

/** Resumo da leitura do documento carregado; importação antiga, sem arquivo: calcula e grava. */
async function lerArquivoLeitura(
  tipo: TipoDocumento,
  info: InfoDocumento | null,
): Promise<LeituraDocumento | null> {
  if (!info) return null;
  const caminho = path.join(pastaDocumentos(), arqLeitura(tipo));
  try {
    const l = lerLeitura(JSON.parse(await readFile(caminho, 'utf8')), info);
    if (l) return l;
  } catch {
    // Sem arquivo ainda: segue para calcular.
  }
  const base = carregarBaseFiscal(pastaDocumentos());
  const relatorio =
    tipo === 'st'
      ? base.st && leituraST(base.st.relatorio, info.arquivo, info.importadoEm)
      : tipo === 'combustiveis'
        ? base.combustiveis &&
          leituraCombustiveis(
            base.combustiveis.relatorio,
            info.arquivo,
            info.importadoEm,
          )
        : base.tipi &&
          leituraTipi(base.tipi.relatorio, info.arquivo, info.importadoEm);
  if (!relatorio) return null;
  await writeFile(caminho, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');
  return relatorio;
}

function anterior(tipo: TipoDocumento): string {
  return lerDocumentos(pastaDocumentos())[tipo]
    ? 'O documento anterior continua carregado.'
    : `${NOME_DOCUMENTO[tipo]} continua faltando.`;
}

async function verificarAgora(): Promise<void> {
  if (verificando) return verificando;
  verificando = (async () => {
    const docs = lerDocumentos(pastaDocumentos());
    // Uma requisição por documento, as duas ao mesmo tempo. As funções de
    // src/fiscal/online.ts não lançam: falha de rede vira "sem conexão".
    const [st, tipi] = await Promise.all([
      verificarST(docs.st, buscar),
      verificarTipi(docs.tipi, buscar),
    ]);
    verificacao.set('st', st);
    verificacao.set('tipi', tipi);
  })().finally(() => {
    verificando = null;
  });
  avisarJanelas();
  await verificando;
  avisarJanelas();
}

/** Downloads em andamento: dois cliques (ou duas janelas) não baixam duas vezes. */
const baixando = new Set<TipoOnline>();

async function baixar(tipo: TipoOnline): Promise<ResultadoImportarDocumento> {
  if (baixando.has(tipo)) return { status: 'cancelado' };
  baixando.add(tipo);
  try {
    return await baixarEImportar(tipo);
  } finally {
    baixando.delete(tipo);
  }
}

async function baixarEImportar(
  tipo: TipoOnline,
): Promise<ResultadoImportarDocumento> {
  const r = verificacao.get(tipo);
  const url = r?.disponivel?.url;
  if (!r || r.estado !== 'nova' || !url || !urlPermitida(tipo, url))
    return {
      status: 'erro',
      formato: false,
      mensagem: 'Verifique de novo antes de baixar.',
      estado: await estado(),
    };
  let baixado: Awaited<ReturnType<typeof baixarArquivo>>;
  try {
    baixado = await baixarArquivo(tipo, url, buscar, (recebido, total) =>
      avisarProgresso({ tipo, recebido, total, fim: false }),
    );
  } catch (erro) {
    return {
      status: 'erro',
      formato: false,
      mensagem: `Não foi possível baixar: ${mensagem(erro)}. ${anterior(tipo)}`,
      estado: await estado(),
    };
  } finally {
    avisarProgresso({ tipo, recebido: 0, total: null, fim: true });
  }
  const { dados, nome, data } = baixado;
  const resultado = await importar(tipo, dados, nome, {
    url,
    data: data ?? r.disponivel?.data ?? null,
    tamanho: r.disponivel?.tamanho ?? dados.length,
    versao: r.disponivel?.versao ?? null,
    baixadoEm: new Date().toISOString(),
  });
  if (resultado.status === 'ok') {
    verificacao.set(tipo, {
      ...r,
      estado: 'atualizado',
      detalhe: 'Baixado e importado agora.',
      disponivel: null,
    });
    avisarJanelas();
    resultado.estado = await estado();
  }
  return resultado;
}

const FILTROS: Record<TipoDocumento, Electron.FileFilter[]> = {
  st: [{ name: 'Planilha de ST (.xlsx)', extensions: ['xlsx'] }],
  tipi: [{ name: 'TIPI (.xlsx ou texto .txt)', extensions: ['xlsx', 'txt'] }],
  combustiveis: [
    { name: 'Planilha de combustíveis (.xlsx)', extensions: ['xlsx'] },
  ],
};

export function registrarDocumentos(): void {
  ipcMain.handle('documentos', () => estado());

  ipcMain.handle('analisar-st', (_event, pedido: unknown) => analisar(pedido));

  ipcMain.handle('lembrar-decisao', async (_event, d: unknown) => {
    if (!decisaoValida(d)) return false;
    await mudarDecisoes((todas) => {
      todas[chaveDecisao(d.raizCnpj, d.cProd)] = d;
    });
    avisarJanelas();
    return true;
  });

  ipcMain.handle('esquecer-decisao', async (_event, chave: unknown) => {
    if (typeof chave !== 'string') return false;
    await mudarDecisoes((todas) => {
      delete todas[chave];
    });
    avisarJanelas();
    return true;
  });

  ipcMain.handle(
    'importar-documento',
    async (event, tipo: unknown): Promise<ResultadoImportarDocumento> => {
      if (!ehTipo(tipo)) return { status: 'cancelado' };
      const janela = BrowserWindow.fromWebContents(event.sender);
      const opcoes: Electron.OpenDialogOptions = {
        title: `Carregar ${NOME_DOCUMENTO[tipo]}`,
        filters: FILTROS[tipo],
        properties: ['openFile'],
      };
      const { canceled, filePaths } = janela
        ? await dialog.showOpenDialog(janela, opcoes)
        : await dialog.showOpenDialog(opcoes);
      if (canceled || filePaths.length === 0) return { status: 'cancelado' };
      let dados: Uint8Array;
      try {
        dados = new Uint8Array(await readFile(filePaths[0]));
      } catch (erro) {
        return {
          status: 'erro',
          formato: false,
          mensagem: `Não foi possível ler ${path.basename(filePaths[0])}: ${mensagem(erro)}`,
          estado: await estado(),
        };
      }
      return importar(tipo, dados, path.basename(filePaths[0]), null);
    },
  );

  // Planilha com segmentos não lidos: a pessoa confirmou que pode usar o resto.
  ipcMain.handle(
    'confirmar-parcial',
    async (_event, token: unknown): Promise<ResultadoImportarDocumento> => {
      const p = typeof token === 'string' ? pendentes.get(token) : undefined;
      if (!p) return { status: 'cancelado' };
      pendentes.delete(token as string);
      const r = await importar(p.tipo, p.dados, p.nome, p.servidor, true);
      const v = ehTipoOnline(p.tipo) ? verificacao.get(p.tipo) : undefined;
      if (
        r.status === 'ok' &&
        p.servidor &&
        v?.estado === 'nova' &&
        ehTipoOnline(p.tipo)
      ) {
        verificacao.set(p.tipo, {
          ...v,
          estado: 'atualizado',
          detalhe: 'Baixado e importado agora.',
          disponivel: null,
        });
        r.estado = await estado();
      }
      return r;
    },
  );

  // Aviso de erro fechado pela pessoa: a recusa some e o documento volta ao
  // estado de antes da tentativa (o carregado, "Faltando" ou "Opcional").
  ipcMain.handle(
    'descartar-recusa',
    async (_event, tipo: unknown): Promise<EstadoDocumentos> => {
      if (ehTipo(tipo) && recusado.delete(tipo)) avisarJanelas();
      return estado();
    },
  );

  ipcMain.handle('cancelar-parcial', (_event, token: unknown) => {
    if (typeof token === 'string') pendentes.delete(token);
  });

  // Remover: o documento volta a "faltando" (a ferramenta pede o arquivo).
  ipcMain.handle(
    'remover-documento',
    async (_event, tipo: unknown): Promise<EstadoDocumentos> => {
      if (ehTipo(tipo)) {
        removerDocumento(tipo, pastaDocumentos());
        await rm(path.join(pastaDocumentos(), arqLeitura(tipo)), {
          force: true,
        });
        if (ehTipoOnline(tipo)) verificacao.delete(tipo);
        recusado.delete(tipo);
        avisarJanelas();
      }
      return estado();
    },
  );

  ipcMain.handle(
    'preferencias-documentos',
    async (_event, p: unknown): Promise<EstadoDocumentos> => {
      const atual = await lerPreferencias();
      const novo =
        typeof p === 'object' && p !== null
          ? (p as Partial<PreferenciasDocumentos>)
          : {};
      const prefs: PreferenciasDocumentos = {
        verificacaoOnline:
          typeof novo.verificacaoOnline === 'boolean'
            ? novo.verificacaoOnline
            : atual.verificacaoOnline,
        verificarAoAbrir:
          typeof novo.verificarAoAbrir === 'boolean'
            ? novo.verificarAoAbrir
            : atual.verificarAoAbrir,
      };
      await gravarPreferencias(prefs);
      // Desligado, o resultado antigo some junto: nada de internet à mostra.
      if (!prefs.verificacaoOnline) verificacao.clear();
      avisarJanelas();
      return estado();
    },
  );

  ipcMain.handle(
    'verificar-documentos',
    async (): Promise<EstadoDocumentos> => {
      if ((await lerPreferencias()).verificacaoOnline) await verificarAgora();
      return estado();
    },
  );

  ipcMain.handle(
    'baixar-documento',
    async (_event, tipo: unknown): Promise<ResultadoImportarDocumento> => {
      if (!ehTipoOnline(tipo) || !(await lerPreferencias()).verificacaoOnline)
        return { status: 'cancelado' };
      return baixar(tipo);
    },
  );

  // Só as páginas oficiais conhecidas; nada vindo da tela.
  ipcMain.handle('abrir-pagina-documento', async (_event, tipo: unknown) => {
    if (ehTipoOnline(tipo)) await shell.openExternal(PAGINA[tipo]);
  });
}

/** "Verificar ao abrir o app": uma vez por abertura, se a pessoa ligou as duas opções. */
export async function verificarAoAbrir(): Promise<void> {
  const p = await lerPreferencias();
  if (p.verificacaoOnline && p.verificarAoAbrir) await verificarAgora();
}
