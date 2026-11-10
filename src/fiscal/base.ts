// Base fiscal normalizada para usar em tempo de execução: a planilha de ST
// de Sergipe e a TIPI, cada uma importada separadamente pela pessoa, lidas
// uma vez e gravadas em JSON numa pasta (no app, a pasta de dados). A
// análise (fiscal/analise.ts) carrega daí, sem reler o .xlsx nem o texto
// da TIPI a cada nota.
//
// Arquivos na pasta, por documento:
//   st-info.json    metadados (fiscal/documentos.ts: versão, vigência,
//   tipi-info.json  data da importação, quantidades, pontos não entendidos)
//   st.json         linhas da planilha de ST (uma por NCM)
//   tipi.json       registros da TIPI (um por NCM de 8 dígitos)
//   combustiveis.json      MVAs do Apêndice XIV (lubrificantes), opcional
//   combustiveis-info.json metadados do Apêndice XIV
//   st-leitura.json segmentos da planilha de ST lidos com problemas
//                   (LeituraST; gravado por quem importa, opcional)
//
// A importação valida antes de trocar: arquivo em formato não reconhecido
// lança ErroFormato e o documento anterior fica como estava. A TIPI pode vir
// do tipi.xlsx oficial ou do texto extraído do PDF.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  lerCombustiveis,
  tabelaCombustiveisValida,
  type TabelaCombustiveis,
} from './combustiveis';
import {
  ErroFormato,
  resumoCombustiveis,
  resumoST,
  resumoTipi,
  validarInfoDocumento,
  type InfoDocumento,
  type ServidorDocumento,
  type TipoDocumento,
} from './documentos';
import { lerTabelaST, type LinhaST, type TabelaST } from './st';
import {
  lerTipi,
  lerTipiPlanilha,
  type NcmTipi,
  type RelatorioTipi,
  type TabelaTipi,
} from './tipi';
import { lerXlsx } from './xlsx';

export const FORMATO_BASE = 2;
const arqInfo = (tipo: TipoDocumento) => `${tipo}-info.json`;
const arqDados = (tipo: TipoDocumento) => `${tipo}.json`;

export interface BaseFiscal {
  st: TabelaST | null;
  tipi: TabelaTipi | null;
  /** Apêndice XIV (lubrificantes); opcional: sem ele, nada muda na análise. */
  combustiveis: TabelaCombustiveis | null;
  info: Documentos;
  /** Do st-leitura.json; vazio quando o arquivo não existe. Vai para a análise. */
  segmentosIncompletos: string[];
}

/** Conteúdo do st-leitura.json. */
export interface LeituraST {
  /** Nome da aba de cada segmento lido com problemas ("Autopecas"). */
  segmentosIncompletos: string[];
}

export const ARQUIVO_LEITURA_ST = 'st-leitura.json';

export interface Documentos {
  st: InfoDocumento | null;
  tipi: InfoDocumento | null;
  combustiveis: InfoDocumento | null;
}

/** .xlsx é um zip: começa com "PK". */
const ehZip = (d: Uint8Array) => d.length > 4 && d[0] === 0x50 && d[1] === 0x4b;

function abasXlsx(dados: Uint8Array) {
  try {
    return lerXlsx(dados);
  } catch (erro) {
    throw new ErroFormato(
      `O arquivo não pôde ser lido como planilha .xlsx (${erro instanceof Error ? erro.message : String(erro)}).`,
    );
  }
}

/**
 * Documento lido e validado, pronto para gravar: o que vai para o
 * <tipo>.json e o resumo que entra no <tipo>-info.json. Só dados simples:
 * passa do serviço de leitura pesada (utilityProcess) para o principal.
 */
export interface DocumentoPreparado {
  tipo: TipoDocumento;
  tipoArquivo: 'xlsx' | 'txt';
  tamanhoArquivo: number;
  resumo: ReturnType<typeof resumoST>;
  gravar: unknown;
}

/**
 * Lê e valida o arquivo, sem gravar nada (puro: roda no serviço de leitura
 * pesada). Formato não reconhecido lança ErroFormato.
 */
