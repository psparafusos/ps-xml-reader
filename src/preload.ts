// Ponte entre o renderer e o processo principal. Expõe só as funções de PsApi.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('psApi', {
  abrirArquivo: (): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-arquivo'),
  // O caminho do arquivo solto só existe aqui (webUtils); o processo
  // principal lê o arquivo e guarda o caminho.
  abrirSolto: (arquivo: File): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-caminho', webUtils.getPathForFile(arquivo)),
  confirmarAbertura: (
    destino: 'aqui' | 'nova' | 'cancelar',
    modo: ModoImpressao | null,
  ): Promise<ArquivoAberto | null> =>
    ipcRenderer.invoke('confirmar-abertura', destino, modo),
  informarSemNota: (): void => ipcRenderer.send('sem-nota'),
  aoMudarPerfis: (callback: (estado: EstadoPerfis) => void): void => {
    ipcRenderer.on('perfis-mudou', (_e, estado: EstadoPerfis) =>
      callback(estado),
    );
  },
  aoMudarPasta: (callback: () => void): void => {
    ipcRenderer.on('pasta-mudou', () => callback());
  },
  abrirExterno: (): Promise<ArquivoExterno | null> =>
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
    daEscolha = false,
  ): Promise<SugestaoCopia> =>
    ipcRenderer.invoke('sugerir-copia', base, tipo, daEscolha),
  salvarCopia: (
    textoCopia: string,
    nome: string,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar-copia', textoCopia, nome, opcoes),
  salvarPdfConferencia: (
    base: string | null,
    paisagem: boolean,
    daEscolha = false,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke(
      'salvar-pdf-conferencia',
      base,
      paisagem,
      daEscolha,
      opcoes,
    ),
  salvarDanfe: (
    base: string | null,
    daEscolha = false,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-danfe', base, daEscolha, opcoes),
  versao: (): Promise<string> => ipcRenderer.invoke('versao'),
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
} satisfies PsApi);
