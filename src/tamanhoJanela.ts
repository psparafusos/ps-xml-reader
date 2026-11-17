// Tamanho mínimo e padrão da janela e a leitura do tamanho e da posição
// salvos (config.json, chave "janela"). Sem Electron: o main passa as áreas
// de trabalho dos monitores, e os testes chamam direto.

// Tamanho mínimo da janela (bordas e barra de título incluídas, em pixels
// lógicos). Largura: metade de uma tela de 1366 a 100% (683), para encaixar o
// PS Reader na metade da tela ao lado do ERP; abaixo de 680 o DANFE ajustado
// à largura fica pequeno demais para ler (medição de 17/11/2026). Altura:
// 1366 x 768 com escala de 125% no Windows dá 614,4 de altura; menos a barra
// de tarefas do Windows 11 (48), a área de trabalho tem 566,4, e a janela
// maximizada precisa caber nela: 560, com folga.
export const LARGURA_MINIMA = 680;
export const ALTURA_MINIMA = 560;
export const LARGURA_PADRAO = 1280;
export const ALTURA_PADRAO = 860;

export interface EstadoJanela {
  x: number;
  y: number;
  width: number;
  height: number;
  maximizada: boolean;
}

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Faixa do alto da janela (barra de título) que precisa estar dentro da área
 * de trabalho de algum monitor para a posição salva valer: com ela a pessoa
 * consegue pegar e arrastar a janela.
 */
export const FAIXA_VISIVEL = { largura: 120, altura: 30 };

/**
 * O tamanho e a posição salvos, ou null se não servem (faltando ou com
 * número inválido). Largura ou altura abaixo do mínimo sobem para o mínimo
 * (a posição continua a gravada): a janela nunca fica menor que o mínimo, e
 * o que a pessoa arrumou não é jogado fora.
 */
export function estadoSalvo(e: unknown): EstadoJanela | null {
  if (typeof e !== 'object' || e === null) return null;
  const o = e as Record<string, unknown>;
  const numeros = ['x', 'y', 'width', 'height'].every(
    (k) => typeof o[k] === 'number' && Number.isFinite(o[k]),
  );
  if (!numeros || typeof o.maximizada !== 'boolean') return null;
  const [x, y, width, height] = [o.x, o.y, o.width, o.height] as number[];
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(LARGURA_MINIMA, Math.round(width)),
    height: Math.max(ALTURA_MINIMA, Math.round(height)),
    maximizada: o.maximizada,
  };
}

/** true se a barra de título cai na área de trabalho de algum monitor. */
export function posicaoVisivel(j: EstadoJanela, areas: Area[]): boolean {
  return areas.some((a) => {
    const largura = Math.min(j.x + j.width, a.x + a.width) - Math.max(j.x, a.x);
    const altura =
      Math.min(j.y + FAIXA_VISIVEL.altura, a.y + a.height) - Math.max(j.y, a.y);
    return largura >= FAIXA_VISIVEL.largura && altura >= FAIXA_VISIVEL.altura;
  });
}
