// Notas recentes da tela inicial: cada nota aberta ou salva, com o
// fornecedor, o número, os itens, o último acesso e a situação. Guardadas no
// config.json (chave notasRecentes), no máximo LIMITE_RECENTES, a mais
// recente primeiro. Uma entrada por nota (pela chave de acesso): abrir o XML
// e depois salvar o .psxml atualiza a mesma entrada, que passa a apontar para
// o arquivo salvo. Lógica pura, sem DOM e sem Electron.

import type { ResumoConferencia } from './conferencia';

export const LIMITE_RECENTES = 8;

/**
 * em-conferencia: XML sem .psxml salvo. conferida: abriu ou salvou o .psxml.
 * alerta: o último painel tinha pontos para olhar (com o texto do principal).
 */
export type SituacaoRecente = 'em-conferencia' | 'conferida' | 'alerta';

export interface NotaRecente {
  caminho: string;
  /** Chave de acesso (44 dígitos); vazia se o arquivo não tinha. */
  chave: string;
  fornecedor: string;
  numero: string;
  itens: number;
  /** Último acesso (ISO 8601). */
  acesso: string;
  situacao: SituacaoRecente;
  /** Com situação alerta: o principal ponto ("parcela vencida"). */
  alerta: string;
}

const SITUACOES: SituacaoRecente[] = ['em-conferencia', 'conferida', 'alerta'];

const mesmoCaminho = (a: string, b: string) =>
  a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();

const mesmaNota = (a: NotaRecente, b: NotaRecente) =>
  a.chave && b.chave ? a.chave === b.chave : mesmoCaminho(a.caminho, b.caminho);

/** Põe a nota no topo (substituindo a entrada da mesma nota) e corta no limite. */
export function registrarRecente(
  lista: NotaRecente[],
  nota: NotaRecente,
): NotaRecente[] {
  return [nota, ...lista.filter((r) => !mesmaNota(r, nota))].slice(
    0,
    LIMITE_RECENTES,
  );
}

/** Tira uma entrada pelo caminho. */
export function removerRecente(
  lista: NotaRecente[],
  caminho: string,
): NotaRecente[] {
  return lista.filter((r) => !mesmoCaminho(r.caminho, caminho));
}

export function estaNaLista(lista: NotaRecente[], caminho: string): boolean {
  return lista.some((r) => mesmoCaminho(r.caminho, caminho));
}

/** Lê a chave notasRecentes do config.json; entrada estranha fica de fora. */
export function lerRecentes(v: unknown): NotaRecente[] {
  if (!Array.isArray(v)) return [];
  const lista: NotaRecente[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const r = x as Partial<NotaRecente>;
    const texto = (s: unknown): s is string => typeof s === 'string';
    if (
      !texto(r.caminho) ||
      !r.caminho ||
      !texto(r.chave) ||
      !texto(r.fornecedor) ||
      !texto(r.numero) ||
      typeof r.itens !== 'number' ||
      !Number.isFinite(r.itens) ||
      !texto(r.acesso) ||
      Number.isNaN(Date.parse(r.acesso)) ||
      !SITUACOES.includes(r.situacao as SituacaoRecente)
    )
      continue;
    lista.push({
      caminho: r.caminho,
      chave: r.chave,
      fornecedor: r.fornecedor,
      numero: r.numero,
      itens: r.itens,
      acesso: r.acesso,
      situacao: r.situacao as SituacaoRecente,
      alerta: texto(r.alerta) ? r.alerta : '',
    });
    if (lista.length === LIMITE_RECENTES) break;
  }
  return lista;
}

/** Texto curto do principal ponto do painel, na ordem de gravidade. */
export function principalAlerta(r: ResumoConferencia): string {
  const forte = (id: string) =>
    r.verificacoes.some((v) => v.id === id && v.nivel === 'forte');
  const leve = (id: string) =>
    r.verificacoes.some((v) => v.id === id && v.nivel === 'leve');
  if (forte('vencimentos')) return 'parcela vencida';
  if (forte('destinatario')) return 'nota de outra empresa';
  if (forte('totais-itens')) return 'total dos itens difere';
  if (forte('duplicatas')) return 'duplicatas diferem';
  if (forte('conferida')) return 'já conferida';
  if (r.pendencias.length > 0) return 'quantidade diferente';
  if (leve('vencimentos')) return 'parcela vence logo';
  if (leve('idade')) return 'nota antiga';
  return r.pontos > 0 ? 'pontos para olhar' : '';
}

/** Situação da nota aberta: alerta vence; .psxml aberto ou salvo é conferida. */
export function situacaoNota(
  conferida: boolean,
  resumo: ResumoConferencia | null,
): { situacao: SituacaoRecente; alerta: string } {
  if (resumo && resumo.pontos > 0)
    return { situacao: 'alerta', alerta: principalAlerta(resumo) };
  return { situacao: conferida ? 'conferida' : 'em-conferencia', alerta: '' };
}

export const ROTULO_SITUACAO: Record<SituacaoRecente, string> = {
  'em-conferencia': 'em conferência',
  conferida: 'conferida',
  alerta: 'alerta',
};

/** "hoje 10:42", "ontem 16:05", "28/10 09:00" (ano só se for outro). */
export function textoAcesso(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const dia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `ontem ${hora}`;
  const data =
    d.getFullYear() === agora.getFullYear()
      ? `${p(d.getDate())}/${p(d.getMonth() + 1)}`
      : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${data} ${hora}`;
}
