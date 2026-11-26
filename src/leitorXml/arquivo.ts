// Leitura do arquivo para a tela do leitor genérico de XML, no processo
// principal: stat com prazo (pasta de rede), tamanho conferido antes de ler
// (acima de 100 MB o conteúdo nunca é lido), leitura dos bytes e preparo
// (src/xml/preparar.ts). Também o comando do Bloco de Notas. Sem Electron;
// o acesso ao disco vem por parâmetro para os testes.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  comPrazoDeRede,
  ESPERA_CAMINHO_MS,
  mensagemSemResposta,
} from '../seguranca/arquivo';
import { avaliarTamanho, LIMITE_TEXTO_BYTES } from '../xml/limites';
import { filhosDe, nomeDe, NENHUM, TIPOS } from '../xml/arvore';
import type { LeituraXml } from '../xml/leitor';
import { prepararLeitura, type EtapaPreparo } from '../xml/preparar';
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

const ELEMENTO = TIPOS.indexOf('elemento');

/**
 * Trecho do texto com o XML original guardado numa cópia editada (.psxml):
 * o primeiro elemento dentro de <original>, na raiz <psCopiaEditada>. null se
 * o texto não tem esse formato (ou a árvore não foi montada).
 */
export function trechoDoOriginal(
  texto: string,
  arvore: LeituraXml | null,
): string | null {
  if (!arvore) return null;
  const elementos = (no: number) =>
    filhosDe(arvore, no).filter((f) => arvore.tipo[f] === ELEMENTO);
  const raiz = elementos(NENHUM)[0];
  if (raiz === undefined || nomeDe(arvore, raiz) !== 'psCopiaEditada')
    return null;
  const original = elementos(raiz).find(
    (f) => nomeDe(arvore, f) === 'original',
  );
  if (original === undefined) return null;
  const nota = elementos(original)[0];
  if (nota === undefined) return null;
  return texto.slice(arvore.inicio[nota], arvore.fim[nota]);
}

/**
 * Lê e prepara o arquivo; nunca lança por causa do arquivo. `original`: o
 * arquivo é uma cópia editada (.psxml) e a tela quer o XML original de
 * dentro dela (se não achar, mostra o arquivo inteiro).
 */
export async function lerParaLeitor(
  caminho: string,
  disco: DiscoLeitor = discoReal,
  prazo = ESPERA_CAMINHO_MS,
  aoEtapa: (etapa: EtapaPreparo | 'lendo') => void = () => {},
  original = false,
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
    tamanho = await comPrazoDeRede(
      caminho,
      disco.tamanho(caminho),
      prazo,
      ESGOTOU,
    );
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
    aoEtapa('lendo');
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

  let preparo = prepararLeitura(bytes, aoEtapa);
  if (!preparo.ok) return recusa(preparo.motivo, preparo.mensagem);
  const trecho = original
    ? trechoDoOriginal(preparo.texto, preparo.arvore)
    : null;
  if (trecho !== null) {
    const doOriginal = new TextEncoder().encode(trecho);
    arquivo.tamanho = doOriginal.byteLength;
    preparo = prepararLeitura(doOriginal, aoEtapa);
    if (!preparo.ok) return recusa(preparo.motivo, preparo.mensagem);
  }
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
