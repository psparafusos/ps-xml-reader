// Leitura do arquivo para a tela do leitor genérico de XML, no processo
// principal: stat com prazo (pasta de rede), tamanho conferido antes de ler
// (acima de 100 MB o conteúdo nunca é lido), leitura dos bytes e preparo
// (src/xml/preparar.ts). Também o comando do Bloco de Notas. Sem Electron;
// o acesso ao disco vem por parâmetro para os testes.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  comLimite,
  ESPERA_CAMINHO_MS,
  mensagemSemResposta,
} from '../seguranca/arquivo';
import { avaliarTamanho, LIMITE_TEXTO_BYTES } from '../xml/limites';
import { prepararLeitura } from '../xml/preparar';
import type { InfoArquivo, MotivoRecusa, ResultadoLeitorXml } from './tipos';

export const MENSAGEM_EM_USO_LEITOR =
  'O arquivo está em uso por outro programa. Feche-o lá e tente de novo.';
export const MENSAGEM_NAO_ENCONTRADO =
  'O arquivo não foi encontrado. Ele pode ter sido movido ou apagado.';
export const MENSAGEM_ERRO_LEITURA = 'Não foi possível ler o arquivo.';

export interface DiscoLeitor {
  tamanho(caminho: string): Promise<number>;
  ler(caminho: string): Promise<Uint8Array>;
}

const discoReal: DiscoLeitor = {
  tamanho: async (caminho) => (await stat(caminho)).size,
  ler: (caminho) => readFile(caminho),
};

export interface LeituraParaTela {
  resultado: ResultadoLeitorXml;
  /** O texto decodificado, entregue à parte; null se recusado. */
  texto: string | null;
}

const ESGOTOU = Symbol('esgotou');

/** Motivo e mensagem de um erro de disco. */
function erroDeDisco(erro: unknown): {
  motivo: MotivoRecusa;
  mensagem: string;
} {
  const code = (erro as { code?: unknown } | null)?.code;
  if (code === 'EBUSY' || code === 'EPERM') {
    return { motivo: 'em-uso', mensagem: MENSAGEM_EM_USO_LEITOR };
  }
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return { motivo: 'nao-encontrado', mensagem: MENSAGEM_NAO_ENCONTRADO };
  }
  return { motivo: 'erro', mensagem: MENSAGEM_ERRO_LEITURA };
}

/** Lê e prepara o arquivo; nunca lança por causa do arquivo. */
export async function lerParaLeitor(
  caminho: string,
  disco: DiscoLeitor = discoReal,
  prazo = ESPERA_CAMINHO_MS,
): Promise<LeituraParaTela> {
  const arquivo: InfoArquivo = {
    nome: path.basename(caminho),
    caminho,
    tamanho: null,
  };
  const recusa = (motivo: MotivoRecusa, mensagem: string): LeituraParaTela => ({
    resultado: { status: 'recusado', arquivo, motivo, mensagem },
    texto: null,
  });

  let tamanho: number | typeof ESGOTOU;
  try {
    tamanho = await comLimite(disco.tamanho(caminho), prazo, ESGOTOU);
  } catch (erro) {
    const { motivo, mensagem } = erroDeDisco(erro);
    return recusa(motivo, mensagem);
  }
  if (tamanho === ESGOTOU) {
    return recusa('sem-resposta', mensagemSemResposta(caminho));
  }
  arquivo.tamanho = tamanho;
  const avaliacao = avaliarTamanho(tamanho);
  if (avaliacao.modo === 'recusado') {
    return recusa('grande', avaliacao.mensagem ?? '');
  }

  let bytes: Uint8Array;
  try {
    bytes = await disco.ler(caminho);
  } catch (erro) {
    const { motivo, mensagem } = erroDeDisco(erro);
    return recusa(motivo, mensagem);
  }
  // O arquivo pode ter mudado entre o stat e a leitura.
  arquivo.tamanho = bytes.byteLength;
  if (bytes.byteLength > LIMITE_TEXTO_BYTES) {
    return recusa('grande', avaliarTamanho(bytes.byteLength).mensagem ?? '');
  }

  const preparo = prepararLeitura(bytes);
  if (!preparo.ok) return recusa(preparo.motivo, preparo.mensagem);
  const { texto, ok: _ok, ...leitura } = preparo;
  return { resultado: { status: 'ok', arquivo, leitura }, texto };
}

/**
 * Executável e argumentos para abrir `caminho` no Bloco de Notas: sempre o
 * notepad.exe da pasta do Windows, pelo caminho completo (nunca procurado na
 * pasta atual ou no PATH, onde um notepad.exe falso poderia estar), e o
 * caminho do arquivo como único argumento, sem shell. null se o caminho não
 * é absoluto (um argumento começando com "/" seria opção do Bloco de Notas).
 */
export function comandoBlocoDeNotas(
  caminho: string,
  pastaWindows: string | undefined,
): { arquivo: string; argumentos: string[] } | null {
  if (!path.win32.isAbsolute(caminho) || /^[\\/](?![\\/])/.test(caminho)) {
    return null;
  }
  const raiz =
    pastaWindows && path.win32.isAbsolute(pastaWindows)
      ? pastaWindows
      : 'C:\\Windows';
  return {
    arquivo: path.win32.join(raiz, 'System32', 'notepad.exe'),
    argumentos: [caminho],
  };
}
