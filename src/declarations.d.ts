/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

/** Ajustes dos avisos da nota lidos do config.json. */
interface ConfigAvisos {
  /** CNPJ da empresa, só dígitos. */
  cnpjEmpresa: string;
  diasAvisoVencimento: number;
  diasNotaAntiga: number;
}

/** .psxml com a mesma chave da nota aberta (aviso de nota já conferida). */
interface ArquivoConferido {
  caminho: string;
  nome: string;
  /** Data de modificação (ISO). */
  modificado: string;
}

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
 * Arquivo que o processo principal recusou antes de mandar para a janela
 * (grande demais ou com DOCTYPE, src/seguranca/xml.ts). `mensagem` é para a
 * pessoa.
 */
type ArquivoRecusado = { status: 'recusado'; mensagem: string };

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
  | { status: 'nova-janela' | 'outra-janela' | 'ja-aberto' | 'cancelado' }
  | ArquivoRecusado;

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

/** Documentos de referência (src/fiscal/documentos.ts e src/documentos.ts). */
type TipoDocumento = import('./fiscal/documentos').TipoDocumento;
type InfoDocumento = import('./fiscal/documentos').InfoDocumento;
type ResultadoVerificacao = import('./fiscal/online').ResultadoVerificacao;

/** Verificação online: desligada por padrão; nada roda sem a pessoa ligar. */
interface PreferenciasDocumentos {
  verificacaoOnline: boolean;
  verificarAoAbrir: boolean;
}

type LeituraDocumento = import('./leituraDocumentos').LeituraDocumento;

interface EstadoDocumentos {
  st: InfoDocumento | null;
  tipi: InfoDocumento | null;
  /** Apêndice XIV (lubrificantes): opcional. */
  combustiveis: InfoDocumento | null;
  /** Ignorado de propósito, problemas e segmentos incompletos (<tipo>-leitura.json). */
  leitura: Record<TipoDocumento, LeituraDocumento | null>;
  /** Última tentativa recusada e nenhum documento carregado (vermelho "incompatível"). */
  recusado: Record<TipoDocumento, boolean>;
  preferencias: PreferenciasDocumentos;
  /** Última verificação de cada um (enquanto o app está aberto). */
  verificacao: {
    st: ResultadoVerificacao | null;
    tipi: ResultadoVerificacao | null;
  };
  verificando: boolean;
  /** Planilha de ST importada antes da leitura das colunas de estados (protocolos). */
  stSemProtocolos: boolean;
  /** Decisões lembradas da ferramenta ST, MVA e CFOP. */
  decisoes: DecisaoLembrada[];
}

type AnaliseItem = import('./fiscal/analise').AnaliseItem;
type DecisaoLembrada = import('./fiscal/entrada').DecisaoLembrada;

/** Item como vai para a análise: os campos fiscais e o código do produto. */
interface ItemParaAnalise {
  nItem: string;
  cProd: string;
  xProd: string;
  NCM: string;
  CEST: string;
  orig: string;
  CST: string;
  CSOSN: string;
  pICMS: string;
  /** ICMS-ST retido pelo fornecedor: base e valor. */
  vBCST: string;
  vST: string;
  CFOP: string;
  cstIPI: string;
  pIPI: string;
}

/** sem-st: a planilha de ST não foi carregada (a ferramenta não roda). */
type ResultadoAnaliseST =
  | { status: 'sem-st' }
  | {
      status: 'ok';
      itens: { analise: AnaliseItem; lembrada: DecisaoLembrada | null }[];
      /** TIPI não carregada: a análise roda sem a parte da TIPI. */
      semTipi: boolean;
      /** Todas as decisões lembradas, para a sugestão pelo histórico. */
      historico: DecisaoLembrada[];
    };

/**
 * Importar ou baixar um documento. `formato`: arquivo não reconhecido (o
 * documento anterior ficou como estava).
 */
type ResultadoImportarDocumento =
  | { status: 'ok'; info: InfoDocumento; estado: EstadoDocumentos }
  | {
      status: 'erro';
      formato: boolean;
      mensagem: string;
      /** Arquivo errado: o que fazer (vai em destaque). */
      oQueFazer?: string;
      estado: EstadoDocumentos;
    }
  /** Planilha com segmentos não lidos: espera a confirmação (confirmarParcial). */
  | {
      status: 'parcial';
      token: string;
      arquivo: string;
      segmentos: string[];
      estado: EstadoDocumentos;
    }
  | { status: 'cancelado' };

/** Andamento do download do Atualizar (versão nova de um documento). */
interface ProgressoDocumento {
  tipo: TipoDocumento;
  recebido: number;
  /** null quando o servidor não informa o tamanho. */
  total: number | null;
  /** Download terminou (bem ou mal); a importação vem em seguida. */
  fim: boolean;
}

/** Nota recente da tela inicial (src/nfe/recentes.ts) e se o arquivo ainda existe. */
type NotaRecenteTela = import('./nfe/recentes').NotaRecente & {
  existe: boolean;
};

/** O que a tela manda ao registrar a nota aberta nas recentes. */
interface DadosRecente {
  chave: string;
  fornecedor: string;
  numero: string;
  itens: number;
  situacao: import('./nfe/recentes').SituacaoRecente;
  alerta: string;
  /** Logo depois de salvar: o .psxml salvo passa a ser o arquivo da entrada. */
  salvo?: string;
}