export function prepararDocumento(
  tipo: TipoDocumento,
  dados: Uint8Array,
): DocumentoPreparado {
  let gravar: unknown;
  let resumo;
  let tipoArquivo: 'xlsx' | 'txt';
  if (tipo === 'st') {
    if (!ehZip(dados))
      throw new ErroFormato(
        'A planilha de ST precisa ser o arquivo .xlsx do Portal Nacional da Substituição Tributária.',
      );
    tipoArquivo = 'xlsx';
    const st = lerTabelaST(abasXlsx(dados));
    resumo = resumoST(st);
    gravar = { relatorio: st.relatorio, linhas: st.linhas };
  } else if (tipo === 'combustiveis') {
    if (!ehZip(dados))
      throw new ErroFormato(
        'A planilha de combustíveis precisa ser o arquivo .xlsx do CONFAZ (Ato COTEPE/ICMS 61/19).',
      );
    tipoArquivo = 'xlsx';
    const c = lerCombustiveis(abasXlsx(dados));
    resumo = resumoCombustiveis(c);
    gravar = c;
  } else {
    let tipi: TabelaTipi;
    if (ehZip(dados)) {
      tipoArquivo = 'xlsx';
      try {
        tipi = lerTipiPlanilha(abasXlsx(dados));
      } catch (erro) {
        if (erro instanceof ErroFormato) throw erro;
        throw new ErroFormato(
          `Não parece a TIPI: ${erro instanceof Error ? erro.message : String(erro)}.`,
        );
      }
    } else {
      tipoArquivo = 'txt';
      tipi = lerTipi(Buffer.from(dados).toString('utf8'));
    }
    resumo = resumoTipi(tipi, tipoArquivo);
    gravar = { relatorio: tipi.relatorio, ncms: [...tipi.porNcm.values()] };
  }
  return { tipo, tipoArquivo, tamanhoArquivo: dados.length, resumo, gravar };
}

/**
 * Lê e valida o arquivo e, se for reconhecido, grava em `pasta` no lugar do
 * documento anterior. `servidor`: o arquivo veio da verificação online.
 */
export function importarDocumento(
  tipo: TipoDocumento,
  dados: Uint8Array,
  nomeArquivo: string,
  pasta: string,
  agora: Date = new Date(),
  servidor: ServidorDocumento | null = null,
): InfoDocumento {
  return gravarDocumento(
    prepararDocumento(tipo, dados),
    nomeArquivo,
    pasta,
    agora,
    servidor,
  );
}

/** Grava um documento já preparado em `pasta`, no lugar do anterior. */
export function gravarDocumento(
  preparado: DocumentoPreparado,
  nomeArquivo: string,
  pasta: string,
  agora: Date = new Date(),
  servidor: ServidorDocumento | null = null,
): InfoDocumento {
  const { tipo, tipoArquivo, tamanhoArquivo, resumo, gravar } = preparado;
  const info: InfoDocumento = {
    formato: FORMATO_BASE,
    tipo,
    arquivo: nomeArquivo,
    tipoArquivo,
    tamanhoArquivo,
    importadoEm: agora.toISOString(),
    ...resumo,
    servidor,
  };
  mkdirSync(pasta, { recursive: true });
  // Grava ao lado e só então troca. A info vai por último: se a gravação
  // parar no meio, fica a info anterior.
  const temp = (arq: string) => join(pasta, `${arq}.novo`);
  writeFileSync(temp(arqDados(tipo)), JSON.stringify(gravar));
  writeFileSync(temp(arqInfo(tipo)), JSON.stringify(info, null, 2));
  renameSync(temp(arqDados(tipo)), join(pasta, arqDados(tipo)));
  renameSync(temp(arqInfo(tipo)), join(pasta, arqInfo(tipo)));
  return info;
}

/**
 * Atualização (arquivo baixado): importa primeiro numa pasta temporária,
 * dentro de `pasta`, com o mesmo importarDocumento. Só se a leitura passar
 * os arquivos vão para `pasta`, no lugar do documento carregado; formato não
 * reconhecido (ErroFormato) ou qualquer outra falha deixa o anterior como
 * estava. A pasta temporária é apagada nos dois casos.
 */
export function importarSeLeituraPassar(
  tipo: TipoDocumento,
  dados: Uint8Array,
  nomeArquivo: string,
  pasta: string,
  agora: Date = new Date(),
  servidor: ServidorDocumento | null = null,
): InfoDocumento {
  return gravarSeLeituraPassar(
    prepararDocumento(tipo, dados),
    nomeArquivo,
    pasta,
    agora,
    servidor,
  );
}

