/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

type ResultadoSalvarPdf =
  | { status: 'salvo'; caminho: string }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

interface PsApi {
  /** Abre o diálogo de arquivo (.xml) e devolve o texto, ou null se cancelado. */
  abrirXml(): Promise<string | null>;
  /** Gera o PDF da janela atual e abre o diálogo de salvar. */
  salvarPdf(nomeSugerido: string): Promise<ResultadoSalvarPdf>;
}

interface Window {
  psApi: PsApi;
}
