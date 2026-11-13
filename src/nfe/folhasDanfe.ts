// Folhas do DANFE na tela (painel Leitura da aba XML) e a orientação da
// Folha do PDF (painel da Conferência). Lógica pura, sem DOM: o renderer
// aplica. Só a tela muda com as Folhas; o papel e o PDF do DANFE saem sempre
// uma folha A4 retrato por página.

import type { Orientacao, OrientacaoConfig } from './folha';

/**
 * Como as folhas do DANFE ficam na tela: uma embaixo da outra, lado a lado
 * (quantas couberem na largura) ou uma ocupando a largura da área.
 */
export type ArranjoFolhas = 'uma' | 'lado' | 'largura';

export const ARRANJOS_FOLHAS: readonly ArranjoFolhas[] = [
  'uma',
  'lado',
  'largura',
];

export const ROTULO_FOLHAS: Record<ArranjoFolhas, string> = {
  uma: 'Uma de cada vez',
  lado: 'Lado a lado',
  largura: 'Ajustar à largura',
};

/** Limites do zoom do "Ajustar à largura" (área muito estreita ou larga). */
export const ZOOM_LARGURA_MIN = 0.25;
export const ZOOM_LARGURA_MAX = 3;

/**
 * Zoom para uma folha de `larguraFolha` px (em 100%), com `recuo` px de
 * espaço dos dois lados somados (o recuo também cresce com o zoom), caber em
 * `larguraArea` px. Arredondado para baixo em centésimos (nunca passa da
 * largura) e preso entre os limites. Área ou folha sem medida: 1.
 */
export function zoomParaLargura(
  larguraArea: number,
  larguraFolha: number,
  recuo: number,
): number {
  const total = larguraFolha + Math.max(0, recuo);
  if (!(larguraArea > 0) || !(total > 0)) return 1;
  const z = Math.floor((larguraArea / total) * 100) / 100;
  return Math.min(ZOOM_LARGURA_MAX, Math.max(ZOOM_LARGURA_MIN, z));
}

/**
 * Orientação da folha da Conferência: a escolhida na Folha do PDF (vale só
 * para a nota aberta nesta janela, para a tela, o Imprimir e o Salvar PDF;
 * não grava no perfil) ou, sem escolha, a do perfil.
 */
export function orientacaoDaFolha(
  escolhida: Orientacao | null,
  doPerfil: OrientacaoConfig,
): OrientacaoConfig {
  return escolhida ?? doPerfil;
}
