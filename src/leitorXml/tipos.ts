// Tipos trocados entre o processo principal e a tela do leitor genérico de
// XML (canais leitor-xml-*, registrados em src/leitorXml/principal.ts e
// expostos pelo bloco do leitor em src/preload.ts). Só tipos.

import type { LeituraPreparada } from '../xml/preparar';

export interface InfoArquivo {
  nome: string;
  /** Caminho completo, só para mostrar (o principal guarda o seu). */
  caminho: string;
  /** Bytes, do stat; null se o arquivo não respondeu. */
  tamanho: number | null;
}

export type MotivoRecusa =
  | 'grande'
  | 'binario'
  | 'vazio'
  | 'em-uso'
  | 'sem-resposta'
  | 'nao-encontrado'
  | 'cancelado'
  | 'erro';

/** A leitura sem o texto (o texto vem à parte, em leitor-xml-texto). */
export type LeituraSemTexto = Omit<LeituraPreparada, 'texto' | 'ok'>;

export type ResultadoLeitorXml =
  | { status: 'sem-arquivo' }
  | {
      status: 'recusado';
      arquivo: InfoArquivo;
      motivo: MotivoRecusa;
      mensagem: string;
    }
  | { status: 'ok'; arquivo: InfoArquivo; leitura: LeituraSemTexto };

export type ResultadoBlocoDeNotas =
  | { ok: true }
  | { ok: false; mensagem: string };

/** O que a janela pode pedir (window.psLeitorXml). */
export interface PsLeitorXmlApi {
  /** Lê o arquivo guardado pelo principal para esta janela. */
  carregar(): Promise<ResultadoLeitorXml>;
  /** O texto da última leitura (pedido à parte por causa do tamanho). */
  texto(): Promise<string | null>;
  /** Abre o arquivo desta janela no Bloco de Notas do Windows. */
  abrirNoBlocoDeNotas(): Promise<ResultadoBlocoDeNotas>;
  /** A tela fechou: o principal esquece o arquivo desta janela. */
  fechar(): Promise<void>;
  /** O principal mandou mostrar a tela (um XML que não é NF-e foi aberto). */
  aoMostrar(callback: () => void): void;
}
