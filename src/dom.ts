// Utilitários de DOM usados pela tela e pelo editor de colunas. Texto entra
// por append (vira nó de texto), nunca por innerHTML.

export type Filho = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  for (const c of filhos) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c);
  }
  return e;
}

/** Ícone de linhas (caminhos SVG), no mesmo traço dos ícones da barra. */
export function icone(...caminhos: string[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icone');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of caminhos) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/**
 * Envolve uma área que rola na horizontal com setas nas laterais. A seta (e
 * uma sombra na borda) aparece só no lado em que há conteúdo escondido;
 * clicar rola quase uma largura da área. Atualiza ao rolar, ao mudar de
 * tamanho e quando o conteúdo da área é trocado. Na impressão as setas somem.
 */
export function comSetasDeRolagem(rolagem: HTMLElement): HTMLElement {
  const seta = (lado: 'esquerda' | 'direita', caminho: string) => {
    const b = botao(`rolagem__seta rolagem__seta--${lado}`, icone(caminho));
    b.title =
      lado === 'esquerda'
        ? 'Ver as colunas à esquerda'
        : 'Ver as colunas à direita';
    b.setAttribute('aria-label', b.title);
    // Fora da ordem do Tab: quem usa teclado rola a tabela pelos próprios campos.
    b.tabIndex = -1;
    b.hidden = true;
    b.addEventListener('click', () =>
      rolagem.scrollBy({
        left: (lado === 'esquerda' ? -1 : 1) * rolagem.clientWidth * 0.8,
        behavior: 'smooth',
      }),
    );
    return b;
  };
  const esquerda = seta('esquerda', 'M15 6l-6 6 6 6');
  const direita = seta('direita', 'M9 6l6 6-6 6');
  const caixa = el('div', 'rolagem', rolagem, esquerda, direita);

  const atualizar = () => {
    const resto =
      rolagem.scrollWidth - rolagem.clientWidth - rolagem.scrollLeft;
    const temEsquerda = rolagem.scrollLeft > 1;
    const temDireita = resto > 1;
    esquerda.hidden = !temEsquerda;
    direita.hidden = !temDireita;
    caixa.classList.toggle('rolagem--esquerda', temEsquerda);
    caixa.classList.toggle('rolagem--direita', temDireita);
  };
  rolagem.addEventListener('scroll', atualizar, { passive: true });
  const tamanho = new ResizeObserver(atualizar);
  const observarConteudo = () => {
    tamanho.disconnect();
    tamanho.observe(rolagem);
    for (const filho of rolagem.children) tamanho.observe(filho);
  };
  new MutationObserver(() => {
    observarConteudo();
    atualizar();
  }).observe(rolagem, { childList: true });
  observarConteudo();
  return caixa;
}

/** Botão type="button" com classe e conteúdo. */
export function botao(classe: string, ...filhos: Filho[]): HTMLButtonElement {
  const b = el('button', classe, ...filhos);
  b.type = 'button';
  return b;
}