interface PsApi {
  recentes(): Promise<NotaRecenteTela[]>;
  registrarRecente(dados: DadosRecente): Promise<void>;
  abrirRecente(caminho: string): Promise<ResultadoAbrir>;
  /** Sem caminho: limpa a lista. Com caminho: tira só aquela entrada. */
  limparRecentes(caminho?: string): Promise<NotaRecenteTela[]>;
  aoMudarRecentes(callback: () => void): void;
  /** Situação dos documentos de referência e da verificação online. */
  documentos(): Promise<EstadoDocumentos>;
  /** Escolhe o arquivo, valida e importa no lugar do anterior. */
  importarDocumento(tipo: TipoDocumento): Promise<ResultadoImportarDocumento>;
  gravarPreferenciasDocumentos(
    p: Partial<PreferenciasDocumentos>,
  ): Promise<EstadoDocumentos>;
  /** Só com a verificação online ligada. */
  verificarDocumentos(): Promise<EstadoDocumentos>;
  /** Baixa a versão nova achada na verificação e importa (mesma validação). */
  baixarDocumento(tipo: TipoDocumento): Promise<ResultadoImportarDocumento>;
  /** "Os segmentos com problema não afetam meu trabalho. Usar o resto." */
  confirmarParcial(token: string): Promise<ResultadoImportarDocumento>;
  cancelarParcial(token: string): Promise<void>;
  /** Aviso de erro fechado: esquece a recusa (o documento volta ao estado de antes). */
  descartarRecusa(tipo: TipoDocumento): Promise<EstadoDocumentos>;
  /** Tira o documento da base (volta a faltar). */
  removerDocumento(tipo: TipoDocumento): Promise<EstadoDocumentos>;
  /** Abre no navegador a página oficial do documento. */
  abrirPaginaDocumento(tipo: TipoDocumento): Promise<void>;
  aoMudarDocumentos(callback: () => void): void;
  /** Andamento do download do Atualizar, em qualquer janela. */
  aoProgressoDocumento(callback: (p: ProgressoDocumento) => void): void;
  /** Ferramenta ST, MVA e CFOP: analisa os itens com a base carregada. */
  analisarST(pedido: {
    itens: ItemParaAnalise[];
    uf: string;
    cnpj: string;
  }): Promise<ResultadoAnaliseST>;
  /** Guarda (ou troca) a decisão do produto deste fornecedor. */
  lembrarDecisao(d: DecisaoLembrada): Promise<boolean>;
  /** Apaga a decisão lembrada (chave: raiz do CNPJ + "|" + código do produto). */
  esquecerDecisao(chave: string): Promise<boolean>;
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
  abrirExterno(): Promise<ArquivoExterno | ArquivoRecusado | null>;
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
  /** Ajustes dos avisos da nota (config.json, ou os padrões). */
  configAvisos(): Promise<ConfigAvisos>;
  /** .psxml da pasta de destino em uso com a mesma chave (nota já conferida). */
  buscarConferidos(chave: string, nNF: string): Promise<ArquivoConferido[]>;
  /** Abre numa janela nova um .psxml achado por buscarConferidos. */
  abrirConferido(caminho: string): Promise<boolean>;
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
  // ---------- Configurações ----------
  /** Ferramentas do painel de cada perfil (ordem, visíveis, campos da ST). */
  ferramentasPerfis(): Promise<EstadoFerramentas>;
  gravarFerramentasPerfil(
    id: string,
    ferramentas: FerramentasPerfil,
  ): Promise<ResultadoFerramentas>;
  aoMudarFerramentas(callback: () => void): void;
  /** CNPJ da empresa e dias dos avisos (aba Geral). */
  gravarConfigAvisos(p: Partial<ConfigAvisos>): Promise<ResultadoConfigAvisos>;
  aoMudarAvisos(callback: () => void): void;
  /** Arquivos que o app guarda na pasta de dados. */
  dadosApp(): Promise<EstadoDadosApp>;
  abrirPastaDados(): Promise<ResultadoAbrirPasta>;
  exportarBackup(): Promise<ResultadoExportarConfig>;
  /** Escolhe e valida um .psbackup, sem gravar: devolve o que vai substituir. */
  lerBackup(): Promise<ResultadoLerBackup>;
  confirmarBackup(token: string): Promise<ResultadoImportarBackup>;
  cancelarBackup(token: string): Promise<void>;
}

type FerramentasPerfil = import('./nfe/ferramentasPerfil').FerramentasPerfil;

interface EstadoFerramentas {
  ativo: string;
  lista: { id: string; nome: string; ferramentas: FerramentasPerfil }[];
}

type ResultadoFerramentas =
  | { status: 'ok'; estado: EstadoFerramentas }
  | { status: 'erro'; mensagem: string };

type ResultadoConfigAvisos =
  | { status: 'ok'; config: ConfigAvisos }
  | { status: 'erro'; mensagem: string };

interface EstadoDadosApp {
  /** A pasta de dados de verdade (app.getPath('userData')). */
  pasta: string;
  itens: import('./dadosApp').ItemDadosApp[];
}

type ResumoBackup = import('./dadosApp').ResumoBackup;

type ResultadoLerBackup =
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string }
  | {
      status: 'lido';
      token: string;
      arquivo: string;
      novo: ResumoBackup;
      atual: ResumoBackup;
    };

type ResultadoImportarBackup =
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string }
  | { status: 'ok'; pastaAntes: string };

interface Window {
  psApi: PsApi;
}