/** importarSeLeituraPassar com o documento já preparado. */
export function gravarSeLeituraPassar(
  preparado: DocumentoPreparado,
  nomeArquivo: string,
  pasta: string,
  agora: Date = new Date(),
  servidor: ServidorDocumento | null = null,
): InfoDocumento {
  const tipo = preparado.tipo;
  mkdirSync(pasta, { recursive: true });
  const temp = mkdtempSync(join(pasta, '.atualizar-'));
  try {
    const info = gravarDocumento(preparado, nomeArquivo, temp, agora, servidor);
    // Dados primeiro e a info por último, como em importarDocumento.
    renameSync(join(temp, arqDados(tipo)), join(pasta, arqDados(tipo)));
    renameSync(join(temp, arqInfo(tipo)), join(pasta, arqInfo(tipo)));
    return info;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** Tira o documento da base (volta a "faltando"). */
export function removerDocumento(tipo: TipoDocumento, pasta: string): void {
  rmSync(join(pasta, arqInfo(tipo)), { force: true });
  rmSync(join(pasta, arqDados(tipo)), { force: true });
  if (tipo === 'st') rmSync(join(pasta, ARQUIVO_LEITURA_ST), { force: true });
}

function lerJson(pasta: string, arq: string): unknown {
  return JSON.parse(readFileSync(join(pasta, arq), 'utf8'));
}

/**
 * Metadados de um documento; null se não foi importado, está em outro
 * formato ou tem algum campo inválido (validarInfoDocumento).
 */
export function lerInfoDocumento(
  tipo: TipoDocumento,
  pasta: string,
): InfoDocumento | null {
  try {
    return validarInfoDocumento(
      lerJson(pasta, arqInfo(tipo)),
      tipo,
      FORMATO_BASE,
    );
  } catch {
    return null;
  }
}

/** Só os metadados (rápido): para a área de documentos e o rodapé do painel. */
export function lerDocumentos(pasta: string): Documentos {
  return {
    st: lerInfoDocumento('st', pasta),
    tipi: lerInfoDocumento('tipi', pasta),
    combustiveis: lerInfoDocumento('combustiveis', pasta),
  };
}

/**
 * Segmentos lidos com problemas, do st-leitura.json da pasta. Arquivo
 * ausente, ilegível ou sem a lista = nenhum.
 */
export function lerSegmentosIncompletos(pasta: string): string[] {
  let d: unknown;
  try {
    d = lerJson(pasta, ARQUIVO_LEITURA_ST);
  } catch {
    return [];
  }
  const lista = (d as Partial<LeituraST> | null)?.segmentosIncompletos;
  return Array.isArray(lista)
    ? lista.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : [];
}

/** Carrega o que houver na pasta; documento que falta (ou ilegível) vem null. */
export function carregarBaseFiscal(pasta: string): BaseFiscal {
  const info = lerDocumentos(pasta);
  let st: TabelaST | null = null;
  let tipi: TabelaTipi | null = null;
  let combustiveis: TabelaCombustiveis | null = null;
  if (info.combustiveis) {
    try {
      const lido = lerJson(pasta, arqDados('combustiveis'));
      // Gravado pelo leitor antigo (por linhas): não serve, carregar de novo.
      if (tabelaCombustiveisValida(lido)) combustiveis = lido;
      else info.combustiveis = null;
    } catch {
      info.combustiveis = null;
    }
  }
  if (info.st) {
    try {
      st = lerJson(pasta, arqDados('st')) as {
        relatorio: TabelaST['relatorio'];
        linhas: LinhaST[];
      };
    } catch {
      info.st = null;
    }
  }
  if (info.tipi) {
    try {
      const d = lerJson(pasta, arqDados('tipi')) as {
        relatorio: RelatorioTipi;
        ncms: NcmTipi[];
      };
      tipi = {
        porNcm: new Map(d.ncms.map((n) => [n.ncm, n])),
        relatorio: d.relatorio,
      };
    } catch {
      info.tipi = null;
    }
  }
  return {
    st,
    tipi,
    combustiveis,
    info,
    segmentosIncompletos: st ? lerSegmentosIncompletos(pasta) : [],
  };
}
