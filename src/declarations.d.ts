/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface ArquivoAberto {
  /** Nome do arquivo, com extensão. */
  nome: string;
  texto: string;
}

type ResultadoSalvar =
  | { status: 'salvo'; pdf: string; copia: string }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

type ResultadoImprimir =
  | { status: 'impresso' }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

interface PsApi {
  /** Abre o diálogo de arquivo (.xml ou .psxml), ou null se cancelado. */
  abrirArquivo(): Promise<ArquivoAberto | null>;
  /** Lê um arquivo solto na janela (arrastar e soltar). */
  abrirSolto(arquivo: File): Promise<ArquivoAberto>;
  /** Pasta de destino salva na configuração, ou null. */
  pastaDestino(): Promise<string | null>;
  /** Abre o diálogo de pasta e salva a escolha. null se cancelado. */
  escolherPasta(): Promise<string | null>;
  /** Grava <base>-ps.pdf (da tela atual) e <base>-ps.psxml na pasta de destino. */
  salvar(textoCopia: string): Promise<ResultadoSalvar>;
  /** Abre o diálogo de impressão do Windows com a tela atual. */
  imprimir(): Promise<ResultadoImprimir>;
}

interface Window {
  psApi: PsApi;
}
