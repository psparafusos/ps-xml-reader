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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analisarItem, type ItemFiscal } from './fiscal/analise';
import {
  carregarBaseFiscal,
  importarDocumento,
  lerDocumentos,
  type BaseFiscal,
} from './fiscal/base';
import {
  chaveDecisao,
  decisaoValida,
  lerDecisoes,
  type DecisaoLembrada,
} from './fiscal/entrada';
import {
  ErroFormato,
  NOME_DOCUMENTO,
  type InfoDocumento,
  type TipoDocumento,
} from './fiscal/documentos';
import {
  PAGINA,
  urlPermitida,
  verificarST,
  verificarTipi,
  type ResultadoVerificacao,
} from './fiscal/online';

/** Tempo para baixar a planilha (a de ST tem ~1 MB; a TIPI, ~700 KB). */
const TEMPO_DOWNLOAD_MS = 120_000;
const LIMITE_DOWNLOAD = 30 * 1024 * 1024;
const ARQ_PREFERENCIAS = 'preferencias.json';
const ARQ_DECISOES = 'decisoes.json';

const TIPOS: readonly TipoDocumento[] = ['st', 'tipi'];
const ehTipo = (v: unknown): v is TipoDocumento =>
  TIPOS.includes(v as TipoDocumento);

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
const verificacao = new Map<TipoDocumento, ResultadoVerificacao>();
let verificando: Promise<void> | null = null;

async function estado(): Promise<EstadoDocumentos> {
  const docs = lerDocumentos(pastaDocumentos());
  return {
    st: docs.st,
    tipi: docs.tipi,
    preferencias: await lerPreferencias(),
    verificacao: {
      st: verificacao.get('st') ?? null,
      tipi: verificacao.get('tipi') ?? null,
    },
    verificando: verificando !== null,
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
  const chave = `${docs.st?.importadoEm ?? ''}|${docs.tipi?.importadoEm ?? ''}`;
  if (baseEmUso?.chave !== chave)
    baseEmUso = { chave, base: carregarBaseFiscal(pastaDocumentos()) };
  return baseEmUso.base;
}

const textoDe = (v: unknown) => (typeof v === 'string' ? v : '');

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
      CFOP: textoDe(i.CFOP),
      cstIPI: textoDe(i.cstIPI),
      pIPI: textoDe(i.pIPI),
    };
    return {
      analise: analisarItem(item, textoDe(p.uf), {
        st: base.st!,
        tipi: base.tipi,
      }),
      lembrada: decisoes[chaveDecisao(cnpj, textoDe(i.cProd))] ?? null,
    };
  });
  return { status: 'ok', itens: analises, semTipi: base.tipi === null };
}

/** Avisa todas as janelas (a área aberta e o rodapé do painel se redesenham). */
function avisarJanelas(exceto?: WebContents): void {
  for (const w of BrowserWindow.getAllWindows())
    if (w.webContents !== exceto) w.webContents.send('documentos-mudou');
}

const mensagem = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro);

/** Importa e responde; formato não reconhecido não toca no documento anterior. */
async function importar(
  tipo: TipoDocumento,
  dados: Uint8Array,
  nome: string,
  servidor: InfoDocumento['servidor'],
): Promise<ResultadoImportarDocumento> {
  try {
    const info = importarDocumento(
      tipo,
      dados,
      nome,
      pastaDocumentos(),
      new Date(),
      servidor,
    );
    avisarJanelas();
    return { status: 'ok', info, estado: await estado() };
  } catch (erro) {
    const formato = erro instanceof ErroFormato;
    if (!formato) console.error(erro);
    return {
      status: 'erro',
      formato,
      mensagem: formato
        ? `${nome}: formato não reconhecido. ${mensagem(erro)} ${anterior(tipo)}`
        : `Não foi possível importar ${nome}: ${mensagem(erro)}`,
      estado: await estado(),
    };
  }
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
    const buscar = (url: string, init: RequestInit) => net.fetch(url, init);
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

async function baixar(
  tipo: TipoDocumento,
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
  let dados: Uint8Array;
  let data: string | null = null;
  try {
    const resp = await net.fetch(url, {
      signal: AbortSignal.timeout(TEMPO_DOWNLOAD_MS),
    });
    if (!resp.ok) throw new Error(`o servidor respondeu ${resp.status}`);
    const tamanho = Number(resp.headers.get('content-length'));
    if (tamanho > LIMITE_DOWNLOAD) throw new Error('arquivo grande demais');
    dados = new Uint8Array(await resp.arrayBuffer());
    if (dados.length > LIMITE_DOWNLOAD)
      throw new Error('arquivo grande demais');
    const lm = Date.parse(resp.headers.get('last-modified') ?? '');
    data = Number.isNaN(lm) ? null : new Date(lm).toISOString();
  } catch (erro) {
    return {
      status: 'erro',
      formato: false,
      mensagem: `Não foi possível baixar: ${mensagem(erro)}. ${anterior(tipo)}`,
      estado: await estado(),
    };
  }
  const nome = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  const resultado = await importar(tipo, dados, nome || `${tipo}.xlsx`, {
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
      if (!ehTipo(tipo) || !(await lerPreferencias()).verificacaoOnline)
        return { status: 'cancelado' };
      return baixar(tipo);
    },
  );

  // Só as páginas oficiais conhecidas; nada vindo da tela.
  ipcMain.handle('abrir-pagina-documento', async (_event, tipo: unknown) => {
    if (ehTipo(tipo)) await shell.openExternal(PAGINA[tipo]);
  });
}

/** "Verificar ao abrir o app": uma vez por abertura, se a pessoa ligou as duas opções. */
export async function verificarAoAbrir(): Promise<void> {
  const p = await lerPreferencias();
  if (p.verificacaoOnline && p.verificarAoAbrir) await verificarAgora();
}
