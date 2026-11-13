// Barra de rolagem da página, própria do app: só o polegar, fino, por cima do
// conteúdo e só na área que rola (abaixo da barra de título e da barra
// preta). A barra nativa da página não ocupa espaço (largura zero em
// janela.css): sem o "corredor" à direita, as barras do alto e o conteúdo vão
// até a borda da janela, e abrir uma janela por cima não muda a largura da
// página (ela não pula para o lado). As áreas com rolagem própria (.XML,
// Formato original, Configurações) continuam com a barra delas.

const trilho = document.createElement('div');
trilho.className = 'rolagem-pagina';
trilho.setAttribute('aria-hidden', 'true');
const polegar = document.createElement('div');
polegar.className = 'rolagem-pagina__polegar';
trilho.append(polegar);
document.body.append(trilho);

/** Altura mínima do polegar, em pixels. */
const POLEGAR_MINIMO = 32;

let agendado = false;

/** Topo da área que rola: a borda de baixo das barras do alto. */
function topoDaArea(): number {
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--altura-barra',
      ),
    ) || 0
  );
}

function atualizar(): void {
  agendado = false;
  const d = document.documentElement;
  const travada = getComputedStyle(d).overflowY === 'hidden';
  const total = d.scrollHeight;
  const visivel = d.clientHeight;
  const topo = topoDaArea();
  trilho.style.top = `${topo}px`;
  if (travada || total <= visivel + 1) {
    trilho.hidden = true;
    return;
  }
  trilho.hidden = false;
  const altura = Math.max(0, visivel - topo);
  // A parte da página que fica atrás das barras do alto não conta.
  const util = Math.max(1, total - topo);
  const tamanho = Math.max(POLEGAR_MINIMO, (altura * (visivel - topo)) / util);
  const curso = Math.max(0, altura - tamanho);
  const fracao = window.scrollY / Math.max(1, total - visivel);
  polegar.style.height = `${tamanho}px`;
  polegar.style.transform = `translateY(${Math.round(curso * Math.min(1, fracao))}px)`;
}

function agendar(): void {
  if (agendado) return;
  agendado = true;
  requestAnimationFrame(atualizar);
}

// Arrastar o polegar rola a página na mesma proporção.
polegar.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  polegar.setPointerCapture(e.pointerId);
  trilho.classList.add('rolagem-pagina--arrastando');
  const inicioY = e.clientY;
  const inicioRolagem = window.scrollY;
  const d = document.documentElement;
  const curso = trilho.clientHeight - polegar.offsetHeight;
  const maximo = d.scrollHeight - d.clientHeight;
  const mover = (ev: PointerEvent) => {
    if (curso <= 0) return;
    window.scrollTo(
      0,
      inicioRolagem + ((ev.clientY - inicioY) / curso) * maximo,
    );
  };
  const soltar = () => {
    trilho.classList.remove('rolagem-pagina--arrastando');
    polegar.removeEventListener('pointermove', mover);
    polegar.removeEventListener('pointerup', soltar);
    polegar.removeEventListener('pointercancel', soltar);
  };
  polegar.addEventListener('pointermove', mover);
  polegar.addEventListener('pointerup', soltar);
  polegar.addEventListener('pointercancel', soltar);
});

window.addEventListener('scroll', agendar, { passive: true });
window.addEventListener('resize', agendar);
new ResizeObserver(agendar).observe(document.body);
// Janela por cima (a página trava) e telas trocadas: o polegar acompanha.
new MutationObserver(agendar).observe(document.body, {
  attributes: true,
  subtree: true,
  attributeFilter: ['hidden', 'open'],
});
// --altura-barra muda no style da raiz (renderer.ts): o trilho começa nela.
new MutationObserver(agendar).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['style'],
});
agendar();
