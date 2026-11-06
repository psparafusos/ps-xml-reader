// Leitura de NF-e e .psxml do disco no processo principal, com as barreiras
// de src/seguranca/xml.ts: o tamanho é conferido antes de ler (nada passa de
// LIMITE_NFE_BYTES para a memória) e o DOCTYPE antes de o texto ir para a
// janela. O acesso ao disco vem por parâmetro para os testes.

import { readFile, stat } from 'node:fs/promises';
import {
  ArquivoRecusadoError,
  problemaTamanhoNfe,
  verificarXmlSeguro,
} from './xml';

export interface Disco {
  tamanho(caminho: string): Promise<number>;
  ler(caminho: string): Promise<Uint8Array>;
}

const discoReal: Disco = {
  tamanho: async (caminho) => (await stat(caminho)).size,
  ler: (caminho) => readFile(caminho),
};

/**
 * Texto de uma NF-e ou cópia editada, decodificado como UTF-8 (como sempre
 * foi). Lança ArquivoRecusadoError, com a mensagem para a pessoa, se o
 * arquivo é grande demais ou tem DOCTYPE; erros de disco seguem como estão.
 */
export async function lerXmlSeguro(
  caminho: string,
  disco: Disco = discoReal,
): Promise<string> {
  const recusar = (motivo: string | null) => {
    if (motivo) throw new ArquivoRecusadoError(motivo);
  };
  recusar(problemaTamanhoNfe(await disco.tamanho(caminho)));
  const bytes = await disco.ler(caminho);
  // O arquivo pode ter crescido entre o stat e a leitura.
  recusar(problemaTamanhoNfe(bytes.byteLength));
  const texto = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).toString('utf8');
  recusar(verificarXmlSeguro(texto));
  return texto;
}
