// Base fiscal normalizada para usar em tempo de execução: a planilha de ST
// de Sergipe e a TIPI, lidas dos arquivos de origem uma vez e gravadas em
// JSON numa pasta. A análise (fiscal/analise.ts) carrega daí, sem reler o
// .xlsx nem o texto da TIPI a cada nota.
//
// Arquivos na pasta:
//   base-fiscal.json  versão do formato, data de geração, origens e relatórios
//   st.json           linhas da planilha de ST (uma por NCM)
//   tipi.json         registros da TIPI (um por NCM de 8 dígitos)
//
// A TIPI de origem é o texto extraído do PDF oficial (fiscal/tipi.ts).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { BaseAnalise } from './analise';
import {
  lerTabelaST,
  type LinhaST,
  type RelatorioST,
  type TabelaST,
} from './st';
import {
  lerTipi,
  type NcmTipi,
  type RelatorioTipi,
  type TabelaTipi,
} from './tipi';
import { lerXlsx } from './xlsx';

export const FORMATO_BASE = 1;
const ARQ_INFO = 'base-fiscal.json';
const ARQ_ST = 'st.json';
const ARQ_TIPI = 'tipi.json';

export interface InfoBase {
  formato: number;
  /** ISO 8601. */
  geradaEm: string;
  origemST: string;
  origemTipi: string;
  relatorioST: RelatorioST;
  relatorioTipi: RelatorioTipi;
}

export interface BaseFiscal extends BaseAnalise {
  st: TabelaST;
  tipi: TabelaTipi;
  info: InfoBase;
}

export interface OrigensBase {
  /** Caminho do .xlsx do Portal ST de Sergipe. */
  planilhaST: string;
  /** Caminho do texto extraído do PDF da TIPI. */
  textoTipi: string;
}

/** Lê os arquivos de origem, normaliza e grava a base em `pasta`. */
export function gerarBaseFiscal(
  origens: OrigensBase,
  pasta: string,
  agora: Date = new Date(),
): BaseFiscal {
  const st = lerTabelaST(
    lerXlsx(new Uint8Array(readFileSync(origens.planilhaST))),
  );
  const tipi = lerTipi(readFileSync(origens.textoTipi, 'utf8'));
  const info: InfoBase = {
    formato: FORMATO_BASE,
    geradaEm: agora.toISOString(),
    origemST: basename(origens.planilhaST),
    origemTipi: basename(origens.textoTipi),
    relatorioST: st.relatorio,
    relatorioTipi: tipi.relatorio,
  };
  mkdirSync(pasta, { recursive: true });
  // A info vai por último: se a gravação parar no meio, a base não carrega.
  writeFileSync(join(pasta, ARQ_ST), JSON.stringify(st.linhas));
  writeFileSync(
    join(pasta, ARQ_TIPI),
    JSON.stringify([...tipi.porNcm.values()]),
  );
  writeFileSync(join(pasta, ARQ_INFO), JSON.stringify(info, null, 2));
  return { st, tipi, info };
}

/** Carrega a base gravada por gerarBaseFiscal. Lança erro se faltar arquivo ou o formato for outro. */
export function carregarBaseFiscal(pasta: string): BaseFiscal {
  const ler = (arq: string): unknown =>
    JSON.parse(readFileSync(join(pasta, arq), 'utf8'));
  const info = ler(ARQ_INFO) as InfoBase;
  if (info.formato !== FORMATO_BASE) {
    throw new Error(
      `base fiscal no formato ${info.formato}; esperado ${FORMATO_BASE}: gere de novo`,
    );
  }
  const linhas = ler(ARQ_ST) as LinhaST[];
  const ncms = ler(ARQ_TIPI) as NcmTipi[];
  return {
    st: { linhas, relatorio: info.relatorioST },
    tipi: {
      porNcm: new Map(ncms.map((n) => [n.ncm, n])),
      relatorio: info.relatorioTipi,
    },
    info,
  };
}
