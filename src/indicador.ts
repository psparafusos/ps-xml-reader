// Indicador de "processando" que só aparece quando uma ação passa do tempo
// de espera (500 ms): ações rápidas não fazem a tela piscar. Várias ações ao
// mesmo tempo mantêm o indicador até a última terminar. Sem DOM: quem usa
// diz como mostrar e esconder.

export const ESPERA_INDICADOR_MS = 500;

export interface Indicador {
  /** Roda `acao`; o indicador aparece se ela demorar mais que a espera. */
  rodar<T>(acao: () => Promise<T>): Promise<T>;
}

export function criarIndicador(
  mostrar: (visivel: boolean) => void,
  espera = ESPERA_INDICADOR_MS,
): Indicador {
  let emAndamento = 0;
  let visivel = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const ligar = (v: boolean) => {
    if (visivel === v) return;
    visivel = v;
    mostrar(v);
  };
  return {
    async rodar<T>(acao: () => Promise<T>): Promise<T> {
      emAndamento++;
      if (emAndamento === 1)
        temporizador = setTimeout(() => ligar(true), espera);
      try {
        return await acao();
      } finally {
        emAndamento--;
        if (emAndamento === 0) {
          clearTimeout(temporizador);
          ligar(false);
        }
      }
    },
  };
}
