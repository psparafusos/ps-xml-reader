// Ponte entre o renderer e o processo principal. Expõe só as funções de PsApi.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('psApi', {
  abrirArquivo: (): Promise<ArquivoAberto | null> =>
    ipcRenderer.invoke('abrir-arquivo'),
  // O caminho do arquivo solto só existe aqui (webUtils); o processo
  // principal lê o arquivo e guarda o caminho.
  abrirSolto: (arquivo: File): Promise<ArquivoAberto> =>
    ipcRenderer.invoke('abrir-caminho', webUtils.getPathForFile(arquivo)),
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
  salvar: (textoCopia: string, base: string | null): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar', textoCopia, base),
  sugerirCopia: (base: string | null): Promise<SugestaoCopia> =>
    ipcRenderer.invoke('sugerir-copia', base),
  salvarCopia: (textoCopia: string, nome: string): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar-copia', textoCopia, nome),
  salvarPdfConferencia: (
    base: string | null,
    paisagem: boolean,
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-pdf-conferencia', base, paisagem),
  salvarDanfe: (base: string | null): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-danfe', base),
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
  fecharJanela: (): Promise<void> => ipcRenderer.invoke('fechar-janela'),
  configConferencia: (): Promise<ConfigConferencia> =>
    ipcRenderer.invoke('config-conferencia'),
  gravarConfigConferencia: (
    config: ConfigConferencia,
  ): Promise<ResultadoConfig> =>
    ipcRenderer.invoke('gravar-config-conferencia', config),
  exportarConfig: (): Promise<ResultadoExportarConfig> =>
    ipcRenderer.invoke('exportar-config'),
  importarConfig: (): Promise<ResultadoConfig | { status: 'cancelado' }> =>
    ipcRenderer.invoke('importar-config'),
  restaurarConfig: (): Promise<ResultadoConfig | { status: 'cancelado' }> =>
    ipcRenderer.invoke('restaurar-config'),
  areaTransferencia: (
    pedido: PedidoAreaTransferencia,
  ): Promise<ResultadoAreaTransferencia> =>
    ipcRenderer.invoke('area-transferencia', pedido),
} satisfies PsApi);
