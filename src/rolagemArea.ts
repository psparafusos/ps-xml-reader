// Barras de rolagem da área do documento (Conferência e Documento), no mesmo
// visual da rolagem da página (src/rolagemPagina.ts): por cima do conteúdo,
// sem ocupar largura. Em repouso, finas e discretas; com o mouse em cima ou
// durante a rolagem, mais grossas e visíveis. O polegar arrasta; o clique no
// trilho rola uma página. A horizontal só aparece quando o documento é mais
// largo que a área, e começa depois do painel que ocupa a altura toda à
// esquerda. A barra nativa da área não ocupa espaço (janela.css).
//
// Também rola a área pelo teclado (setas, Page Up e Page Down, espaço, Home e
// End) quando o foco não está num campo: a área não recebe o foco sozinha.

export interface RolagemArea {
  /** Recalcula tamanho e posição das barras (zoom, tela ou painel trocados). */
  atualizar(): void;
}

/** Tamanho mínimo do polegar, em pixels. */
const POLEGAR_MINIMO = 32;
/** Largura da faixa que recebe o mouse (o polegar fica dentro dela). */
const TRILHO = 14;
/** Quanto tempo a barra fica visível depois da última rolagem. */
const VISIVEL_MS = 900;
/** Passo das setas do teclado, em pixels. */
const PASSO_SETA = 40;
/** Sobra de uma página para a seguinte (Page Down, clique no trilho). */
const SOBRA_PAGINA = 40;

type Eixo = 'v' | 'h';

interface Barra {
  eixo: Eixo;
  trilho: HTMLDivElement;
  polegar: HTMLDivElement;
}

function criarBarra(eixo: Eixo): Barra {
  const trilho = document.createElement('div');
  trilho.className = `rolagem-area rolagem-area--${eixo}`;
  trilho.setAttribute('aria-hidden', 'true');
  trilho.hidden = true;
  const polegar = document.createElement('div');
  polegar.className = 'rolagem-area__polegar';
  trilho.append(polegar);
  document.body.append(trilho);
  return { eixo, trilho, polegar };
}

/** O alvo do teclado é um campo, botão ou algo que usa as teclas sozinho? */
function focoUsaTeclas(alvo: Element | null): boolean {
  if (!alvo || alvo === document.body || alvo === document.documentElement)
    return false;
  return true;
}

