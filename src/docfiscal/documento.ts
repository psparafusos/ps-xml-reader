// O modo Documento da aba XML para os documentos fiscais que não abrem pela
// tela da nota (CT-e, NFS-e, evento da NF-e): lê o texto com as mesmas
// barreiras da NF-e (src/seguranca/xml.ts), identifica o tipo
// (./tipo.ts) e devolve quem monta o documento auxiliar. A NF-e e a NFC-e
// seguem pela tela da nota (renderer.ts).

import { ArquivoRecusadoError } from '../seguranca/xml';
import { lerDocumento } from '../nfe/parser';
import {
  identificar,
  MOTIVO_DESCONHECIDO,
  NOME_AUXILIAR,
  type ElementoXml,
  type TipoDocumento,
} from './tipo';

/** O que a tela mostra do documento antes de montar (título e cartão Arquivo). */
export interface ResumoDocumento {
  /** Quem emitiu (negrito no título da janela). */
  emitente: string;
  /** "CT-e nº 123 série 1", "NFS-e nº 45"... */
  titulo: string;
  /** Data e hora da emissão como no XML ('' se não há). */
  emissao: string;
  /** Versão do leiaute ('' se não há). */
  versao: string;
}

export interface DocumentoMontavel {
  tipo: TipoDocumento;
  /** DANFSe, DACTE, Evento... */
  nomeAuxiliar: string;
  resumo: ResumoDocumento;
  /**
   * Monta em `container` (visível, para as medições) e devolve o total de
   * folhas.
   */
  montar(container: HTMLElement): number;
}

/** Lê os elementos identificados e prepara a montagem. */
export type Montador = (
  elementos: ElementoXml[],
) => Omit<DocumentoMontavel, 'tipo' | 'nomeAuxiliar'>;

const montadores: Partial<Record<TipoDocumento, Montador>> = {};

/** Liga o montador de um tipo (cada documento auxiliar se registra). */
export function registrarMontador(tipo: TipoDocumento, m: Montador): void {
  montadores[tipo] = m;
}

/** Documento pronto para montar, ou o motivo de não mostrar no modo Documento. */
export function prepararDocumento(
  texto: string,
):
  | { documento: DocumentoMontavel; motivo: null }
  | { documento: null; motivo: string } {
  let raiz: Element;
  try {
    raiz = lerDocumento(texto).documentElement;
  } catch (erro) {
    return {
      documento: null,
      motivo:
        erro instanceof ArquivoRecusadoError
          ? erro.message
          : MOTIVO_DESCONHECIDO,
    };
  }
  const id = identificar(raiz);
  if (id.tipo === null) return { documento: null, motivo: id.motivo };
  const montador = montadores[id.tipo];
  if (!montador)
    return {
      documento: null,
      motivo: `O PS Reader ainda não monta o ${NOME_AUXILIAR[id.tipo]} deste arquivo. Veja o arquivo no Formato original.`,
    };
  try {
    return {
      documento: {
        tipo: id.tipo,
        nomeAuxiliar: NOME_AUXILIAR[id.tipo],
        ...montador(id.elementos),
      },
      motivo: null,
    };
  } catch (erro) {
    console.error(erro);
    return {
      documento: null,
      motivo: `Não foi possível montar o ${NOME_AUXILIAR[id.tipo]} deste arquivo.`,
    };
  }
}
