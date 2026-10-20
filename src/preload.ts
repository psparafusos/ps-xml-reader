// Ponte entre o renderer e o processo principal. Expõe só duas funções.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('psApi', {
  abrirXml: (): Promise<string | null> => ipcRenderer.invoke('abrir-xml'),
  salvarPdf: (nomeSugerido: string) =>
    ipcRenderer.invoke('salvar-pdf', nomeSugerido),
});
