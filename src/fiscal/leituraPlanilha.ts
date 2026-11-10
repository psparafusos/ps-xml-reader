// Leitura de um documento de referência (planilha de ST de Sergipe, Apêndice
// XIV, TIPI) sem gravar nada: o que o arquivo parece, o relatório da leitura,
// os segmentos não lidos e o documento pronto para gravar. Era o lerSemGravar
// de src/documentos.ts; aqui é puro (sem Electron, sem disco) e o resultado
// só tem dados simples, para rodar no serviço de leitura pesada
// (utilityProcess) e voltar para o processo principal, que grava.

import {
  leituraCombustiveis,
  leituraST,
  leituraTipi,
  reconhecerArquivo,
  segmentosIncompletosST,
  type LeituraDocumento,
  type Reconhecido,
} from '../leituraDocumentos';
import { prepararDocumento, type DocumentoPreparado } from './base';
import { lerCombustiveis } from './combustiveis';
import {
  ErroFormato,
  MENSAGEM_SEM_APENDICE,
  mvasLidasCombustiveis,
  type TipoDocumento,
} from './documentos';
import { lerTabelaST } from './st';
import { lerTipi, lerTipiPlanilha } from './tipi';
import { lerXlsx, type Aba } from './xlsx';
import { LimiteExcedido } from './zip';

export interface LeituraPlanilha {
  reconhecido: Reconhecido;
  /** Relatório da leitura (arquivo e data vazios: quem grava preenche). */
  relatorio: LeituraDocumento | null;
  segmentosIncompletos: string[];
  /** Recusa com motivo próprio do leitor (combustíveis de outra UF, por exemplo). */
  erroFormato?: string;
  /** Pronto para gravar; null quando a leitura não passou. */
  preparado: DocumentoPreparado | null;
  /**
   * Falha ao preparar: 'formato' (ErroFormato, recusa como arquivo errado)
   * ou a mensagem de outro erro.
   */
  erroPreparo: 'formato' | { mensagem: string } | null;
}

type Leitura = Omit<LeituraPlanilha, 'preparado' | 'erroPreparo'>;

const nada = (reconhecido: Reconhecido): Leitura => ({
  reconhecido,
  relatorio: null,
  segmentosIncompletos: [],
});

/** O que o arquivo parece e o relatório da leitura. */
function ler(tipo: TipoDocumento, dados: Uint8Array): Leitura {
  const ehZip = dados.length > 4 && dados[0] === 0x50 && dados[1] === 0x4b;
  let abas: Aba[] | null = null;
  if (ehZip) {
    try {
      abas = lerXlsx(dados);
    } catch (erro) {
      // Passou de um limite (bomba de descompactação, célula fora do Excel):
      // recusa com o motivo, sem tentar ler de outro jeito.
      if (erro instanceof LimiteExcedido)
        return { ...nada('planilha'), erroFormato: erro.message };
      abas = null;
    }
  }
  const reconhecido = reconhecerArquivo(dados, abas);
  if (tipo === 'combustiveis') {
    if (!abas) return nada(reconhecido);
    try {
      const c = lerCombustiveis(abas);
      if (mvasLidasCombustiveis(c) === 0) return nada(reconhecido);
      return {
        reconhecido,
        relatorio: leituraCombustiveis(c.relatorio, '', ''),
        segmentosIncompletos: [],
      };
    } catch (erro) {
      // Achou o Apêndice XIV, mas a planilha não serve (outra UF, sem os
      // grupos): a mensagem do leitor diz o porquê.
      const motivo =
        erro instanceof ErroFormato && erro.message !== MENSAGEM_SEM_APENDICE
          ? erro.message
          : undefined;
      return motivo
        ? { ...nada(reconhecido), erroFormato: motivo }
        : nada(reconhecido);
    }
  }
  if (tipo === 'st') {
    if (!abas) return nada(reconhecido);
    const st = lerTabelaST(abas);
    if (st.linhas.length === 0) return nada(reconhecido);
    return {
      reconhecido,
      relatorio: leituraST(st.relatorio, '', ''),
      segmentosIncompletos: segmentosIncompletosST(st.relatorio),
    };
  }
  try {
    const tipi = abas
      ? lerTipiPlanilha(abas)
      : lerTipi(new TextDecoder().decode(dados));
    if (tipi.relatorio.totalNcm === 0) return nada(reconhecido);
    return {
      reconhecido,
      relatorio: leituraTipi(tipi.relatorio, '', ''),
      segmentosIncompletos: [],
    };
  } catch {
    return nada(reconhecido);
  }
}

/**
 * Lê a planilha e, se a leitura passou, já deixa o documento pronto para
 * gravar. Nunca lança por causa do arquivo.
 */
export function lerPlanilha(
  tipo: TipoDocumento,
  dados: Uint8Array,
): LeituraPlanilha {
  let leitura: Leitura;
  try {
    leitura = ler(tipo, dados);
  } catch (erro) {
    console.error(erro);
    leitura = nada('texto');
  }
  if (!leitura.relatorio || leitura.erroFormato) {
    return { ...leitura, preparado: null, erroPreparo: null };
  }
  try {
    return {
      ...leitura,
      preparado: prepararDocumento(tipo, dados),
      erroPreparo: null,
    };
  } catch (erro) {
    return {
      ...leitura,
      preparado: null,
      erroPreparo:
        erro instanceof ErroFormato
          ? 'formato'
          : { mensagem: erro instanceof Error ? erro.message : String(erro) },
    };
  }
}
