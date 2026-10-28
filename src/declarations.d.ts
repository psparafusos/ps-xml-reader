/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface ArquivoAberto {
  /** Nome do arquivo, com extensão. */
  nome: string;
  texto: string;
}

/**
 * O arquivo a gravar já existe e não foi substituído: o renderer pergunta
 * Substituir, Salvar cópia ou Cancelar e chama de novo.
 */
type ArquivoExistente = { status: 'existe'; nome: string; pasta: string };

/** Salvar e Salvar cópia: substituir sem perguntar, ou gravar com outro nome. */
interface OpcoesSalvar {
  substituir?: boolean;
  /** Nome do arquivo (sem extensão), no lugar do nome padrão. */
  nome?: string;
}

/** O que o Salvar cópia está copiando: o .psxml ou um dos PDFs. */
type TipoCopia = 'psxml' | 'conferencia' | 'danfe';

type ResultadoSalvar =
  | { status: 'salvo'; copia: string }
  | ArquivoExistente
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

type ResultadoSalvarDanfe =
  | { status: 'salvo'; pdf: string }
  | ArquivoExistente
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

/**
 * Arquivo pedido de fora para esta janela (duplo clique, Nova janela).
 * `pastaSessao`: a pasta do .psxml aberto por duplo clique, que passou a ser
 * a pasta de destino só desta janela; null se esta abertura não mudou a
 * pasta. `modo`: abrir direto nele (Nova janela pela tela de escolha).
 */
type ArquivoExterno = ArquivoAberto & {
  pastaSessao: string | null;
  modo: ModoImpressao | null;
};

/**
 * O que aconteceu ao pedir para abrir um arquivo nesta janela:
 * - aqui: abriu nesta janela (estava na tela inicial);
 * - escolher: XML com nota aberta; mostrar a escolha por cima da nota;
 * - nova-janela: abriu numa janela nova (.psxml com nota aberta);
 * - outra-janela / ja-aberto: o arquivo já estava aberto (aquela janela veio
 *   para a frente, ou é esta mesma).
 */
type ResultadoAbrir =
  | { status: 'aqui' | 'escolher'; arquivo: ArquivoAberto }
  | { status: 'nova-janela' | 'outra-janela' | 'ja-aberto' | 'cancelado' };

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

/** Resposta à pergunta de alterações não salvas (no visual do app). */
type RespostaAlteracoes = 'salvar' | 'copia' | 'descartar' | 'cancelar';

/** Nome sugerido do Salvar cópia e a pasta onde ela vai. */
type SugestaoCopia =
  | { status: 'ok'; pasta: string; nome: string }
  | { status: 'erro'; mensagem: string };

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

/**
 * Perfis de configuração (src/nfe/perfis.ts), como o renderer vê: a lista
 * (id e nome), o perfil ativo e a configuração dele.
 */
interface EstadoPerfis {
  lista: { id: string; nome: string }[];
  ativo: string;
  nomeAtivo: string;
  config: ConfigConferencia;
}

type ResultadoPerfis =
  | { status: 'ok'; estado: EstadoPerfis }
  | { status: 'erro'; mensagem: string };

/** Perfil lido de um arquivo, ainda não acrescentado à lista. */
type PerfilImportado = import('./nfe/perfis').PerfilImportado;

type ResultadoImportarPerfil =
  | { status: 'lido'; perfil: PerfilImportado; existe: boolean }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

type ResultadoExportarConfig =
  | { status: 'exportado'; caminho: string }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string };

