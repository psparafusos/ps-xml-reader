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

type ResultadoSalvarDanfe =
  | { status: 'salvo'; pdf: string }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

type ModoImpressao = 'conferencia' | 'danfe';

type ResultadoImprimir =
  | { status: 'impresso' }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

type RespostaAlteracoes = 'salvar' | 'descartar' | 'cancelar';

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
  /** Grava só <base>-danfe.pdf (da tela atual, A4 sem margem) na pasta de destino. */
  salvarDanfe(): Promise<ResultadoSalvarDanfe>;
  /** Abre o diálogo de impressão do Windows com a tela atual. */
  imprimir(modo: ModoImpressao): Promise<ResultadoImprimir>;
  /** Avisa o processo principal se há anotações alteradas e não salvas. */
  informarPendentes(pendentes: boolean): void;
  /** Pergunta Salvar, Descartar ou Cancelar sobre as anotações não salvas. */
  perguntarAlteracoes(): Promise<RespostaAlteracoes>;
  /** Chamado quando o usuário tenta fechar a janela com anotações pendentes. */
  aoPedirFechar(callback: () => void): void;
  /** Fecha a janela sem nova pergunta (depois de salvar ou descartar). */
  fecharJanela(): Promise<void>;
}

interface Window {
  psApi: PsApi;
}
