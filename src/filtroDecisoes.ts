// Decisões lembradas da ferramenta "ST, MVA e CFOP" na aba Decisões das
// Configurações: o texto de cada decisão, o tipo (para o filtro) e a busca
// por fornecedor, produto e NCM. Lógica pura (sem DOM, sem Electron).

import {
  ROTULO_FINALIDADE,
  ROTULO_LUBRIFICANTE,
  textoMva,
  type DecisaoLembrada,
} from './fiscal/entrada';

/** Tipos do filtro. "historico": escolhida pelo "Usar" da sugestão do histórico. */
export const TIPOS_DECISAO = [
  'linha',
  'sem-st',
  'manual',
  'apendice-xiv',
  'historico',
] as const;
export type TipoDecisao = (typeof TIPOS_DECISAO)[number];

export const ROTULO_TIPO_DECISAO: Record<TipoDecisao, string> = {
  linha: 'Linha da planilha',
  'sem-st': 'Sem ST',
  manual: 'CFOP manual',
  'apendice-xiv': 'Apêndice XIV',
  historico: 'Histórico',
};

/** Os tipos em que a decisão entra (uma do histórico entra também no da escolha). */
export function tiposDaDecisao(d: DecisaoLembrada): TipoDecisao[] {
  const r: TipoDecisao[] = [];
  const e = d.escolha;
  if (e?.tipo === 'candidato') r.push('linha');
  else if (e?.tipo === 'sem-st') r.push('sem-st');
  else if (e?.tipo === 'manual') r.push('manual');
  else if (e?.tipo === 'apendice-xiv') r.push('apendice-xiv');
  if (d.origem === 'histórico') r.push('historico');
  return r;
}

/** "Sem ST · Revenda", "Autopeças, CEST 01.001.00 · Uso e consumo"... */
export function textoDecisao(d: DecisaoLembrada): string {
  const e = d.escolha;
  return [
    e === null
      ? null
      : e.tipo === 'sem-st'
        ? 'Sem ST'
        : e.tipo === 'apendice-xiv'
          ? `Apêndice XIV: ${ROTULO_LUBRIFICANTE[e.lubrificante]}`
          : e.tipo === 'manual'
            ? `CFOP manual ${e.cfop}${e.mva === null ? '' : `, MVA ${textoMva(e.mva)}`}: ${e.motivo}`
            : `${e.segmento}, CEST ${e.cest}`,
    ROTULO_FINALIDADE[d.finalidade],
    d.origem === 'histórico' ? 'pelo histórico' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Sem acento, minúsculo e sem pontuação de NCM e CNPJ. */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.\-/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface FiltroDecisoes {
  /** Texto livre: fornecedor (nome ou raiz do CNPJ), produto (código ou descrição) e NCM. */
  busca: string;
  /** null: todos os tipos. */
  tipo: TipoDecisao | null;
}

/**
 * Decisões que passam no filtro, na ordem de `lista`. Cada palavra da busca
 * precisa aparecer em algum dos campos (fornecedor, CNPJ, código,
 * descrição, NCM).
 */
export function filtrarDecisoes(
  lista: readonly DecisaoLembrada[],
  filtro: FiltroDecisoes,
): DecisaoLembrada[] {
  const palavras = normalizar(filtro.busca).split(' ').filter(Boolean);
  return lista.filter((d) => {
    if (filtro.tipo && !tiposDaDecisao(d).includes(filtro.tipo)) return false;
    if (palavras.length === 0) return true;
    const alvo = normalizar(
      [d.fornecedor, d.raizCnpj, d.cProd, d.xProd, d.ncm].join(' '),
    );
    return palavras.every((p) => alvo.includes(p));
  });
}

/** Quantas decisões há de cada tipo (para os rótulos do filtro). */
export function contagemPorTipo(
  lista: readonly DecisaoLembrada[],
): Record<TipoDecisao, number> {
  const r = Object.fromEntries(TIPOS_DECISAO.map((t) => [t, 0])) as Record<
    TipoDecisao,
    number
  >;
  for (const d of lista) for (const t of tiposDaDecisao(d)) r[t]++;
  return r;
}