interface PsApi {
  /** Abre o diálogo de arquivo (.xml ou .psxml) e decide onde ele abre. */
  abrirArquivo(): Promise<ResultadoAbrir>;
  /** Arquivo solto na janela (arrastar e soltar): mesmas regras do botão. */
  abrirSolto(arquivo: File): Promise<ResultadoAbrir>;
  /**
   * Resposta à escolha por cima da nota: abrir aqui (devolve o arquivo), numa
   * janela nova no modo escolhido, ou cancelar.
   */
  confirmarAbertura(
    destino: 'aqui' | 'nova' | 'cancelar',
    modo: ModoImpressao | null,
  ): Promise<ArquivoAberto | null>;
  /** A janela voltou para a tela inicial (sem nota aberta). */
  informarSemNota(): void;
  /** Os perfis (ou o perfil ativo, ou a configuração dele) mudaram em outra janela. */
  aoMudarPerfis(callback: (estado: EstadoPerfis) => void): void;
  /** A pasta de destino salva mudou em outra janela. */
  aoMudarPasta(callback: () => void): void;
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
   * Salvar da Conferência: grava só o .psxml (<base>_Conferencia.psxml, ou o
   * .psxml aberto se ele está na pasta de destino). `base` vem dos dados da
   * nota (nfe/nome.ts); null usa o nome do arquivo aberto.
   */
  salvar(
    textoCopia: string,
    base: string | null,
    opcoes?: OpcoesSalvar,
  ): Promise<ResultadoSalvar>;
  /**
   * Nome sugerido do Salvar cópia (<base>_Conferencia_copiaN ou
   * <base>_DANFE_copiaN, sem extensão) e a pasta onde ele vai.
   */
  sugerirCopia(
    base: string | null,
    tipo: TipoCopia,
    daEscolha?: boolean,
  ): Promise<SugestaoCopia>;
  /**
   * Grava a cópia <nome>.psxml na pasta de destino; depois a janela trabalha
   * nela.
   */
  salvarCopia(
    textoCopia: string,
    nome: string,
    opcoes?: OpcoesSalvar,
  ): Promise<ResultadoSalvar>;
  /**
   * Grava só <base>_Conferencia.pdf (da tela atual) na pasta de destino, em
   * retrato ou paisagem.
   */
  salvarPdfConferencia(
    base: string | null,
    paisagem: boolean,
    daEscolha?: boolean,
    opcoes?: OpcoesSalvar,
  ): Promise<ResultadoSalvarDanfe>;
  /**
   * Grava só <base>_DANFE.pdf (da tela atual, A4 sem margem) na pasta de
   * destino. `daEscolha`: o PDF é do XML da escolha por cima da nota.
   */
  salvarDanfe(
    base: string | null,
    daEscolha?: boolean,
    opcoes?: OpcoesSalvar,
  ): Promise<ResultadoSalvarDanfe>;
  /** Versão do app (package.json). */
  versao(): Promise<string>;
  /** Abre o diálogo de impressão do Windows com a tela atual. */
  imprimir(modo: ModoImpressao, paisagem: boolean): Promise<ResultadoImprimir>;
  /** Avisa o processo principal se há anotações alteradas e não salvas. */
  informarPendentes(pendentes: boolean): void;
  /** Chamado quando o usuário tenta fechar a janela com anotações pendentes. */
  aoPedirFechar(callback: () => void): void;
  /** Resposta ao pedido de fechar: true = pode fechar (salvou ou descartou). */
  responderFechar(pode: boolean): void;
  /** Perfis salvos (na primeira vez, migra a configuração anterior). */
  perfis(): Promise<EstadoPerfis>;
  /** Valida e salva a configuração no perfil ativo. */
  gravarConfigConferencia(config: ConfigConferencia): Promise<ResultadoPerfis>;
  /** Passa a usar outro perfil (em todas as janelas). */
  ativarPerfil(id: string): Promise<ResultadoPerfis>;
  /** Perfil novo, cópia do ativo, que passa a ser o ativo. */
  criarPerfil(nome: string): Promise<ResultadoPerfis>;
  renomearPerfil(id: string, nome: string): Promise<ResultadoPerfis>;
  /** Exclui um perfil (nunca o último). */
  excluirPerfil(id: string): Promise<ResultadoPerfis>;
  /** Grava o perfil ativo em "PS Reader - perfil <nome>.json". */
  exportarPerfil(): Promise<ResultadoExportarConfig>;
  /** Lê e valida um perfil (ou configuração da Parte A), sem gravar. */
  importarPerfil(): Promise<ResultadoImportarPerfil>;
  /** Acrescenta o perfil importado; nome repetido: substituir ou manter os dois. */
  adicionarPerfil(
    perfil: PerfilImportado,
    modo: 'substituir' | 'manter',
  ): Promise<ResultadoPerfis>;
  /** Pergunta e volta o perfil ativo ao padrão. */
  restaurarConfig(): Promise<ResultadoPerfis | { status: 'cancelado' }>;
  /** Copia um texto ou mostra o menu do botão direito (Recortar, Copiar...). */
  areaTransferencia(
    pedido: PedidoAreaTransferencia,
  ): Promise<ResultadoAreaTransferencia>;
}

interface Window {
  psApi: PsApi;
}
