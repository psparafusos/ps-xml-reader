// Nome do PDF dos documentos auxiliares que não são o DANFE da NF-e, no
// padrão do app (src/nfe/nome.ts): <FORNECEDOR>_<DOC><número>[-S<série>],
// e o processo principal acrescenta _<TIPO>.pdf. Exemplos:
//   TRANSPORTADORA_CTe4567_DACTE.pdf
//   LOCADORA-INVENTADA_NFSe202600000000321_DANFSe.pdf
//   87654321000198_NF1234_Evento-CCe.pdf
//   MERCADO-INVENTADO_NF456_DANFE-NFCe.pdf
// FORNECEDOR segue a regra da NF-e (nome fantasia, ou as duas primeiras
// palavras significativas da razão social). O XML do evento não traz o nome
// do emitente da nota: o FORNECEDOR do evento é o CNPJ dele (da chave), e o
// número é o da NF-e, para o evento ficar junto dos arquivos da nota.
// Puro, sem DOM e sem Electron.

import { fornecedorNoNome } from '../nfe/nome';

export interface SaidaDocumento {
  /** Nome base, ou null (vale o nome do arquivo aberto). */
  base: string | null;
  /** "_DACTE", "_DANFSe", "_Evento-CCe"... */
  sufixo: string;
}

/** Sufixos que o processo principal aceita. */
export const SUFIXO_DOCUMENTO =
  /^_(?:DANFE-NFCe|DACTE|DANFSe|Evento-[A-Za-z]+|Evento-\d{6})$/;

/** Nome base aceito pelo processo principal (o da NF-e e o dos documentos). */
export const BASE_DOCUMENTO =
  /^[A-Z0-9]+(?:-[A-Z0-9]+)*_(?:NF|CTe|NFSe)\d+(?:-S\d+)?$/;

/** Tipo do evento no nome do arquivo. */
const EVENTO: Record<string, string> = {
  '110110': 'CCe',
  '110111': 'Cancelamento',
  '110112': 'Cancelamento',
  '110140': 'EPEC',
  '210200': 'Confirmacao',
  '210210': 'Ciencia',
  '210220': 'Desconhecimento',
  '210240': 'NaoRealizada',
};

const semZeros = (n: string) => n.replace(/^0+(?=\d)/, '');

/**
 * <FORNECEDOR>_<sigla><número>[-S<série>], ou null sem fornecedor ou sem
 * número. Série 1 (ou vazia) não entra, como na NF-e.
 */
export function baseDocumento(
  fornecedor: string,
  sigla: 'NF' | 'CTe' | 'NFSe',
  numero: string,
  serie = '',
): string | null {
  if (!fornecedor || !/^\d+$/.test(numero)) return null;
  const s = /^\d+$/.test(serie) ? semZeros(serie) : '';
  const base = `${fornecedor}_${sigla}${semZeros(numero)}${s && s !== '1' ? `-S${s}` : ''}`;
  return BASE_DOCUMENTO.test(base) ? base : null;
}

/** DACTE: fornecedor do emitente do CT-e, número e série do CT-e. */
export function saidaDacte(
  xFant: string,
  xNome: string,
  nCT: string,
  serie: string,
): SaidaDocumento {
  return {
    base: baseDocumento(fornecedorNoNome(xFant, xNome), 'CTe', nCT, serie),
    sufixo: '_DACTE',
  };
}

/** DANFSe: fornecedor do prestador e número da NFS-e. */
export function saidaDanfse(
  fantasia: string,
  nome: string,
  numero: string,
): SaidaDocumento {
  return {
    base: baseDocumento(fornecedorNoNome(fantasia, nome), 'NFSe', numero),
    sufixo: '_DANFSe',
  };
}

/** Evento: CNPJ do emitente e número e série da NF-e (da chave). */
export function saidaEvento(
  chave: string,
  tpEvento: string,
  leiauteAntigo: boolean,
): SaidaDocumento {
  const c = chave.replace(/\D/g, '');
  const tipo = leiauteAntigo
    ? 'Cancelamento'
    : (EVENTO[tpEvento] ?? (/^\d{6}$/.test(tpEvento) ? tpEvento : ''));
  return {
    base:
      c.length === 44
        ? baseDocumento(c.slice(6, 20), 'NF', c.slice(25, 34), c.slice(22, 25))
        : null,
    sufixo: tipo ? `_Evento-${tipo}` : '_Evento-Outro',
  };
}
