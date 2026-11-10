// Conta da rolagem virtual: dada a posição da barra, quais linhas aparecem e
// onde ficam. O navegador não aceita uma área de rolagem de altura qualquer
// (milhões de linhas passariam do limite), então acima de MAXIMO_PX a barra
// passa a ser proporcional: o topo da barra é a primeira linha, o fim da
// barra é a última. Puro, sem DOM.

/** Altura máxima da área de rolagem, em pixels. */
export const MAXIMO_PX = 8_000_000;

export interface JanelaVisivel {
  /** Primeira linha desenhada. */
  primeira: number;
  /** Quantas linhas desenhar a partir dela. */
  quantas: number;
  /** Onde a primeira linha fica (pixels desde o topo da área de rolagem). */
  topo: number;
  /** Altura da área de rolagem. */
  alturaTotal: number;
}

const limitar = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export function calcularJanela(
  scrollTop: number,
  alturaVisivel: number,
  quantidade: number,
  alturaLinha: number,
  maximoPx = MAXIMO_PX,
): JanelaVisivel {
  const cabem = Math.max(1, Math.ceil(alturaVisivel / alturaLinha));
  if (quantidade * alturaLinha <= maximoPx) {
    const primeira = limitar(
      Math.floor(scrollTop / alturaLinha),
      0,
      Math.max(0, quantidade - 1),
    );
    return {
      primeira,
      quantas: Math.min(cabem + 1, quantidade - primeira),
      topo: primeira * alturaLinha,
      alturaTotal: quantidade * alturaLinha,
    };
  }
  const faixa = Math.max(1, maximoPx - alturaVisivel);
  const fracao = limitar(scrollTop / faixa, 0, 1);
  const inteiras = Math.floor(alturaVisivel / alturaLinha);
  const primeira = Math.round(fracao * Math.max(0, quantidade - inteiras));
  return {
    primeira,
    quantas: Math.min(cabem + 1, quantidade - primeira),
    topo: limitar(scrollTop, 0, faixa),
    alturaTotal: maximoPx,
  };
}

/**
 * scrollTop que mostra `linha`: no centro da área visível, ou só o mínimo
 * para ela aparecer (`'perto'`), a partir do scrollTop atual.
 */
export function rolagemParaLinha(
  linha: number,
  scrollTop: number,
  alturaVisivel: number,
  quantidade: number,
  alturaLinha: number,
  modo: 'centro' | 'perto',
  maximoPx = MAXIMO_PX,
): number {
  const atual = calcularJanela(
    scrollTop,
    alturaVisivel,
    quantidade,
    alturaLinha,
    maximoPx,
  );
  const inteiras = Math.max(1, Math.floor(alturaVisivel / alturaLinha));
  if (modo === 'perto' && linha >= atual.primeira) {
    if (linha < atual.primeira + inteiras) return scrollTop;
  }
  let alvo: number;
  if (modo === 'centro') alvo = linha - Math.floor(inteiras / 2);
  else if (linha < atual.primeira) alvo = linha;
  else alvo = linha - inteiras + 1;
  alvo = limitar(alvo, 0, Math.max(0, quantidade - inteiras));
  if (quantidade * alturaLinha <= maximoPx) return alvo * alturaLinha;
  const faixa = Math.max(1, maximoPx - alturaVisivel);
  const total = Math.max(1, quantidade - inteiras);
  return (alvo / total) * faixa;
}
