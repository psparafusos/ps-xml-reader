// Leitura de NF-e com o serviço de leitura pesada (parte 2). Até
// LIMITE_NFE_NO_PRINCIPAL a NF-e é lida como sempre, no processo principal
// (lerXmlSeguro); acima disso, no utilityProcess, com tempo e memória
// vigiados. O resultado e as recusas são os mesmos de lerXmlSeguro: texto,
// ou ArquivoRecusadoError com a mensagem para a pessoa.
//
// Medido em 10/11/2026 (Electron 44, NF-e inventadas): lerXmlSeguro no
// principal leva 5 ms com 1 MB, 16 ms com 5 MB, 33 ms com 10 MB e 61 ms com
// 20 MB; subir o filho custa de 40 a 80 ms. Uma nota real fica abaixo de
// 5 MB: até aí o principal é mais rápido e não vale subir processo.
//
// Ligado no fluxo de abrir NF-e (main.ts, decidirAbertura e
// lerArquivoNaJanela) pela lerNfeNoServico de ./principal.ts.

import { stat } from 'node:fs/promises';
import {
  comLimite,
  ESPERA_CAMINHO_MS,
  lerXmlSeguro,
} from '../seguranca/arquivo';
import { ArquivoRecusadoError } from '../seguranca/xml';
import type { ResultadoNfe } from './protocolo';
import { mensagemDoDesfecho, type Desfecho } from './supervisor';

/** Até este tamanho a NF-e é lida no processo principal. */
export const LIMITE_NFE_NO_PRINCIPAL = 5 * 1024 * 1024;

export interface DependenciasNfe {
  /** Lê no serviço (filho, ou a reserva se ele não subiu). */
  noServico(caminho: string): Promise<Desfecho>;
  /** Tamanho do arquivo (stat). */
  tamanho?(caminho: string): Promise<number>;
  /** A leitura de sempre (no principal). */
  lerAqui?(caminho: string): Promise<string>;
}

/** Texto da NF-e, ou ArquivoRecusadoError, como lerXmlSeguro. */
export async function lerNfe(
  caminho: string,
  d: DependenciasNfe,
): Promise<string> {
  const lerAqui = d.lerAqui ?? ((c: string) => lerXmlSeguro(c));
  const tamanho = d.tamanho ?? (async (c: string) => (await stat(c)).size);
  // Sem resposta a tempo, ou erro: a leitura de sempre dá a mensagem certa
  // (pasta de rede, em uso, não encontrado).
  const bytes = await comLimite(
    tamanho(caminho).catch(() => null),
    ESPERA_CAMINHO_MS,
    null,
  );
  if (bytes === null || bytes <= LIMITE_NFE_NO_PRINCIPAL)
    return lerAqui(caminho);
  const desfecho = await d.noServico(caminho);
  if (desfecho.status !== 'ok') {
    throw new ArquivoRecusadoError(mensagemDoDesfecho(desfecho));
  }
  const r = desfecho.resultado as ResultadoNfe;
  if (!r.ok) throw new ArquivoRecusadoError(r.mensagem);
  return r.texto;
}
