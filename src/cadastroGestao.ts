// Cadastro do sistema de gestão no processo principal: o documento
// opcional da aba Documentos de referência. Carregar (diálogo de arquivo,
// leitura e validação no serviço de leitura pesada), gravar na pasta
// "documentos" da pasta de dados do app, remover. Arquivo inválido nunca
// substitui o carregado: o novo só vai para o lugar depois de passar no
// validador, gravado ao lado e trocado por rename.
//
// O formato, o validador e os metadados são de src/cadastro (sem
// Electron). A sugestão na Conferência ainda não usa o cadastro.

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

export async function removerCadastro(pasta: string): Promise<void> {
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

  // Aviso de erro fechado: a recusa some e o cartão volta a "Opcional".
  tratar('descartar-recusa-cadastro', async (): Promise<EstadoDocumentos> => {
    if (recusado) {
      recusado = false;
      avisar();
    }
    return estado();
  });
}
