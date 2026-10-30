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
  /** Largura de cada coluna (mm) na fonte do plano, na ordem da tabela. */
  larguras: LargurasColunas;
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
        return {
          orientacao,
          fontePt,
          partes: [l.map((c) => c.id)],
          larguras: l,
        };
    }
  }
  const orientacao = orientacoes[orientacoes.length - 1];
  const fontePt = FONTE_MINIMA_PT;
  const larguras = medidas.get(fontePt) ?? [];
  return {
    orientacao,
    fontePt,
    partes: dividirColunas(larguras, larguraUtilMm(orientacao)),
    larguras,
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

/** Uma coluna desenhada na miniatura da folha, em mm a partir da margem. */
export interface ColunaMiniatura {
  id: string;
  x: number;
  mm: number;
  /** false: vai para a folha 2 em diante (sombreada na miniatura). */
  naFolha: boolean;
}

export interface Miniatura {
  orientacao: Orientacao;
  /** Folha inteira, em mm. */
  folha: { largura: number; altura: number };
  /** Largura útil (sem as margens), em mm. */
  util: number;
  /**
   * Colunas na ordem da folha 1: primeiro as que ficam nela, depois as que
   * passam para as próximas folhas (as fixas não se repetem aqui).
   */
  colunas: ColunaMiniatura[];
  /** Folhas que a tabela ocupa (1 se cabe). */
  folhas: number;
  /** Fonte reduzida pelo plano, em pt; null se ficou no tamanho normal. */
  fonteReduzida: number | null;
}

/**
 * Como desenhar a folha em escala a partir do plano (a mesma régua do PDF).
 * Cabe numa folha: a descrição estica até a largura útil, como no papel.
 * Não cabe: a descrição fica no mínimo medido, e as colunas que não estão na
 * folha 1 vêm depois, passando da borda.
 */
export function miniaturaDoPlano(plano: PlanoFolha): Miniatura {
  const util = larguraUtilMm(plano.orientacao);
  const naFolha = new Set(plano.partes[0] ?? []);
  const primeiras = plano.larguras.filter((c) => naFolha.has(c.id));
  const demais = plano.larguras.filter((c) => !naFolha.has(c.id));
  const sobra = util - soma(primeiras);
  const esticar =
    plano.partes.length === 1 && sobra > 0
      ? primeiras.find((c) => c.id === 'descricao')
      : undefined;
  let x = 0;
  const colunas = [...primeiras, ...demais].map((c) => {
    const mm = c === esticar ? c.mm + sobra : c.mm;
    const col = { id: c.id, x, mm, naFolha: naFolha.has(c.id) };
    x += mm;
    return col;
  });
  const retrato = plano.orientacao === 'retrato';
  return {
    orientacao: plano.orientacao,
    folha: {
      largura: retrato ? A4.largura : A4.altura,
      altura: retrato ? A4.altura : A4.largura,
    },
    util,
    colunas,
    folhas: plano.partes.length,
    fonteReduzida: plano.fontePt < FONTE_TABELA_PT ? plano.fontePt : null,
  };
}

/** Número em pt com vírgula: 7.25 vira "7,25". */
export const formatarPt = (pt: number) => String(pt).replace('.', ',');

/** Avisos escritos na miniatura (letra reduzida, divisão em folhas). */
export function avisosMiniatura(m: Miniatura): {
  fonte: string | null;
  divisao: string | null;
} {
  return {
    fonte:
      m.fonteReduzida === null
        ? null
        : `letra reduzida para ${formatarPt(m.fonteReduzida)} pt`,
    divisao:
      m.folhas <= 1
        ? null
        : m.folhas === 2
          ? 'daqui em diante vai para a folha 2'
          : `daqui em diante vai para as folhas 2 ${m.folhas === 3 ? 'e' : 'a'} ${m.folhas}`,
  };
}
