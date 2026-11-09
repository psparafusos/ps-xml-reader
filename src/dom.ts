// Utilitários de DOM usados pela tela e pelo editor de colunas. Texto entra
// por append (vira nó de texto), nunca por innerHTML.

import { VISUAL_ESTADO, type EstadoVisivel } from './estadoDocumentos';
import { ICONE_SINAL, ICONES, type SinalEstado } from './icones';

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

/**
 * Teclado de um menu de opções (seletor de perfil, largura da anotação):
 * setas para cima e para baixo (dando a volta), Home e End movem o foco;
 * Esc fecha e volta ao botão; Tab fecha e segue. Esc não chega ao painel.
 */
export function navegarMenu(
  e: KeyboardEvent,
  opcoes: HTMLElement[],
  fechar: (focarBotao: boolean) => void,
): void {
  const i = opcoes.indexOf(document.activeElement as HTMLElement);
  const n = opcoes.length;
  if (e.key === 'Escape') {
    e.stopPropagation();
    fechar(true);
  } else if (e.key === 'ArrowDown') opcoes[(i + 1) % n]?.focus();
  else if (e.key === 'ArrowUp') opcoes[(i - 1 + n) % n]?.focus();
  else if (e.key === 'Home') opcoes[0]?.focus();
  else if (e.key === 'End') opcoes[n - 1]?.focus();
  else if (e.key === 'Tab') fechar(false);
  else return;
  if (e.key !== 'Tab') e.preventDefault();
}

/**
 * Ícone de estado do app (ok, informativo, aviso, erro, opcional): o mesmo
 * desenho, tamanho e traço em todo lugar, com a cor do estado (CSS,
 * .icone-estado--*). Só desenho: o texto do estado fica ao lado ou no
 * aria-label de quem o usa.
 */
export function iconeSinal(sinal: SinalEstado): SVGSVGElement {
  const svg = icone(...ICONES[ICONE_SINAL[sinal]]);
  svg.classList.add('icone-estado', `icone-estado--${sinal}`);
  return svg;
}

/**
 * Ícone do estado de um documento de referência (ok, aviso, faltando,
 * opcional), pelo mapa de src/estadoDocumentos.ts.
 */
export function iconeEstado(estado: EstadoVisivel): SVGSVGElement {
  return iconeSinal(VISUAL_ESTADO[estado]);
}

/** Ícone do estado com o texto curto ao lado (nunca só a cor). */
export function marcaEstado(estado: EstadoVisivel, texto: string): HTMLElement {
  return el(
    'span',
    `estado estado--${estado}`,
    iconeEstado(estado),
    el('span', 'estado__texto', texto),
  );
}

/**
 * Semáforo: bolinha verde, amarela ou vermelha com o texto curto ao lado
 * (nunca só a cor). Os documentos de referência usam no cartão e no rodapé.
 */
export function semaforo(
  cor: 'verde' | 'amarela' | 'vermelha' | 'neutra',
  texto: string,
): HTMLElement {
  return el(
    'span',
    `semaforo semaforo--${cor}`,
    el('span', 'semaforo__bolinha'),
    el('span', 'semaforo__texto', texto),
  );
}
