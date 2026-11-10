// Ponte entre o renderer e o processo principal. Expõe só as funções de PsApi.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('psApi', {
  recentes: (): Promise<NotaRecenteTela[]> => ipcRenderer.invoke('recentes'),
  registrarRecente: (dados: DadosRecente): Promise<void> =>
    ipcRenderer.invoke('registrar-recente', dados),
  abrirRecente: (caminho: string): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-recente', caminho),
  limparRecentes: (caminho?: string): Promise<NotaRecenteTela[]> =>
    ipcRenderer.invoke('limpar-recentes', caminho),
  aoMudarRecentes: (callback: () => void): void => {
    ipcRenderer.on('recentes-mudou', () => callback());
  },
  documentos: (): Promise<EstadoDocumentos> => ipcRenderer.invoke('documentos'),
  importarDocumento: (
    tipo: TipoDocumento,
  ): Promise<ResultadoImportarDocumento> =>
    ipcRenderer.invoke('importar-documento', tipo),
  gravarPreferenciasDocumentos: (
    p: Partial<PreferenciasDocumentos>,
  ): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('preferencias-documentos', p),
  verificarDocumentos: (): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('verificar-documentos'),
  baixarDocumento: (tipo: TipoDocumento): Promise<ResultadoImportarDocumento> =>
    ipcRenderer.invoke('baixar-documento', tipo),
  confirmarParcial: (token: string): Promise<ResultadoImportarDocumento> =>
    ipcRenderer.invoke('confirmar-parcial', token),
  cancelarParcial: (token: string): Promise<void> =>
    ipcRenderer.invoke('cancelar-parcial', token),
  descartarRecusa: (tipo: TipoDocumento): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('descartar-recusa', tipo),
  removerDocumento: (tipo: TipoDocumento): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('remover-documento', tipo),
  abrirPaginaDocumento: (tipo: TipoDocumento): Promise<void> =>
    ipcRenderer.invoke('abrir-pagina-documento', tipo),
  analisarST: (pedido: {
    itens: ItemParaAnalise[];
    uf: string;
    cnpj: string;
  }): Promise<ResultadoAnaliseST> => ipcRenderer.invoke('analisar-st', pedido),
  lembrarDecisao: (d: DecisaoLembrada): Promise<boolean> =>
    ipcRenderer.invoke('lembrar-decisao', d),
  esquecerDecisao: (chave: string): Promise<boolean> =>
    ipcRenderer.invoke('esquecer-decisao', chave),
  aoMudarDocumentos: (callback: () => void): void => {
    ipcRenderer.on('documentos-mudou', () => callback());
  },
  aoProgressoDocumento: (callback: (p: ProgressoDocumento) => void): void => {
    ipcRenderer.on('documento-progresso', (_e, p: ProgressoDocumento) =>
      callback(p),
    );
  },
  abrirArquivo: (): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-arquivo'),
  // O caminho do arquivo solto só existe aqui (webUtils); o processo
  // principal lê o arquivo e guarda o caminho.
  abrirSolto: (arquivo: File): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-caminho', webUtils.getPathForFile(arquivo)),
  informarSemNota: (): void => ipcRenderer.send('sem-nota'),
  sairDaLeitura: (): Promise<boolean> => ipcRenderer.invoke('sair-da-leitura'),
  aoMudarPerfis: (callback: (estado: EstadoPerfis) => void): void => {
    ipcRenderer.on('perfis-mudou', (_e, estado: EstadoPerfis) =>
      callback(estado),
    );
  },
  aoMudarPasta: (callback: () => void): void => {
    ipcRenderer.on('pasta-mudou', () => callback());
  },
  abrirExterno: (): Promise<ArquivoExterno | ArquivoRecusado | null> =>
    ipcRenderer.invoke('abrir-externo'),
  aoArquivoExterno: (callback: () => void): void => {
    ipcRenderer.on('arquivo-externo', () => callback());
  },
  pastaDestino: (): Promise<PastaDestino> =>
    ipcRenderer.invoke('pasta-destino'),
  escolherPasta: (): Promise<string | null> =>
    ipcRenderer.invoke('escolher-pasta'),
  abrirPastaDestino: (): Promise<ResultadoAbrirPasta> =>
    ipcRenderer.invoke('abrir-pasta-destino'),
  salvar: (
    textoCopia: string,
    base: string | null,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar', textoCopia, base, opcoes),
  sugerirCopia: (
    base: string | null,
    tipo: TipoCopia,
  ): Promise<SugestaoCopia> => ipcRenderer.invoke('sugerir-copia', base, tipo),
  salvarCopia: (
    textoCopia: string,
    nome: string,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar-copia', textoCopia, nome, opcoes),
  salvarPdfConferencia: (
    base: string | null,
    paisagem: boolean,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-pdf-conferencia', base, paisagem, opcoes),
  salvarDanfe: (
    base: string | null,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-danfe', base, opcoes),
  versao: (): Promise<string> => ipcRenderer.invoke('versao'),
  configAvisos: (): Promise<ConfigAvisos> =>
    ipcRenderer.invoke('config-avisos'),
  buscarConferidos: (chave: string, nNF: string): Promise<ArquivoConferido[]> =>
    ipcRenderer.invoke('buscar-conferidos', chave, nNF),
  abrirConferido: (caminho: string): Promise<boolean> =>
    ipcRenderer.invoke('abrir-conferido', caminho),
  imprimir: (
    modo: ModoImpressao,
    paisagem: boolean,
  ): Promise<ResultadoImprimir> =>
    ipcRenderer.invoke('imprimir', modo, paisagem),
  informarPendentes: (pendentes: boolean): void =>
    ipcRenderer.send('anotacoes-pendentes', pendentes),
  aoPedirFechar: (callback: () => void): void => {
    ipcRenderer.on('pedido-fechar', () => callback());
  },
  responderFechar: (pode: boolean): void =>
    ipcRenderer.send('resposta-fechar', pode),
  perfis: (): Promise<EstadoPerfis> => ipcRenderer.invoke('perfis'),
  gravarConfigConferencia: (
    config: ConfigConferencia,
  ): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('gravar-config-conferencia', config),
  ativarPerfil: (id: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('ativar-perfil', id),
  criarPerfil: (nome: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('criar-perfil', nome),
  renomearPerfil: (id: string, nome: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('renomear-perfil', id, nome),
  excluirPerfil: (id: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('excluir-perfil', id),
  exportarPerfil: (): Promise<ResultadoExportarConfig> =>
    ipcRenderer.invoke('exportar-perfil'),
  importarPerfil: (): Promise<ResultadoImportarPerfil> =>
    ipcRenderer.invoke('importar-perfil'),
  adicionarPerfil: (
    perfil: PerfilImportado,
    modo: 'substituir' | 'manter',
  ): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('adicionar-perfil', perfil, modo),
  restaurarConfig: (): Promise<ResultadoPerfis | { status: 'cancelado' }> =>
    ipcRenderer.invoke('restaurar-config'),
  areaTransferencia: (
    pedido: PedidoAreaTransferencia,
  ): Promise<ResultadoAreaTransferencia> =>
    ipcRenderer.invoke('area-transferencia', pedido),
  ferramentasPerfis: (): Promise<EstadoFerramentas> =>
    ipcRenderer.invoke('ferramentas-perfis'),
  gravarFerramentasPerfil: (
    id: string,
    ferramentas: FerramentasPerfil,
  ): Promise<ResultadoFerramentas> =>
    ipcRenderer.invoke('gravar-ferramentas-perfil', id, ferramentas),
  aoMudarFerramentas: (callback: () => void): void => {
    ipcRenderer.on('ferramentas-mudou', () => callback());
  },
  gravarConfigAvisos: (
    p: Partial<ConfigAvisos>,
  ): Promise<ResultadoConfigAvisos> =>
    ipcRenderer.invoke('gravar-config-avisos', p),
  aoMudarAvisos: (callback: () => void): void => {
    ipcRenderer.on('avisos-mudou', () => callback());
  },
  dadosApp: (): Promise<EstadoDadosApp> => ipcRenderer.invoke('dados-app'),
  abrirPastaDados: (): Promise<ResultadoAbrirPasta> =>
    ipcRenderer.invoke('abrir-pasta-dados'),
  exportarBackup: (): Promise<ResultadoExportarConfig> =>
    ipcRenderer.invoke('exportar-backup'),
  lerBackup: (): Promise<ResultadoLerBackup> =>
    ipcRenderer.invoke('ler-backup'),
  confirmarBackup: (token: string): Promise<ResultadoImportarBackup> =>
    ipcRenderer.invoke('confirmar-backup', token),
  cancelarBackup: (token: string): Promise<void> =>
    ipcRenderer.invoke('cancelar-backup', token),
} satisfies PsApi);
