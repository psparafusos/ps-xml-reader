// Cadastro do sistema de gestão no processo principal: o documento
// opcional da aba Documentos de referência. Carregar (diálogo de arquivo,
// leitura e validação no serviço de leitura pesada), gravar na pasta
// "documentos" da pasta de dados do app, remover. Arquivo inválido nunca
// substitui o carregado: o novo só vai para o lugar depois de passar no
// validador, gravado ao lado e trocado por rename.
//
// O formato, o validador e os metadados são de src/cadastro (sem
// Electron). Aqui também fica o cadastro em memória para a coluna "Código
// da casa" da Conferência: lido do disco e indexado na primeira vez que uma
// nota pede a sugestão (o cadastro real de 17 MB leva menos de 1 s),
// guardado enquanto o arquivo não muda, e os canais da sugestão (o motor,
// src/cadastro/casamento.ts) e da busca do quadro de escolha.

import { BrowserWindow, dialog, type WebContents } from 'electron';
import { readFile, rename, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tratar } from './ipcSeguro';
import {
  LIMITE_CADASTRO_BYTES,
  NOME_CADASTRO,
  montarInfoCadastro,
  validarInfoCadastro,
  type EstadoCadastro,
  type InfoCadastro,
  type LeituraCadastro,
} from './cadastro/documento';
import {
  filiaisDo,
  fatorDoPar,
  prepararCadastro,
  sugerirNota,
  type IndiceCadastro,
  type ItemNota,
  type SugestaoItem,
  vinculosDoCodigo,
} from './cadastro/casamento';
import { buscarProdutos } from './cadastro/codigoCasa';
import { validarTextoCadastro, type ProdutoCadastro } from './cadastro/formato';
import { lerCadastroNoServico } from './servico/principal';
import { mensagemDoDesfecho } from './servico/supervisor';

export const ARQ_CADASTRO = 'cadastro.json';
export const ARQ_INFO_CADASTRO = 'cadastro-info.json';

/** Última tentativa recusada (vermelho "Incompatível" enquanto nada está carregado). */
let recusado = false;

async function lerInfo(pasta: string): Promise<InfoCadastro | null> {
  try {
    const info = validarInfoCadastro(
      JSON.parse(await readFile(path.join(pasta, ARQ_INFO_CADASTRO), 'utf8')),
    );
    if (!info) return null;
    // Sem o arquivo do cadastro ao lado, a info sozinha não vale.
    await stat(path.join(pasta, ARQ_CADASTRO));
    return info;
  } catch {
    return null;
  }
}

export async function estadoCadastro(pasta: string): Promise<EstadoCadastro> {
  const info = await lerInfo(pasta);
  return { info, recusado: !info && recusado };
}

/**
 * Grava o arquivo e a info ao lado (.novo) e só então troca, cada um por
 * rename: nenhum dos dois fica pela metade no lugar. O cadastro vai primeiro
 * e a info por último.
 */
async function gravar(
  pasta: string,
  dados: Uint8Array,
  info: InfoCadastro,
): Promise<void> {
  await mkdir(pasta, { recursive: true });
  const destino = path.join(pasta, ARQ_CADASTRO);
  const destinoInfo = path.join(pasta, ARQ_INFO_CADASTRO);
  try {
    await writeFile(`${destino}.novo`, dados);
    await writeFile(
      `${destinoInfo}.novo`,
      `${JSON.stringify(info, null, 2)}\n`,
      'utf8',
    );
    await rename(`${destino}.novo`, destino);
    await rename(`${destinoInfo}.novo`, destinoInfo);
  } finally {
    await rm(`${destino}.novo`, { force: true });
    await rm(`${destinoInfo}.novo`, { force: true });
  }
}

const mensagem = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro);

function anterior(info: InfoCadastro | null): string {
  return info
    ? 'O cadastro anterior continua carregado.'
    : `${NOME_CADASTRO} continua sem carregar.`;
}

