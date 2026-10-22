// Ponte entre o renderer e o processo principal. Expõe só as funções de PsApi.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('psApi', {
  abrirArquivo: (): Promise<ArquivoAberto | null> =>
    ipcRenderer.invoke('abrir-arquivo'),
  // O caminho do arquivo solto só existe aqui (webUtils); o processo
  // principal lê o arquivo e guarda o caminho.
  abrirSolto: (arquivo: File): Promise<ArquivoAberto> =>
    ipcRenderer.invoke('abrir-caminho', webUtils.getPathForFile(arquivo)),
  pastaDestino: (): Promise<string | null> =>
    ipcRenderer.invoke('pasta-destino'),
  escolherPasta: (): Promise<string | null> =>
    ipcRenderer.invoke('escolher-pasta'),
  abrirPastaDestino: (): Promise<ResultadoAbrirPasta> =>
    ipcRenderer.invoke('abrir-pasta-destino'),
  salvar: (textoCopia: string, base: string | null): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar', textoCopia, base),
  salvarDanfe: (base: string | null): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-danfe', base),
  versao: (): Promise<string> => ipcRenderer.invoke('versao'),
  imprimir: (modo: ModoImpressao): Promise<ResultadoImprimir> =>
    ipcRenderer.invoke('imprimir', modo),
  informarPendentes: (pendentes: boolean): void =>
    ipcRenderer.send('anotacoes-pendentes', pendentes),
  perguntarAlteracoes: (): Promise<RespostaAlteracoes> =>
    ipcRenderer.invoke('perguntar-alteracoes'),
  aoPedirFechar: (callback: () => void): void => {
    ipcRenderer.on('pedido-fechar', () => callback());
  },
  fecharJanela: (): Promise<void> => ipcRenderer.invoke('fechar-janela'),
  areaTransferencia: (
    pedido: PedidoAreaTransferencia,
  ): Promise<ResultadoAreaTransferencia> =>
    ipcRenderer.invoke('area-transferencia', pedido),
} satisfies PsApi);