export function criarRolagemArea(
  area: HTMLElement,
  opcoes: {
    /**
     * Borda esquerda (na janela) da parte da área que não fica atrás de um
     * painel. A barra horizontal começa nela.
     */
    inicioVisivel(): number;
    /** Elementos que, ao mudar, mexem no tamanho ou na posição das barras. */
    observar: HTMLElement[];
  },
): RolagemArea {
  const v = criarBarra('v');
  const h = criarBarra('h');
  let agendado = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  function marcarAtiva(): void {
    for (const b of [v, h]) b.trilho.classList.add('rolagem-area--ativa');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      for (const b of [v, h]) b.trilho.classList.remove('rolagem-area--ativa');
    }, VISIVEL_MS);
  }

  function atualizar(): void {
    agendado = false;
    const visivel = !area.hidden && area.getClientRects().length > 0;
    const travada = visivel && getComputedStyle(area).overflow === 'hidden';
    const rolaV = visivel && area.scrollHeight > area.clientHeight + 1;
    const rolaH = visivel && area.scrollWidth > area.clientWidth + 1;
    v.trilho.hidden = !rolaV || travada;
    h.trilho.hidden = !rolaH || travada;
    if (!visivel) return;
    const r = area.getBoundingClientRect();
    const canto = rolaV && rolaH ? TRILHO : 0;

    if (rolaV) {
      const altura = Math.max(0, r.height - canto);
      v.trilho.style.top = `${r.top}px`;
      v.trilho.style.left = `${r.right - TRILHO}px`;
      v.trilho.style.height = `${altura}px`;
      const tamanho = Math.max(
        POLEGAR_MINIMO,
        (altura * area.clientHeight) / area.scrollHeight,
      );
      const curso = Math.max(0, altura - tamanho);
      const maximo = Math.max(1, area.scrollHeight - area.clientHeight);
      v.polegar.style.height = `${tamanho}px`;
      v.polegar.style.transform = `translateY(${Math.round(
        curso * Math.min(1, area.scrollTop / maximo),
      )}px)`;
    }

    if (rolaH) {
      const esquerda = Math.min(
        r.right - canto - POLEGAR_MINIMO,
        Math.max(r.left, opcoes.inicioVisivel()),
      );
      const largura = Math.max(0, r.right - canto - esquerda);
      h.trilho.style.top = `${r.bottom - TRILHO}px`;
      h.trilho.style.left = `${esquerda}px`;
      h.trilho.style.width = `${largura}px`;
      const tamanho = Math.max(
        POLEGAR_MINIMO,
        (largura * area.clientWidth) / area.scrollWidth,
      );
      const curso = Math.max(0, largura - tamanho);
      const maximo = Math.max(1, area.scrollWidth - area.clientWidth);
      h.polegar.style.width = `${tamanho}px`;
      h.polegar.style.transform = `translateX(${Math.round(
        curso * Math.min(1, area.scrollLeft / maximo),
      )}px)`;
    }
  }

  function agendar(): void {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(atualizar);
  }

  /** Arrastar o polegar rola a área na mesma proporção. */
  function arrastar(b: Barra): void {
    // Mouse em cima: a barra engrossa (classe, além do :hover do CSS).
    b.trilho.addEventListener('pointerenter', () =>
      b.trilho.classList.add('rolagem-area--sobre'),
    );
    b.trilho.addEventListener('pointerleave', () =>
      b.trilho.classList.remove('rolagem-area--sobre'),
    );
    b.polegar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      b.polegar.setPointerCapture(e.pointerId);
      b.trilho.classList.add('rolagem-area--arrastando');
      const vertical = b.eixo === 'v';
      const inicio = vertical ? e.clientY : e.clientX;
      const inicioRolagem = vertical ? area.scrollTop : area.scrollLeft;
      const curso = vertical
        ? b.trilho.clientHeight - b.polegar.offsetHeight
        : b.trilho.clientWidth - b.polegar.offsetWidth;
      const maximo = vertical
        ? area.scrollHeight - area.clientHeight
        : area.scrollWidth - area.clientWidth;
      const mover = (ev: PointerEvent) => {
        if (curso <= 0) return;
        const andou = ((vertical ? ev.clientY : ev.clientX) - inicio) / curso;
        const alvo = inicioRolagem + andou * maximo;
        if (vertical) area.scrollTop = alvo;
        else area.scrollLeft = alvo;
      };
      const soltar = () => {
        b.trilho.classList.remove('rolagem-area--arrastando');
        b.polegar.removeEventListener('pointermove', mover);
        b.polegar.removeEventListener('pointerup', soltar);
        b.polegar.removeEventListener('pointercancel', soltar);
      };
      b.polegar.addEventListener('pointermove', mover);
      b.polegar.addEventListener('pointerup', soltar);
      b.polegar.addEventListener('pointercancel', soltar);
    });

    // Clique no trilho, fora do polegar: uma página na direção do clique.
    b.trilho.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== b.trilho) return;
      e.preventDefault();
      const p = b.polegar.getBoundingClientRect();
      if (b.eixo === 'v') {
        const sentido = e.clientY < p.top ? -1 : 1;
        area.scrollBy({
          top: sentido * Math.max(PASSO_SETA, area.clientHeight - SOBRA_PAGINA),
        });
      } else {
        const sentido = e.clientX < p.left ? -1 : 1;
        area.scrollBy({
          left: sentido * Math.max(PASSO_SETA, area.clientWidth - SOBRA_PAGINA),
        });
      }
    });
  }
  arrastar(v);
  arrastar(h);

  area.addEventListener(
    'scroll',
    () => {
      marcarAtiva();
      agendar();
    },
    { passive: true },
  );
  window.addEventListener('resize', agendar);
  const tamanho = new ResizeObserver(agendar);
  tamanho.observe(area);
  for (const filho of area.children) tamanho.observe(filho);
  // Zoom (style), tela trocada (hidden), folhas e o documento montado.
  new MutationObserver(agendar).observe(area, {
    attributes: true,
    subtree: true,
    childList: true,
    attributeFilter: ['style', 'hidden', 'data-folhas'],
  });
  for (const e of opcoes.observar)
    new MutationObserver(agendar).observe(e, {
      attributes: true,
      attributeFilter: ['hidden', 'data-estado', 'data-layout', 'style'],
    });
  // Janela por cima (a área trava) e --altura-barra no style da raiz.
  new MutationObserver(agendar).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
  });
  new MutationObserver(agendar).observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['open'],
  });

  // Teclado: só com o foco solto na página (nenhum campo ou botão), sem
  // janela por cima. Com o foco num campo, as teclas são dele.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.metaKey) return;
    if (area.hidden || document.querySelector('dialog:modal')) return;
    if (focoUsaTeclas(document.activeElement)) return;
    const pagina = Math.max(PASSO_SETA, area.clientHeight - SOBRA_PAGINA);
    let top = 0;
    let left = 0;
    let absoluto: number | null = null;
    switch (e.key) {
      case 'ArrowDown':
        top = PASSO_SETA;
        break;
      case 'ArrowUp':
        top = -PASSO_SETA;
        break;
      case 'ArrowRight':
        left = PASSO_SETA;
        break;
      case 'ArrowLeft':
        left = -PASSO_SETA;
        break;
      case 'PageDown':
        top = pagina;
        break;
      case 'PageUp':
        top = -pagina;
        break;
      case ' ':
        top = e.shiftKey ? -pagina : pagina;
        break;
      case 'Home':
        absoluto = 0;
        break;
      case 'End':
        absoluto = area.scrollHeight;
        break;
      default:
        return;
    }
    // Ctrl só vale com Home e End (início e fim do documento).
    if (e.ctrlKey && absoluto === null) return;
    e.preventDefault();
    if (absoluto !== null) area.scrollTop = absoluto;
    else area.scrollBy({ top, left });
  });

  agendar();
  return {
    atualizar(): void {
      agendar();
    },
  };
}
