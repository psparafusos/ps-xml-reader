// Caixas da recuperação de anotações (src/rascunhos.ts), no visual do app
// (src/dialogos.ts):
// - o aviso da abertura do app, com uma linha por nota que ficou com
//   anotações não salvas, cada uma com Recuperar e Descartar, e o Decidir
//   depois, que fecha e mantém os rascunhos;
// - a pergunta de uma nota só, quando a pessoa abre uma nota que tem
//   rascunho: Recuperar as anotações ou Abrir sem elas.
// Descartar e Abrir sem elas pedem confirmação antes de apagar. Os dados da
// nota (fornecedor, número, série, data) ficam selecionáveis; títulos e
// botões, não.

import { botao, el } from './dom';
import { novaCaixa, perguntar } from './dialogos';

export const TITULO_AVISO_RASCUNHOS = 'Recuperar anotações';
export const TEXTO_AVISO_RASCUNHOS =
  'O PS Reader fechou sem salvar estas notas. Quer recuperar as anotações?';
export const TITULO_PERGUNTA_RASCUNHO = 'Recuperar anotações desta nota';
export const TEXTO_PERGUNTA_RASCUNHO =
  'O PS Reader fechou sem salvar as anotações desta nota. Quer recuperar as anotações?';

/** "17/11/2026 às 10:32", na hora local. */
export function quandoAlterado(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "NF 123, série 1". */
export function descreverNota(r: ResumoRascunho): string {
  const nf = r.numero ? `NF ${r.numero}` : 'NF sem número';
  return r.serie ? `${nf}, série ${r.serie}` : nf;
}

/** Fornecedor, NF e série e a data da última alteração (texto selecionável). */
function dadosDaNota(r: ResumoRascunho, id: string): HTMLElement {
  const quando = quandoAlterado(r.alteradoEm);
  const dados = el(
    'div',
    'rascunhos__nota',
    el(
      'strong',
      'rascunhos__fornecedor',
      r.fornecedor || 'Fornecedor sem nome',
    ),
    el('span', 'rascunhos__nf', descreverNota(r)),
    el(
      'span',
      'rascunhos__quando',
      quando ? `Última alteração em ${quando}` : '',
    ),
  );
  dados.id = id;
  return dados;
}

let sequencia = 0;
const novoId = () => `rascunho-${++sequencia}`;

/** Confirmação antes de apagar o rascunho de uma nota. true = apagar. */
async function confirmarDescarte(
  r: ResumoRascunho,
  opcoes: { titulo: string; confirmar: string; voltar: string },
): Promise<boolean> {
  const resposta = await perguntar<'apagar' | 'voltar'>({
    titulo: opcoes.titulo,
    texto: `As anotações não salvas de ${r.fornecedor || 'Fornecedor sem nome'}, ${descreverNota(r)} serão apagadas. Não dá para desfazer.`,
    botoes: [
      { rotulo: opcoes.voltar, valor: 'voltar' },
      { rotulo: opcoes.confirmar, valor: 'apagar', perigo: true },
    ],
    cancelar: 'voltar',
  });
  return resposta === 'apagar';
}

export interface AcoesAvisoRascunhos {
  /** Abre a nota recuperada. true se ela saiu do aviso (abriu). */
  recuperar(r: ResumoRascunho): Promise<boolean>;
  /** Apaga o rascunho (já confirmado). true se apagou. */
  descartar(r: ResumoRascunho): Promise<boolean>;
}

/**
 * Aviso da abertura do app. Fecha quando não sobra nota, no Decidir depois
 * ou no Esc (os rascunhos que sobraram ficam para a próxima abertura).
 */
export function mostrarAvisoRascunhos(
  lista: ResumoRascunho[],
  acoes: AcoesAvisoRascunhos,
): Promise<void> {
  return new Promise((resolve) => {
    const { d, corpo, fim } = novaCaixa<void>(
      TITULO_AVISO_RASCUNHOS,
      TEXTO_AVISO_RASCUNHOS,
      undefined,
      resolve,
    );
    d.classList.add('caixa-dialogo--rascunhos');
    const linhas = el('ul', 'rascunhos__lista');
    linhas.setAttribute('aria-label', 'Notas com anotações não salvas');
    let ocupado = false;

    const tirarLinha = (li: HTMLElement) => {
      li.remove();
      if (linhas.childElementCount === 0) fim(undefined);
      else
        linhas.querySelector<HTMLButtonElement>('.botao--principal')?.focus();
    };

    for (const r of lista) {
      const idDados = novoId();
      const recuperar = botao('botao botao--principal', 'Recuperar');
      const descartar = botao('botao botao--claro', 'Descartar');
      for (const b of [recuperar, descartar])
        b.setAttribute('aria-describedby', idDados);
      const li = el(
        'li',
        'rascunhos__linha',
        dadosDaNota(r, idDados),
        el('div', 'rascunhos__acoes', descartar, recuperar),
      );
      li.dataset.rascunho = r.id;
      const rodar = async (fn: () => Promise<boolean>, foco: HTMLElement) => {
        if (ocupado) return;
        ocupado = true;
        recuperar.disabled = true;
        descartar.disabled = true;
        let saiu = false;
        try {
          saiu = await fn();
        } catch (erro) {
          console.error(erro);
        } finally {
          ocupado = false;
          recuperar.disabled = false;
          descartar.disabled = false;
        }
        if (saiu) tirarLinha(li);
        else foco.focus();
      };
      recuperar.addEventListener(
        'click',
        () => void rodar(() => acoes.recuperar(r), recuperar),
      );
      descartar.addEventListener(
        'click',
        () =>
          void rodar(async () => {
            const sim = await confirmarDescarte(r, {
              titulo: 'Descartar as anotações?',
              confirmar: 'Descartar',
              voltar: 'Cancelar',
            });
            return sim && (await acoes.descartar(r));
          }, descartar),
      );
      linhas.append(li);
    }

    corpo.append(linhas);
    const depois = botao('botao botao--claro', 'Decidir depois');
    depois.addEventListener('click', () => fim(undefined));
    d.append(el('footer', 'caixa-dialogo__botoes', depois));
    document.body.append(d);
    d.showModal();
    linhas.querySelector<HTMLButtonElement>('.botao--principal')?.focus();
  });
}

/**
 * Pergunta de uma nota que tem rascunho, antes de mostrá-la. 'sem': a pessoa
 * confirmou Abrir sem elas (o rascunho deve ser apagado). 'manter' (Esc):
 * abre sem recuperar e o rascunho fica guardado.
 */
export async function perguntarRascunhoDaNota(
  r: ResumoRascunho,
): Promise<'recuperar' | 'sem' | 'manter'> {
  for (;;) {
    const resposta = await new Promise<'recuperar' | 'sem' | 'manter'>(
      (resolve) => {
        const { d, corpo, fim } = novaCaixa<'recuperar' | 'sem' | 'manter'>(
          TITULO_PERGUNTA_RASCUNHO,
          TEXTO_PERGUNTA_RASCUNHO,
          'manter',
          resolve,
        );
        d.classList.add('caixa-dialogo--rascunhos');
        corpo.append(
          el(
            'div',
            'rascunhos__linha rascunhos__linha--so',
            dadosDaNota(r, novoId()),
          ),
        );
        const sem = botao('botao botao--claro', 'Abrir sem elas');
        const recuperar = botao(
          'botao botao--principal',
          'Recuperar as anotações',
        );
        sem.addEventListener('click', () => fim('sem'));
        recuperar.addEventListener('click', () => fim('recuperar'));
        d.append(el('footer', 'caixa-dialogo__botoes', sem, recuperar));
        document.body.append(d);
        d.showModal();
        recuperar.focus();
      },
    );
    if (resposta !== 'sem') return resposta;
    if (
      await confirmarDescarte(r, {
        titulo: 'Abrir sem as anotações?',
        confirmar: 'Descartar e abrir',
        voltar: 'Voltar',
      })
    )
      return 'sem';
  }
}