type Importacao =
  | { status: 'ok'; info: InfoCadastro }
  | { status: 'erro'; mensagem: string; erros: string[] }
  | { status: 'cancelado' };

/** Importa os bytes já lidos: valida no serviço, grava se passar. */
export async function importarCadastro(
  pasta: string,
  dados: Uint8Array,
  nome: string,
  wc: WebContents | null,
  agora: () => Date = () => new Date(),
): Promise<Importacao> {
  const antes = await lerInfo(pasta);
  const desfecho = await lerCadastroNoServico(dados, wc);
  if (desfecho.status === 'cancelado') return { status: 'cancelado' };
  if (desfecho.status !== 'ok')
    return {
      status: 'erro',
      mensagem: `${nome}: ${mensagemDoDesfecho(desfecho)} Nenhum dado dele foi usado. ${anterior(antes)}`,
      erros: [],
    };
  const leitura = desfecho.resultado as LeituraCadastro;
  if (!leitura.ok) {
    if (!antes) recusado = true;
    return {
      status: 'erro',
      mensagem: `${nome} não segue o formato do cadastro (${leitura.totalErros} ${leitura.totalErros === 1 ? 'problema' : 'problemas'}). Nenhum dado dele foi usado. ${anterior(antes)}`,
      erros: leitura.erros,
    };
  }
  const info = montarInfoCadastro(leitura, nome, dados.byteLength, agora());
  try {
    await gravar(pasta, dados, info);
  } catch (erro) {
    console.error(erro);
    return {
      status: 'erro',
      mensagem: `Não foi possível gravar ${nome}: ${mensagem(erro)}. ${anterior(antes)}`,
      erros: [],
    };
  }
  recusado = false;
  return { status: 'ok', info };
}

// ---------- o cadastro em memória (Código da casa) ----------

interface CadastroEmMemoria {
  /** importadoEm da info: muda a cada importação. */
  chave: string;
  indice: IndiceCadastro;
  produtos: ProdutoCadastro[];
}

let emMemoria: CadastroEmMemoria | null = null;
let carregando: Promise<CadastroEmMemoria | null> | null = null;

/** O cadastro carregado, lido e indexado uma vez; null sem cadastro. */
async function cadastroEmMemoria(
  pasta: string,
): Promise<CadastroEmMemoria | null> {
  const info = await lerInfo(pasta);
  if (!info) {
    emMemoria = null;
    return null;
  }
  if (emMemoria?.chave === info.importadoEm) return emMemoria;
  if (carregando) return carregando;
  carregando = (async () => {
    try {
      const dados = await readFile(path.join(pasta, ARQ_CADASTRO));
      const texto = new TextDecoder('utf-8').decode(dados);
      const r = validarTextoCadastro(texto);
      if (!r.ok) return null;
      emMemoria = {
        chave: info.importadoEm,
        indice: prepararCadastro(r.cadastro),
        produtos: r.cadastro.produtos,
      };
      return emMemoria;
    } catch (erro) {
      console.error(erro);
      return null;
    } finally {
      carregando = null;
    }
  })();
  return carregando;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const documento = (v: unknown) => texto(v).replace(/\D/g, '');

/** O pedido da tela, conferido campo a campo. */
function lerNota(v: unknown): {
  cnpj: string | null;
  cpf: string | null;
  chave: string | null;
  itens: ItemNota[];
} | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.itens) || o.itens.length > 2000) return null;
  const itens: ItemNota[] = [];
  for (const i of o.itens) {
    if (typeof i !== 'object' || i === null) return null;
    const x = i as Record<string, unknown>;
    const nItem = Number(x.nItem);
    if (!Number.isInteger(nItem)) return null;
    const v = Number(texto(x.vUnCom));
    itens.push({
      nItem,
      cProd: texto(x.cProd),
      cEAN: texto(x.cEAN),
      xProd: texto(x.xProd),
      NCM: texto(x.NCM),
      uCom: texto(x.uCom),
      vUnCom: Number.isFinite(v) && v > 0 ? v : null,
    });
  }
  const cnpj = documento(o.cnpj);
  const cpf = documento(o.cpf);
  const chave = documento(o.chave);
  return {
    cnpj: cnpj.length === 14 ? cnpj : null,
    cpf: cpf.length === 11 ? cpf : null,
    chave: chave.length === 44 ? chave : null,
    itens,
  };
}

