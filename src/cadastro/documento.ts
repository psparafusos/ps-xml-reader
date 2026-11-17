// O cadastro do sistema de gestão como documento de referência: a leitura
// do arquivo (no serviço de leitura pesada), os metadados gravados ao lado
// dele na pasta de dados (cadastro-info.json), conferidos campo a campo ao
// serem lidos do disco, e o selo do cartão. Lógica pura, sem Node e sem
// Electron: o processo principal (src/cadastroGestao.ts) grava e lê, a tela
// (src/areaDocumentos.ts) desenha.

import {
  LIMITE_PONTOS_CADASTRO,
  validarTextoCadastro,
  type PontoCadastro,
  type QuantidadesCadastro,
} from './formato';

export const NOME_CADASTRO = 'Cadastro do sistema de gestão';

/** Versão do cadastro-info.json. */
export const FORMATO_INFO_CADASTRO = 1;

/** Maior arquivo aceito: o mesmo limite das planilhas de referência (30 MB). */
export const LIMITE_CADASTRO_BYTES = 30 * 1024 * 1024;

/** O que a leitura devolve ao processo principal (sem o cadastro inteiro). */
export type LeituraCadastro =
  | {
      ok: true;
      origem: string;
      extraidoEm: string;
      quantidades: QuantidadesCadastro;
      pontos: PontoCadastro[];
      totalPontos: number;
      observacoes: string[];
    }
  | { ok: false; erros: string[]; totalErros: number };

/**
 * Lê os bytes do arquivo: UTF-8 (com ou sem BOM) e o validador do formato.
 * Nunca lança; texto que não é UTF-8 é recusado com a explicação.
 */
export function lerArquivoCadastro(dados: Uint8Array): LeituraCadastro {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(dados);
  } catch {
    return {
      ok: false,
      erros: [
        'O arquivo não está em UTF-8. Gere o cadastro de novo em UTF-8 (no Excel, "CSV UTF-8" antes de converter).',
      ],
      totalErros: 1,
    };
  }
  const r = validarTextoCadastro(texto);
  if (!r.ok) return r;
  return {
    ok: true,
    origem: r.cadastro.meta.origem,
    extraidoEm: r.cadastro.meta.extraidoEm,
    ...r.relatorio,
  };
}

/** cadastro-info.json: o que o cartão mostra sem abrir o cadastro. */
export interface InfoCadastro {
  formato: typeof FORMATO_INFO_CADASTRO;
  /** Nome do arquivo importado. */
  arquivo: string;
  tamanhoArquivo: number;
  /** ISO 8601. */
  importadoEm: string;
  origem: string;
  /** Data (e hora) da extração, como veio em meta.extraido_em. */
  extraidoEm: string;
  quantidades: QuantidadesCadastro;
  pontos: PontoCadastro[];
  totalPontos: number;
  observacoes: string[];
}

export function montarInfoCadastro(
  leitura: Extract<LeituraCadastro, { ok: true }>,
  arquivo: string,
  tamanhoArquivo: number,
  agora: Date,
): InfoCadastro {
  return {
    formato: FORMATO_INFO_CADASTRO,
    arquivo,
    tamanhoArquivo,
    importadoEm: agora.toISOString(),
    origem: leitura.origem,
    extraidoEm: leitura.extraidoEm,
    quantidades: { ...leitura.quantidades },
    pontos: leitura.pontos.map((p) => ({ ...p })),
    totalPontos: leitura.totalPontos,
    observacoes: [...leitura.observacoes],
  };
}

const ehTexto = (v: unknown): v is string => typeof v === 'string';
const ehInteiro = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;
const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const CHAVES_QUANTIDADES: (keyof QuantidadesCadastro)[] = [
  'fornecedores',
  'produtos',
  'produtosAtivos',
  'vinculos',
  'fatores',
  'notasLancadas',
];

/**
 * O cadastro-info.json lido do disco, conferido campo a campo: só volta o
 * objeto (com exatamente os campos conhecidos) se todos tiverem o tipo
 * certo; senão null, e o cadastro conta como não carregado.
 */
