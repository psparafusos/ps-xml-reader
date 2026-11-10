// Lado do processo principal da tela do leitor genérico de XML. Canais
// leitor-xml-*, todos pelo envoltório src/ipcSeguro.ts. O caminho do
// arquivo fica aqui, por janela: a tela nunca manda caminho, só pede
// "o arquivo desta janela". A leitura roda no serviço de leitura pesada
// (src/servico/principal.ts), com andamento e Cancelar na janela.
//
// Rota interna, ainda fora da navegação: o test:janela emite no app o
// evento 'leitor-xml-rota-interna' com o caminho; no npm start, Ctrl+Shift+L
// na janela pede um .xml num diálogo. No app empacotado as duas ficam
// desligadas (a parte 3 liga a tela no Abrir).

import { app, BrowserWindow, dialog, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { problemaCaminhoSolto } from '../seguranca/arquivo';
import { tratar } from '../ipcSeguro';
import { executarNaJanela } from '../servico/principal';
import { mensagemDoDesfecho } from '../servico/supervisor';
import { comandoBlocoDeNotas, type LeituraParaTela } from './arquivo';
import type { ResultadoBlocoDeNotas, ResultadoLeitorXml } from './tipos';

interface EstadoLeitor {
  caminho: string;
  /** Texto da última leitura, até a tela pedir (leitor-xml-texto). */
  texto: string | null;
}

/** Arquivo do leitor em cada janela, pelo id do webContents. */
const porJanela = new Map<number, EstadoLeitor>();

const EVENTO_ROTA = 'leitor-xml-rota-interna';

/** Guarda o caminho para a janela; esquece quando ela fecha. */
function guardar(wc: WebContents, caminho: string): void {
  if (!porJanela.has(wc.id)) {
    const id = wc.id;
    wc.once('destroyed', () => porJanela.delete(id));
  }
  porJanela.set(wc.id, { caminho, texto: null });
}

/** Caminho que pode ir para o leitor: .xml, absoluto, arquivo comum. */
async function caminhoValido(caminho: unknown): Promise<string | null> {
  if (typeof caminho !== 'string') return null;
  const problema = await problemaCaminhoSolto(caminho, ['.xml']);
  if (problema) {
    console.warn(`Leitor de XML: caminho recusado (${problema}).`);
    return null;
  }
  return caminho;
}

/** A rota interna só existe fora do app empacotado. */
const rotaInternaLigada = () => !app.isPackaged;

export function registrarLeitorXml(): void {
  tratar('leitor-xml-carregar', async (event): Promise<ResultadoLeitorXml> => {
    const estado = porJanela.get(event.sender.id);
    if (!estado) return { status: 'sem-arquivo' };
    const arquivo = {
      nome: path.basename(estado.caminho),
      caminho: estado.caminho,
      tamanho: null,
    };
    // O arquivo pode ter virado atalho ou sumido desde que foi escolhido.
    const problema = await problemaCaminhoSolto(estado.caminho, ['.xml']);
    if (problema) {
      return {
        status: 'recusado',
        arquivo,
        motivo: 'erro',
        mensagem: problema,
      };
    }
    const desfecho = await executarNaJanela(
      event.sender,
      { tipo: 'xml', caminho: estado.caminho },
      `Lendo ${arquivo.nome}`,
    );
    if (desfecho.status !== 'ok') {
      return {
        status: 'recusado',
        arquivo,
        motivo: desfecho.status === 'cancelado' ? 'cancelado' : 'erro',
        mensagem: mensagemDoDesfecho(desfecho),
      };
    }
    const { resultado, texto } = desfecho.resultado as LeituraParaTela;
    // A janela pode ter fechado o leitor enquanto lia.
    if (porJanela.get(event.sender.id) === estado) estado.texto = texto;
    return resultado;
  });

  // O texto vai num pedido à parte: com a árvore e as linhas no mesmo
  // pedido, um arquivo grande passaria do tamanho máximo de uma mensagem.
  tratar('leitor-xml-texto', (event): string | null => {
    const estado = porJanela.get(event.sender.id);
    if (!estado) return null;
    const texto = estado.texto;
    estado.texto = null;
    return texto;
  });

  tratar(
    'leitor-xml-bloco-de-notas',
    (event): Promise<ResultadoBlocoDeNotas> => {
      const estado = porJanela.get(event.sender.id);
      const comando = estado
        ? comandoBlocoDeNotas(estado.caminho, process.env.SystemRoot)
        : null;
      if (!comando) {
        return Promise.resolve({
          ok: false,
          mensagem: 'Não há arquivo para abrir no Bloco de Notas.',
        });
      }
      return new Promise((resolve) => {
        // Sem shell: o caminho vai como argumento, nunca interpretado.
        const filho = execFile(comando.arquivo, comando.argumentos, {
          windowsHide: false,
        });
        filho.once('spawn', () => {
          filho.unref();
          resolve({ ok: true });
        });
        filho.once('error', () =>
          resolve({
            ok: false,
            mensagem: 'Não foi possível abrir o Bloco de Notas.',
          }),
        );
      });
    },
  );

  tratar('leitor-xml-fechar', (event): void => {
    porJanela.delete(event.sender.id);
  });

  tratar('leitor-xml-escolher', async (event): Promise<boolean> => {
    if (!rotaInternaLigada()) return false;
    const janela = BrowserWindow.fromWebContents(event.sender);
    if (!janela) return false;
    const { canceled, filePaths } = await dialog.showOpenDialog(janela, {
      title: 'Leitor de XML (rota interna)',
      filters: [{ name: 'XML', extensions: ['xml'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return false;
    const caminho = await caminhoValido(filePaths[0]);
    if (!caminho) return false;
    guardar(event.sender, caminho);
    return true;
  });

  if (rotaInternaLigada()) {
    // Evento do próprio processo principal (o test:janela roda aqui dentro):
    // abre o arquivo no leitor da janela em foco, ou da última aberta.
    (app as unknown as NodeJS.EventEmitter).on(
      EVENTO_ROTA,
      async (caminho: unknown) => {
        const valido = await caminhoValido(caminho);
        const janelas = BrowserWindow.getAllWindows();
        const janela =
          BrowserWindow.getFocusedWindow() ?? janelas[janelas.length - 1];
        if (!valido || !janela || janela.isDestroyed()) return;
        guardar(janela.webContents, valido);
        janela.webContents.send('leitor-xml-mostrar');
      },
    );
  }
}