/** O que a coluna Código da casa recebe: o motor item a item. */
export async function sugerirCodigosCasa(
  pasta: string,
  pedido: unknown,
): Promise<ResultadoSugestaoCasa> {
  const nota = lerNota(pedido);
  if (!nota) return { status: 'sem-cadastro' };
  const c = await cadastroEmMemoria(pasta);
  if (!c) return { status: 'sem-cadastro' };
  const r = sugerirNota(c.indice, {
    cnpjEmitente: nota.cnpj,
    cpfEmitente: nota.cpf,
    chave: nota.chave,
    itens: nota.itens,
  });
  const barras: Record<string, string> = {};
  for (const s of r.itens)
    for (const x of s.candidatos) {
      const b = c.indice.produtos.get(x.codigo)?.codigoBarras;
      if (b) barras[x.codigo] = b;
    }
  return {
    status: 'ok',
    itens: r.itens satisfies SugestaoItem[],
    barras,
    emitenteConhecido: r.emitenteConhecido,
  };
}

/** Busca do quadro de escolha, com o fator do par para cada produto achado. */
export async function buscarNoCadastro(
  pasta: string,
  pedido: unknown,
): Promise<ResultadoBuscaCasa> {
  const o =
    typeof pedido === 'object' && pedido !== null
      ? (pedido as Record<string, unknown>)
      : {};
  const c = await cadastroEmMemoria(pasta);
  if (!c) return { status: 'sem-cadastro' };
  const termo = texto(o.texto).slice(0, 200);
  const emitente = documento(o.emitente) || null;
  const filiais = filiaisDo(c.indice, emitente);
  const uCom = texto(o.uCom);
  // Um código pedido direto (candidato do motor): só ele, se existir.
  const codigo = texto(o.codigo);
  const achados = codigo
    ? c.produtos.filter((p) => p.codigo === codigo).slice(0, 1)
    : null;
  const lista = achados
    ? achados.map((p) => ({
        codigo: p.codigo,
        descricao: p.descricao,
        unidade: p.unidade,
        codigoBarras: p.codigoBarras,
        ativo: p.ativo,
      }))
    : buscarProdutos(c.produtos, termo);
  return {
    status: 'ok',
    produtos: lista.map((p) => ({
      ...p,
      fator: fatorDoPar(c.indice, emitente, filiais, p.codigo, uCom),
    })),
  };
}

/**
 * XML de importação: para cada item, o código de barras e a unidade de venda
 * do produto escolhido e os produtos para os quais o emitente tem vínculo
 * exato do cProd (só o emitente: o sistema de gestão segue o vínculo do
 * próprio CNPJ).
 */
export async function dadosImportacao(
  pasta: string,
  pedido: unknown,
): Promise<ResultadoDadosImportacao> {
  const o =
    typeof pedido === 'object' && pedido !== null
      ? (pedido as Record<string, unknown>)
      : {};
  if (!Array.isArray(o.itens) || o.itens.length > 2000)
    return { status: 'sem-cadastro' };
  const c = await cadastroEmMemoria(pasta);
  if (!c) return { status: 'sem-cadastro' };
  const emitente = documento(o.emitente) || null;
  const itens: Extract<ResultadoDadosImportacao, { status: 'ok' }>['itens'] =
    [];
  for (const i of o.itens) {
    if (typeof i !== 'object' || i === null) continue;
    const x = i as Record<string, unknown>;
    const nItem = texto(x.nItem);
    const codigo = texto(x.codigo);
    if (!nItem || !codigo) continue;
    const p = c.indice.produtos.get(codigo);
    itens.push({
      nItem,
      existe: p !== undefined,
      codigoBarras: p?.codigoBarras ?? null,
      unidade: p?.unidade ?? '',
      vinculosCProd: vinculosDoCodigo(c.indice, emitente, texto(x.cProd)),
    });
  }
  return { status: 'ok', itens };
}