export function validarInfoCadastro(v: unknown): InfoCadastro | null {
  if (!ehObjeto(v) || v.formato !== FORMATO_INFO_CADASTRO) return null;
  const { arquivo, tamanhoArquivo, importadoEm, origem, extraidoEm } = v;
  if (!ehTexto(arquivo) || !ehInteiro(tamanhoArquivo)) return null;
  if (!ehTexto(importadoEm) || Number.isNaN(Date.parse(importadoEm)))
    return null;
  if (!ehTexto(origem) || !ehTexto(extraidoEm)) return null;
  const q = v.quantidades;
  if (!ehObjeto(q) || !CHAVES_QUANTIDADES.every((k) => ehInteiro(q[k])))
    return null;
  const { pontos, totalPontos, observacoes } = v;
  if (
    !Array.isArray(pontos) ||
    pontos.length > LIMITE_PONTOS_CADASTRO ||
    !pontos.every(
      (p) =>
        ehObjeto(p) && ehTexto(p.onde) && ehTexto(p.motivo) && ehTexto(p.valor),
    )
  )
    return null;
  if (!ehInteiro(totalPontos) || totalPontos < pontos.length) return null;
  if (!Array.isArray(observacoes) || !observacoes.every(ehTexto)) return null;
  return {
    formato: FORMATO_INFO_CADASTRO,
    arquivo,
    tamanhoArquivo,
    importadoEm,
    origem,
    extraidoEm,
    quantidades: Object.fromEntries(
      CHAVES_QUANTIDADES.map((k) => [k, q[k] as number]),
    ) as unknown as QuantidadesCadastro,
    pontos: pontos.map((p) => ({
      onde: p.onde as string,
      motivo: p.motivo as string,
      valor: p.valor as string,
    })),
    totalPontos,
    observacoes: [...(observacoes as string[])],
  };
}

/** Situação do cadastro na tela: o que o cartão mostra. */
export interface EstadoCadastro {
  info: InfoCadastro | null;
  /** Última tentativa recusada, sem cadastro carregado (vermelho "Incompatível"). */
  recusado: boolean;
}

export type EstadoSeloCadastro = 'ok' | 'aviso' | 'faltando' | 'opcional';

/** Selo do cartão: o mesmo conjunto de estados dos outros documentos. */
export function seloCadastro(e: EstadoCadastro): {
  estado: EstadoSeloCadastro;
  texto: string;
} {
  if (!e.info)
    return e.recusado
      ? { estado: 'faltando', texto: 'Incompatível' }
      : { estado: 'opcional', texto: 'Opcional, não carregado' };
  const n = e.info.totalPontos;
  if (n > 0)
    return {
      estado: 'aviso',
      texto: `Carregado com ${n.toLocaleString('pt-BR')} ${n === 1 ? 'ponto de atenção' : 'pontos de atenção'}`,
    };
  return { estado: 'ok', texto: 'Carregado' };
}

/** "2026-11-14T12:30:00" -> "14/11/2026 às 12:30"; "2026-11-14" -> "14/11/2026". */
export function textoExtracao(extraidoEm: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(extraidoEm);
  if (!m) return extraidoEm;
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? `${dia} às ${m[4]}:${m[5]}` : dia;
}

/** "14 mil produtos (7 mil ativos) · 27 mil vínculos ..." do cartão, com os números inteiros. */
export function textoQuantidades(q: QuantidadesCadastro): string {
  const n = (v: number) => v.toLocaleString('pt-BR');
  const plural = (v: number, um: string, varios: string) =>
    `${n(v)} ${v === 1 ? um : varios}`;
  return [
    `${plural(q.produtos, 'produto', 'produtos')} (${n(q.produtosAtivos)} ${q.produtosAtivos === 1 ? 'ativo' : 'ativos'})`,
    plural(q.fornecedores, 'fornecedor', 'fornecedores'),
    plural(q.vinculos, 'vínculo', 'vínculos'),
    plural(q.fatores, 'fator', 'fatores'),
    plural(q.notasLancadas, 'nota lançada', 'notas lançadas'),
  ].join(' · ');
}
