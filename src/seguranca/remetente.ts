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
 * (`pagina`): mesmo esquema, mesmo host (com a porta) e mesmo caminho;
 * consulta e âncora não importam. Página de arquivo (file://) compara o
 * caminho sem diferenciar maiúsculas, como o Windows.
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
  if (de.protocol !== app.protocol || de.host !== app.host) return false;
  if (app.protocol === 'file:') {
    return (
      decodeURIComponent(de.pathname).toLowerCase() ===
      decodeURIComponent(app.pathname).toLowerCase()
    );
  }
  // app://ps/ (o app empacotado) e http://localhost (npm start). Esquema,
  // host (com a porta) e caminho: a origem do URL do Node é "null" para
  // esquemas próprios como app:, então não serve para comparar.
  return de.pathname === app.pathname;
}
