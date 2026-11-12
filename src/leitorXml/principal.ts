// Lado do processo principal da tela do leitor genérico de XML. Canais
// leitor-xml-*, todos pelo envoltório src/ipcSeguro.ts. O caminho do
// arquivo fica aqui, por janela: a tela nunca manda caminho, só pede
// "o arquivo desta janela". A leitura roda no serviço de leitura pesada
// (src/servico/principal.ts), com andamento e Cancelar na janela.
//
// Quem abre é o fluxo de abrir do app (main.ts): XML que não é NF-e, pelo
// botão Abrir, pelo arrastar, pela nota recente, pelo duplo clique ou pelo
// "Abrir com", vem para cá por abrirNoLeitor (destino em ./destino.ts).

import type { WebContents } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { problemaCaminhoSolto } from '../seguranca/arquivo';
import { tratar } from '../ipcSeguro';
import { executarNaJanela, servico } from '../servico/principal';
import { mensagemDoDesfecho } from '../servico/supervisor';
import { comandoBlocoDeNotas, type LeituraParaTela } from './arquivo';
import type { ResultadoBlocoDeNotas, ResultadoLeitorXml } from './tipos';

interface EstadoLeitor {
  caminho: string;
  /** Texto da última leitura, até a tela pedir (leitor-xml-texto). */
  texto: string | null;
  /** Leitura em andamento no serviço (para o Fechar cancelar). */
  leitura: number | null;
}

/** Arquivo do leitor em cada janela, pelo id do webContents. */
const porJanela = new Map<number, EstadoLeitor>();

/** Guarda o caminho para a janela; esquece quando ela fecha. */
function guardar(wc: WebContents, caminho: string): void {
  if (!porJanela.has(wc.id)) {
    const id = wc.id;
    wc.once('destroyed', () => porJanela.delete(id));
  }
  porJanela.set(wc.id, { caminho, texto: null, leitura: null });
}

/** Caminho do arquivo no leitor desta janela (null: leitor fechado). */
export function caminhoNoLeitor(wcId: number): string | null {
  return porJanela.get(wcId)?.caminho ?? null;
}

/**
 * Abre o arquivo no leitor da janela. O caminho já passou pelas barreiras do
 * fluxo de abrir; antes de ler, leitor-xml-carregar confere de novo.
 */
export function abrirNoLeitor(wc: WebContents, caminho: string): void {
  guardar(wc, caminho);
  wc.send('leitor-xml-mostrar');
}

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
      (id) => {
        estado.leitura = id;
      },
    );
    estado.leitura = null;
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

  // Fechar no meio da leitura também cancela a leitura no serviço.
  tratar('leitor-xml-fechar', (event): void => {
    const leitura = porJanela.get(event.sender.id)?.leitura;
    if (leitura) servico.cancelar(leitura);
    porJanela.delete(event.sender.id);
  });
}
