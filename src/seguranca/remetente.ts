// Quem pode falar com o processo principal: só o quadro principal da página
// do próprio app. Lógica pura (sem Electron), usada pelo envoltório do IPC
// em src/ipcSeguro.ts.

export interface Remetente {
  /** URL do quadro que mandou a mensagem; null se o quadro já não existe. */
  url: string | null;
  /** O quadro é o principal da janela (não um iframe). */
  principal: boolean;
}

/**
 * true se o remetente é o quadro principal e a URL dele é a página do app
 * (`pagina`): mesmo protocolo, mesma origem e mesmo caminho; consulta e
 * âncora não importam. Página de arquivo (file://) compara o caminho sem
 * diferenciar maiúsculas, como o Windows.
 */
export function remetenteValido(r: Remetente, pagina: string): boolean {
  if (!r.principal || !r.url) return false;
  let de: URL;
  let app: URL;
  try {
    de = new URL(r.url);
    app = new URL(pagina);
  } catch {
    return false;
  }
  if (de.protocol !== app.protocol) return false;
  if (app.protocol === 'file:') {
    return (
      de.host === app.host &&
      decodeURIComponent(de.pathname).toLowerCase() ===
        decodeURIComponent(app.pathname).toLowerCase()
    );
  }
  return de.origin === app.origin && de.pathname === app.pathname;
}
