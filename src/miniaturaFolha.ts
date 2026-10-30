// Miniatura da folha A4 no painel Editar colunas: a cópia da tabela para a
// folha (tabela--folha, as mesmas regras de CSS do papel) desenhada em
// tamanho real e reduzida por escala. As larguras das colunas não vêm do
// navegador: vêm do plano (a régua que o PDF usa), então a miniatura mostra
// o que o PDF vai fazer. Quando a tabela não cabe, as colunas que vão para a
// folha 2 em diante ficam depois da borda, sombreadas.

import { el } from './dom';
import {
  avisosMiniatura,
  MARGEM_FOLHA_MM,
  miniaturaDoPlano,
  ROTULO_ORIENTACAO,
  type PlanoFolha,
} from './nfe/folha';

/**
 * `tabela`: cópia para a folha (copiaParaFolha) com os itens a mostrar.
 * `daNota`: o plano foi medido com os itens da nota aberta.
 */
export function desenharMiniatura(
  tabela: HTMLTableElement,
  plano: PlanoFolha,
  daNota: boolean,
): HTMLElement {
  const m = miniaturaDoPlano(plano);
  const avisos = avisosMiniatura(m);
  const ids = m.colunas.map((c) => c.id);
  const fora = new Set(m.colunas.filter((c) => !c.naFolha).map((c) => c.id));

  // Colunas na ordem da folha 1, larguras fixas da régua.
  const titulos = [...tabela.querySelectorAll<HTMLElement>('thead th')].map(
    (th) => th.dataset.coluna ?? '',
  );
  const posicoes = ids.map((id) => titulos.indexOf(id));
  for (const tr of tabela.querySelectorAll('tr')) {
    if (tr.classList.contains('item__linha-adicional')) continue;
    const celulas = [...tr.children];
    tr.replaceChildren(...posicoes.map((i) => celulas[i]).filter(Boolean));
    tr.querySelectorAll<HTMLElement>(':scope > *').forEach((c, i) => {
      if (fora.has(ids[i])) c.classList.add('miniatura__fora');
    });
  }
  tabela.prepend(
    el(
      'colgroup',
      '',
      ...m.colunas.map((c) => {
        const col = el('col');
        col.style.width = `${c.mm}mm`;
        return col;
      }),
    ),
  );
  const total = m.colunas.reduce((t, c) => t + c.mm, 0);
  tabela.classList.add('miniatura__tabela');
  tabela.style.width = `${total}mm`;

  // A área útil corta as linhas no pé da folha, mas deixa a tabela passar
  // da borda direita.
  const folha = el(
    'div',
    'miniatura__folha',
    el('div', 'miniatura__area', tabela),
  );
  folha.style.setProperty('--fs-tabela-folha', `${plano.fontePt}pt`);
  // Largura do desenho: a folha, ou mais, se a tabela passar da borda.
  const largura = Math.max(m.folha.largura, MARGEM_FOLHA_MM + total);
  const palco = el('div', 'miniatura__palco', folha);
  palco.style.setProperty('--folha-largura', String(m.folha.largura));
  palco.style.setProperty('--folha-altura', String(m.folha.altura));
  palco.style.setProperty('--palco-largura', String(largura));
  palco.style.setProperty('--folha-margem', String(MARGEM_FOLHA_MM));

  if (avisos.divisao) {
    const corte = el(
      'div',
      'miniatura__corte',
      el('span', 'miniatura__corte-texto', avisos.divisao),
    );
    palco.append(corte);
  }

  const legenda = el(
    'p',
    'miniatura__legenda',
    `Folha A4 em ${ROTULO_ORIENTACAO[m.orientacao].toLowerCase()}, em escala. `,
    daNota
      ? 'Larguras medidas com os itens da nota aberta.'
      : 'Larguras medidas com itens de exemplo (nenhuma nota aberta).',
  );
  const fonte =
    avisos.fonte &&
    el(
      'p',
      'miniatura__fonte',
      avisos.fonte[0].toUpperCase() + avisos.fonte.slice(1),
    );

  const caixa = el(
    'div',
    'miniatura',
    el('div', 'miniatura__rolagem', palco),
    fonte,
    legenda,
  );
  caixa.dataset.orientacao = m.orientacao;
  return caixa;
}
