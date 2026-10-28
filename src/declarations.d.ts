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

/**
 * Arquivo pedido de fora (duplo clique). `pastaSessao`: a pasta do .psxml
 * aberto assim, que passou a ser a pasta de destino só desta sessão; null se
 * esta abertura não mudou a pasta.
 */
type ArquivoExterno = ArquivoAberto & { pastaSessao: string | null };

/**
 * Pasta onde o Salvar grava. `sessao`: true se é a pasta de um .psxml aberto
 * por duplo clique, que vale só até o app fechar e não fica salva.
 */
interface PastaDestino {
  caminho: string | null;
  sessao: boolean;
}

type ResultadoAbrirPasta =
  | { status: 'aberta' }
  | { status: 'erro'; mensagem: string };

type ModoImpressao = 'conferencia' | 'danfe';

type ResultadoImprimir =
  | { status: 'impresso' }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

type RespostaAlteracoes = 'salvar' | 'descartar' | 'cancelar';

/** Texto do aviso de sucesso de uma cópia. */
type AvisoCopia = 'Copiado' | 'Chave copiada' | 'Recortado';

/** Item extra do menu do botão direito: copia `texto` e mostra `aviso`. */
interface ItemMenuCopia {
  rotulo: string;
  texto: string;
  aviso: AvisoCopia;
}

/**
 * Pedido à área de transferência (escrita feita pelo processo principal):
 * copiar um texto direto, ou mostrar o menu do botão direito.
 */
type PedidoAreaTransferencia =
  | { tipo: 'copiar'; texto: string; aviso: AvisoCopia }
  | {
      tipo: 'menu';
      editavel: boolean;
      selecao: string;
      itens: ItemMenuCopia[];
    };

type ResultadoAreaTransferencia =
  | { status: 'copiado'; aviso: AvisoCopia }
  | { status: 'nada' };

/** Personalização da conferência (src/nfe/config.ts). */
type ConfigConferencia = import('./nfe/config').ConfigConferencia;

type ResultadoConfig =
  | { status: 'ok'; config: ConfigConferencia }
  | { status: 'erro'; mensagem: string };

type ResultadoExportarConfig =
  | { status: 'exportado'; caminho: string }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

interface PsApi {
  /** Abre o diálogo de arquivo (.xml ou .psxml), ou null se cancelado. */
  abrirArquivo(): Promise<ArquivoAberto | null>;
  /** Lê um arquivo solto na janela (arrastar e soltar). */
  abrirSolto(arquivo: File): Promise<ArquivoAberto>;
  /**
   * Lê o arquivo pedido de fora (duplo clique num .psxml, linha de comando),
   * ou null se não há. Chamar só depois de perguntar sobre anotações.
   */
  abrirExterno(): Promise<ArquivoExterno | null>;
  /** Chamado quando chega um arquivo de fora com o app já aberto. */
  aoArquivoExterno(callback: () => void): void;
  /**
   * Pasta onde o Salvar grava: a desta sessão (duplo clique num .psxml) ou a
   * salva na configuração.
   */
  pastaDestino(): Promise<PastaDestino>;
  /** Abre o diálogo de pasta e salva a escolha. null se cancelado. */
  escolherPasta(): Promise<string | null>;
  /** Abre a pasta de destino no Explorer (erro se ela não existe mais). */
  abrirPastaDestino(): Promise<ResultadoAbrirPasta>;
  /**
   * Grava <base>_Conferencia.pdf (da tela atual) e <base>_Conferencia.psxml
   * na pasta de destino. `base` vem dos dados da nota (nfe/nome.ts); null usa
   * o nome do arquivo aberto.
   */
  salvar(textoCopia: string, base: string | null): Promise<ResultadoSalvar>;
  /**
   * Grava só <base>_Conferencia.pdf (da tela atual, sem a cópia editada) na
   * pasta de destino.
   */
  salvarPdfConferencia(base: string | null): Promise<ResultadoSalvarDanfe>;
  /** Grava só <base>_DANFE.pdf (da tela atual, A4 sem margem) na pasta de destino. */
  salvarDanfe(base: string | null): Promise<ResultadoSalvarDanfe>;
  /** Versão do app (package.json). */
  versao(): Promise<string>;
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
  /** Personalização da conferência salva (ou a padrão). */
  configConferencia(): Promise<ConfigConferencia>;
  /** Valida e salva a personalização da conferência. */
  gravarConfigConferencia(config: ConfigConferencia): Promise<ResultadoConfig>;
  /** Grava a personalização salva num .json escolhido pelo usuário. */
  exportarConfig(): Promise<ResultadoExportarConfig>;
  /** Lê um .json exportado, valida o arquivo todo e só então aplica e salva. */
  importarConfig(): Promise<ResultadoConfig | { status: 'cancelado' }>;
  /** Pergunta e volta a personalização ao padrão. */
  restaurarConfig(): Promise<ResultadoConfig | { status: 'cancelado' }>;
  /** Copia um texto ou mostra o menu do botão direito (Recortar, Copiar...). */
  areaTransferencia(
    pedido: PedidoAreaTransferencia,
  ): Promise<ResultadoAreaTransferencia>;
}

interface Window {
  psApi: PsApi;
}
