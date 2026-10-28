// Tabela de itens na folha (PDF e impressão). A folha não usa a tabela da
// tela: antes de salvar o PDF ou imprimir, monta cópias com a classe
// tabela--folha (sem os campos, com o espelho do texto das anotações), numa
// ou mais partes, seguindo o plano de nfe/folha.ts. As medidas das colunas
// vêm de uma cópia escondida com as mesmas regras de CSS do papel.

import { el } from './dom';
import {
  planejarFolha,
  pxParaMm,
  type LargurasColunas,
  type OrientacaoConfig,
  type PlanoFolha,
} from './nfe/folha';

/**
 * Cópia da tabela da tela para a folha: sem os campos de anotação (fica o
 * espelho com o texto), sem foco e sem ações. `ids`: só essas colunas, na
 * ordem da tabela; sem `ids`, todas.
 */
export function copiaParaFolha(
  tabela: HTMLTableElement,
  ids?: string[],
): HTMLTableElement {
  const copia = tabela.cloneNode(true) as HTMLTableElement;
  copia.className = 'tabela tabela--folha';
  copia.removeAttribute('style');
  for (const campo of copia.querySelectorAll('.anotacao__campo'))
    campo.remove();
  for (const th of copia.querySelectorAll('th')) {
    th.removeAttribute('tabindex');
    th.removeAttribute('title');
  }
  if (!ids) return copia;
  const colunas = [...copia.querySelectorAll<HTMLElement>('thead th')].map(
    (th) => th.dataset.coluna ?? '',
  );
  // Do fim para o começo, para os índices não mudarem ao remover.
  const remover = colunas
    .map((id, i) => (ids.includes(id) ? -1 : i))
    .filter((i) => i >= 0)
    .reverse();
  for (const tr of copia.querySelectorAll('tr')) {
    if (tr.classList.contains('item__linha-adicional')) {
      const td = tr.firstElementChild as HTMLTableCellElement | null;
      if (td) td.colSpan = colunas.length - remover.length;
      continue;
    }
    for (const i of remover) tr.children[i]?.remove();
  }
  return copia;
}

/**
 * Plano da folha para esta tabela: mede a largura de cada coluna (em mm) em
 * cada tamanho de fonte, numa cópia escondida com a descrição no mínimo.
 */
export function planoDaTabela(
  tabela: HTMLTableElement,
  orientacao: OrientacaoConfig,
): PlanoFolha {
  const copia = copiaParaFolha(tabela);
  const caixa = el('div', 'medida-folha', copia);
  caixa.setAttribute('aria-hidden', 'true');
  document.body.append(caixa);
  try {
    const titulos = [...copia.querySelectorAll<HTMLElement>('thead th')];
    return planejarFolha(orientacao, (fontePt): LargurasColunas => {
      caixa.style.setProperty('--fs-tabela-folha', `${fontePt}pt`);
      return titulos.map((th) => ({
        id: th.dataset.coluna ?? '',
        mm: pxParaMm(th.getBoundingClientRect().width),
      }));
    });
  } finally {
    caixa.remove();
  }
}

const ID_ESTILO_PAGINA = 'estilo-pagina-conferencia';

/**
 * Coloca na seção de itens as cópias da folha conforme o plano (com a fonte
 * do plano) e a orientação da página em @page. Desfeito por desmontarFolha.
 */
export function montarFolha(
  secao: HTMLElement,
  tabela: HTMLTableElement,
  plano: PlanoFolha,
): void {
  desmontarFolha();
  const total = plano.partes.length;
  const impressao = el(
    'div',
    'tabela-impressao',
    ...plano.partes.map((ids, i) =>
      el(
        'div',
        'tabela-impressao__parte',
        total > 1 &&
          el(
            'p',
            'tabela-impressao__titulo',
            `Itens, parte ${i + 1} de ${total}`,
          ),
        copiaParaFolha(tabela, ids),
      ),
    ),
  );
  impressao.style.setProperty('--fs-tabela-folha', `${plano.fontePt}pt`);
  secao.append(impressao);
  const estilo = el('style');
  estilo.id = ID_ESTILO_PAGINA;
  estilo.textContent = `@page { size: A4 ${plano.orientacao === 'paisagem' ? 'landscape' : 'portrait'}; }`;
  document.head.append(estilo);
}

/** Tira as cópias da folha e a orientação da página. */
export function desmontarFolha(): void {
  for (const e of document.querySelectorAll('.tabela-impressao')) e.remove();
  document.getElementById(ID_ESTILO_PAGINA)?.remove();
}
