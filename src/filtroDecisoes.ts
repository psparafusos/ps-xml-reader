// Decisões lembradas na aba Decisões das Configurações: as da ferramenta
// "ST, MVA e CFOP" e as do código da casa (coluna Código da casa). O texto
// de cada decisão, o tipo (para o filtro) e a busca por fornecedor, produto
// e NCM. Lógica pura (sem DOM, sem Electron).

import {
  chaveCodigoCasa,
  escolhaDaDecisao,
  TEXTO_NENHUM,
  textoConversao,
  type DecisaoCodigoCasa,
} from './cadastro/codigoCasa';
import {
  chaveDecisao,
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
  'codigo-casa',
] as const;
export type TipoDecisao = (typeof TIPOS_DECISAO)[number];

export const ROTULO_TIPO_DECISAO: Record<TipoDecisao, string> = {
  linha: 'Linha da planilha',
  'sem-st': 'Sem ST',
  manual: 'CFOP manual',
  'apendice-xiv': 'Apêndice XIV',
  historico: 'Histórico',
  'codigo-casa': 'Código da casa',
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
        ? d.motivo
          ? `Sem ST: ${d.motivo}`
          : 'Sem ST'
        : e.tipo === 'apendice-xiv'
          ? `Apêndice XIV: ${ROTULO_LUBRIFICANTE[e.lubrificante]}${d.motivo ? ` (${d.motivo})` : ''}`
          : e.tipo === 'manual'
            ? `CFOP manual ${e.cfop}${e.mva === null ? '' : `, MVA ${textoMva(e.mva)}`}: ${e.motivo}${d.motivo ? ` (${d.motivo})` : ''}`
            : `${e.segmento}, CEST ${e.cest}${d.motivo ? `: ${d.motivo}` : ''}`,
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

// ---------- as duas listas juntas (ST e código da casa) ----------

/** Uma linha da lista: a chave (com o tipo na frente) e a decisão. */
export type ItemDecisao =
  | { tipo: 'st'; chave: string; d: DecisaoLembrada }
  | { tipo: 'casa'; chave: string; d: DecisaoCodigoCasa };

/** As duas listas numa só, por fornecedor e produto. */
export function juntarDecisoes(
  st: readonly DecisaoLembrada[],
  casa: readonly DecisaoCodigoCasa[],
): ItemDecisao[] {
  const itens: ItemDecisao[] = [
    ...st.map((d): ItemDecisao => ({
      tipo: 'st',
      chave: `st:${chaveDecisao(d.raizCnpj, d.cProd)}`,
      d,
    })),
    ...casa.map((d): ItemDecisao => ({
      tipo: 'casa',
      chave: `casa:${chaveCodigoCasa(d.raizCnpj, d.cProd)}`,
      d,
    })),
  ];
  return itens.sort((a, b) =>
    `${a.d.fornecedor} ${a.d.xProd}`.localeCompare(
      `${b.d.fornecedor} ${b.d.xProd}`,
    ),
  );
}

/** A chave que o processo principal conhece (sem o tipo na frente). */
export const chaveSemTipo = (chave: string) => chave.replace(/^(st|casa):/, '');

/** "1001 · PARAFUSO SEXTAVADO · 12 UN por CX", ou o "nenhum". */
export function textoDecisaoCodigoCasa(d: DecisaoCodigoCasa): string {
  if (d.codigo === null) return `Código da casa: ${TEXTO_NENHUM}`;
  const conv = textoConversao(escolhaDaDecisao(d));
  return [`Código da casa ${d.codigo}`, d.descricao, conv]
    .filter(Boolean)
    .join(' · ');
}

export const textoItemDecisao = (i: ItemDecisao) =>
  i.tipo === 'st' ? textoDecisao(i.d) : textoDecisaoCodigoCasa(i.d);

export const ncmItemDecisao = (i: ItemDecisao) =>
  i.tipo === 'st' ? i.d.ncm : '';

const tiposDoItem = (i: ItemDecisao): TipoDecisao[] =>
  i.tipo === 'st' ? tiposDaDecisao(i.d) : ['codigo-casa'];

/** filtrarDecisoes para a lista junta. */
export function filtrarItensDecisao(
  lista: readonly ItemDecisao[],
  filtro: FiltroDecisoes,
): ItemDecisao[] {
  const palavras = normalizar(filtro.busca).split(' ').filter(Boolean);
  return lista.filter((i) => {
    if (filtro.tipo && !tiposDoItem(i).includes(filtro.tipo)) return false;
    if (palavras.length === 0) return true;
    const alvo = normalizar(
      [
        i.d.fornecedor,
        i.d.raizCnpj,
        i.d.cProd,
        i.d.xProd,
        ncmItemDecisao(i),
        i.tipo === 'casa' ? `${i.d.codigo ?? ''} ${i.d.descricao}` : '',
      ].join(' '),
    );
    return palavras.every((p) => alvo.includes(p));
  });
}

/** contagemPorTipo para a lista junta. */
export function contagemItens(
  lista: readonly ItemDecisao[],
): Record<TipoDecisao, number> {
  const r = Object.fromEntries(TIPOS_DECISAO.map((t) => [t, 0])) as Record<
    TipoDecisao,
    number
  >;
  for (const i of lista) for (const t of tiposDoItem(i)) r[t]++;
  return r;
}
