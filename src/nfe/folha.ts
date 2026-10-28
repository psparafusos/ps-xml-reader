// Folha A4 da Conferência: medidas, largura útil por orientação e o plano de
// como a tabela de itens cabe nela. É a referência única de largura da folha:
// a tabela usa agora e os blocos em grade de 12 colunas (Parte B) vão usar a
// mesma. Lógica pura: as larguras das colunas chegam medidas de fora.

export type Orientacao = 'retrato' | 'paisagem';
export type OrientacaoConfig = 'automatica' | Orientacao;

export const ORIENTACOES_CONFIG: readonly OrientacaoConfig[] = [
  'automatica',
  'retrato',
  'paisagem',
];

export const ROTULO_ORIENTACAO: Record<OrientacaoConfig, string> = {
  automatica: 'Automática',
  retrato: 'Retrato',
  paisagem: 'Paisagem',
};

/** A4 em mm. */
export const A4 = { largura: 210, altura: 297 } as const;

/** Margem da Conferência nos quatro lados, em mm (PDF e impressão). */
export const MARGEM_FOLHA_MM = 10;

const PX_POR_MM = 96 / 25.4;
export const mmParaPx = (mm: number) => mm * PX_POR_MM;
export const pxParaMm = (px: number) => px / PX_POR_MM;

/** Largura útil da folha (sem as margens), em mm. */
export function larguraUtilMm(o: Orientacao): number {
  const largura = o === 'retrato' ? A4.largura : A4.altura;
  return largura - 2 * MARGEM_FOLHA_MM;
}

/** Fonte da tabela na folha: começa no tamanho normal e desce até 7 pt. */
export const FONTE_TABELA_PT = 7.5;
export const FONTE_MINIMA_PT = 7;
const PASSO_FONTE_PT = 0.25;

/** Fontes a tentar, da maior para a menor. */
export function fontesTabela(): number[] {
  const fontes: number[] = [];
  for (
    let f = FONTE_TABELA_PT;
    f >= FONTE_MINIMA_PT - 1e-9;
    f -= PASSO_FONTE_PT
  )
    fontes.push(Math.round(f * 100) / 100);
  return fontes;
}

/** Largura de cada coluna (id, mm), na ordem da tabela, para uma fonte. */
export type LargurasColunas = { id: string; mm: number }[];

export interface PlanoFolha {
  orientacao: Orientacao;
  fontePt: number;
  /**
   * Colunas de cada parte da tabela. Uma parte só: cabe numa folha. Mais de
   * uma: a tabela é dividida, cada parte numa folha, repetindo as colunas
   * fixas (Nº, Código, Descrição).
   */
  partes: string[][];
}

/** Colunas repetidas em todas as partes quando a tabela é dividida. */
export const COLUNAS_FIXAS = ['nItem', 'codigo', 'descricao'];

const soma = (l: LargurasColunas) => l.reduce((t, c) => t + c.mm, 0);

/**
 * Como a tabela vai para a folha. Automática: retrato se couber, senão
 * paisagem. Na orientação em uso, a fonte desce de 0,25 em 0,25 pt até 7 pt;
 * se nem assim couber, as colunas são divididas em partes, cada uma do
 * tamanho da largura útil, com as fixas repetidas.
 */
export function planejarFolha(
  config: OrientacaoConfig,
  medir: (fontePt: number) => LargurasColunas,
): PlanoFolha {
  const orientacoes: Orientacao[] =
    config === 'automatica' ? ['retrato', 'paisagem'] : [config];
  const fontes = fontesTabela();
  const medidas = new Map(fontes.map((f) => [f, medir(f)]));
  for (const orientacao of orientacoes) {
    const util = larguraUtilMm(orientacao);
    for (const fontePt of fontes) {
      const l = medidas.get(fontePt) ?? [];
      if (soma(l) <= util)
        return { orientacao, fontePt, partes: [l.map((c) => c.id)] };
    }
  }
  const orientacao = orientacoes[orientacoes.length - 1];
  const fontePt = FONTE_MINIMA_PT;
  return {
    orientacao,
    fontePt,
    partes: dividirColunas(
      medidas.get(fontePt) ?? [],
      larguraUtilMm(orientacao),
    ),
  };
}

/**
 * Divide as colunas em partes que cabem em `util` mm. As fixas vão em todas;
 * as demais entram na ordem, enquanto couberem. Coluna sozinha maior que o
 * espaço que sobra vai numa parte só dela (com as fixas).
 */
export function dividirColunas(
  larguras: LargurasColunas,
  util: number,
): string[][] {
  const fixas = larguras.filter((c) => COLUNAS_FIXAS.includes(c.id));
  const resto = larguras.filter((c) => !COLUNAS_FIXAS.includes(c.id));
  const base = soma(fixas);
  const partes: LargurasColunas[] = [];
  let atual: LargurasColunas = [];
  for (const c of resto) {
    if (atual.length > 0 && base + soma(atual) + c.mm > util) {
      partes.push(atual);
      atual = [];
    }
    atual.push(c);
  }
  if (atual.length > 0 || partes.length === 0) partes.push(atual);
  // Cada parte na ordem da tabela, com as fixas no lugar delas.
  return partes.map((p) => {
    const ids = new Set([...fixas, ...p].map((c) => c.id));
    return larguras.filter((c) => ids.has(c.id)).map((c) => c.id);
  });
}

/** Texto do indicador do editor de colunas. */
export function descreverPlano(p: PlanoFolha): string {
  if (p.partes.length > 1) return 'Não cabe numa folha';
  return p.orientacao === 'retrato' ? 'Cabe em retrato' : 'Cabe em paisagem';
}
