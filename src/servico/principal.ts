// Serviço de leitura pesada no processo principal: liga o supervisor
// (src/servico/supervisor.ts) no utilityProcess do Electron e na medição de
// memória do app.getAppMetrics(), avisa a janela que pediu (andamento, fim)
// e recebe o Cancelar dela (canal servico-cancelar, pelo src/ipcSeguro.ts).
//
// O filho é o arquivo servicoPesado.cjs, ao lado do main.cjs no build. Sem
// ele (a entrada do Vite ainda não está no forge.config.mts), o supervisor
// usa a reserva no principal e avisa no log.

import { app, utilityProcess, type WebContents } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tratar } from '../ipcSeguro';
import type { TipoDocumento } from '../fiscal/documentos';
import { LIMITE_MEMORIA_FILHO_MB } from '../xml/limites';
import { lerNfe } from './nfe';
import {
  resultadoValido,
  type EtapaProgresso,
  type Tarefa,
  type TipoTarefa,
} from './protocolo';
import { ServicoPesado, type Desfecho, type ProcessoFilho } from './supervisor';
import { executarTarefa } from './tarefas';

/** Nome do processo no Gerenciador de Tarefas e no app.getAppMetrics() (campo name). */
export const NOME_SERVICO = 'PS Reader: leitura pesada';

/** O arquivo do filho, ao lado do main.cjs. */
const ARQUIVO_FILHO = path.join(__dirname, 'servicoPesado.cjs');

/**
 * Tempo máximo por tarefa. XML genérico: o pior caso medido (95 MB, modo
 * leve) levou 4,7 s; árvore de 19 MB, 2,7 s. NF-e: até 50 MB, menos de
 * 0,1 s de leitura. Planilhas reais: de 15 KB a 1 MB.
 */
const TEMPO_MAXIMO_MS: Record<TipoTarefa, number> = {
  xml: 60_000,
  nfe: 15_000,
  planilha: 60_000,
};

/**
 * Só fora do app empacotado (test:janela, npm start): variáveis para testar
 * o teto de memória e o tempo máximo com arquivos pequenos.
 */
function numeroDoAmbiente(nome: string): number | null {
  if (app.isPackaged) return null;
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export const servico = new ServicoPesado({
  criarFilho: (): ProcessoFilho => {
    if (!existsSync(ARQUIVO_FILHO)) {
      throw new Error(`${path.basename(ARQUIVO_FILHO)} não está no build`);
    }
    return utilityProcess.fork(ARQUIVO_FILHO, [], {
      serviceName: NOME_SERVICO,
      stdio: 'inherit',
    }) as unknown as ProcessoFilho;
  },
  memoriaMB: (pid) => {
    const m = app.getAppMetrics().find((x) => x.pid === pid);
    return m ? m.memory.workingSetSize / 1024 : null;
  },
  reserva: (tarefa, aoEtapa) => executarTarefa(tarefa, aoEtapa),
  validar: resultadoValido,
  limiteMB: () =>
    numeroDoAmbiente('PS_SERVICO_LIMITE_MB') ?? LIMITE_MEMORIA_FILHO_MB,
  tempoMaximoMs: (t) =>
    numeroDoAmbiente('PS_SERVICO_TEMPO_MS') ?? TEMPO_MAXIMO_MS[t.tipo],
  avisar: (m) => console.warn(m),
});

/** Tarefas em andamento por janela: só quem pediu pode cancelar. */
const donos = new Map<number, number>();

export interface AvisoServico {
  id: number;
  /** O que está sendo lido, para o cartão de andamento. */
  rotulo: string;
}

function enviar(wc: WebContents | null, canal: string, dados: unknown): void {
  if (wc && !wc.isDestroyed()) wc.send(canal, dados);
}

/**
 * Executa a tarefa no serviço, com o andamento e o Cancelar na janela `wc`
 * (null: sem janela, como a verificação ao abrir o app).
 */
export async function executarNaJanela(
  wc: WebContents | null,
  tarefa: Tarefa,
  rotulo: string,
): Promise<Desfecho> {
  let id = 0;
  const execucao = servico.executar(tarefa, (etapa: EtapaProgresso) =>
    enviar(wc, 'servico-progresso', { id, rotulo, etapa }),
  );
  id = execucao.id;
  if (wc) donos.set(id, wc.id);
  enviar(wc, 'servico-inicio', { id, rotulo } satisfies AvisoServico);
  try {
    return await execucao.desfecho;
  } finally {
    donos.delete(id);
    enviar(wc, 'servico-fim', { id });
  }
}

/** Planilha de referência lida no serviço. */
export function lerPlanilhaNoServico(
  documento: TipoDocumento,
  dados: Uint8Array,
  wc: WebContents | null,
): Promise<Desfecho> {
  return executarNaJanela(
    wc,
    { tipo: 'planilha', documento, dados },
    'Lendo o documento de referência',
  );
}

/**
 * NF-e: no principal até 5 MB, no serviço acima (src/servico/nfe.ts). Ainda
 * não usada pelo fluxo de abrir NF-e (entra na parte 3).
 */
export function lerNfeNoServico(
  caminho: string,
  wc: WebContents | null,
): Promise<string> {
  return lerNfe(caminho, {
    noServico: (c) =>
      executarNaJanela(wc, { tipo: 'nfe', caminho: c }, 'Lendo a NF-e'),
  });
}

export function registrarServico(): void {
  tratar('servico-cancelar', (event, id: unknown): boolean => {
    if (typeof id !== 'number' || donos.get(id) !== event.sender.id)
      return false;
    return servico.cancelar(id);
  });
  app.on('will-quit', () => servico.encerrar());
}