export async function removerCadastro(pasta: string): Promise<void> {
  emMemoria = null;
  // A info primeiro: sem ela o cadastro já conta como removido.
  await rm(path.join(pasta, ARQ_INFO_CADASTRO), { force: true });
  await rm(path.join(pasta, ARQ_CADASTRO), { force: true });
  recusado = false;
}

/**
 * Canais do cadastro. `pasta` é a pasta "documentos"; `estado` devolve o
 * estado de todos os documentos (a área redesenha com ele); `avisar` avisa
 * as janelas de que os documentos mudaram.
 */
export function registrarCadastro(
  pasta: () => string,
  estado: () => Promise<EstadoDocumentos>,
  avisar: () => void,
): void {
  tratar(
    'importar-cadastro',
    async (event): Promise<ResultadoImportarCadastro> => {
      const janela = BrowserWindow.fromWebContents(event.sender);
      const opcoes: Electron.OpenDialogOptions = {
        title: `Carregar ${NOME_CADASTRO}`,
        filters: [
          {
            name: 'Cadastro do sistema de gestão (.json)',
            extensions: ['json'],
          },
        ],
        properties: ['openFile'],
      };
      const { canceled, filePaths } = janela
        ? await dialog.showOpenDialog(janela, opcoes)
        : await dialog.showOpenDialog(opcoes);
      if (canceled || filePaths.length === 0) return { status: 'cancelado' };
      const caminho = filePaths[0];
      const nome = path.basename(caminho);
      let dados: Uint8Array;
      try {
        // Tamanho antes de ler: nada acima do limite vai para a memória.
        const tamanho = (await stat(caminho)).size;
        if (tamanho > LIMITE_CADASTRO_BYTES)
          return {
            status: 'erro',
            mensagem: `${nome} tem ${Math.ceil(tamanho / (1024 * 1024))} MB, grande demais para o cadastro (limite de ${LIMITE_CADASTRO_BYTES / (1024 * 1024)} MB). Nenhum dado dele foi usado. ${anterior(await lerInfo(pasta()))}`,
            erros: [],
            estado: await estado(),
          };
        dados = new Uint8Array(await readFile(caminho));
      } catch (erro) {
        return {
          status: 'erro',
          mensagem: `Não foi possível ler ${nome}: ${mensagem(erro)}`,
          erros: [],
          estado: await estado(),
        };
      }
      const r = await importarCadastro(pasta(), dados, nome, event.sender);
      if (r.status === 'cancelado') return r;
      avisar();
      return { ...r, estado: await estado() };
    },
  );

  tratar('remover-cadastro', async (): Promise<EstadoDocumentos> => {
    await removerCadastro(pasta());
    avisar();
    return estado();
  });

  tratar('sugerir-codigos-casa', (_event, pedido: unknown) =>
    sugerirCodigosCasa(pasta(), pedido),
  );

  tratar('buscar-cadastro', (_event, pedido: unknown) =>
    buscarNoCadastro(pasta(), pedido),
  );

  tratar('dados-importacao', (_event, pedido: unknown) =>
    dadosImportacao(pasta(), pedido),
  );

  // Aviso de erro fechado: a recusa some e o cartão volta a "Opcional".
  tratar('descartar-recusa-cadastro', async (): Promise<EstadoDocumentos> => {
    if (recusado) {
      recusado = false;
      avisar();
    }
    return estado();
  });
}
