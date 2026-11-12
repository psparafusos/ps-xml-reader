// Protocolo do serviço de leitura pesada: as mensagens entre o processo
// principal e o utilityProcess, e a conferência do formato de cada uma nos
// dois lados. Puro (sem Electron, sem disco).
//
// O filho nunca escolhe caminho: o principal valida o arquivo (diálogo,
// arrastar, linha de comando) e manda o caminho pronto, ou os bytes. O que
// volta do filho é conferido antes de ir para a janela: um filho que leu um
// arquivo hostil e saiu do normal não consegue mandar uma árvore com laço
// (que travaria a janela) nem posições fora do texto.

import type { LeituraParaTela } from '../leitorXml/arquivo';
import type { LeituraPlanilha } from '../fiscal/leituraPlanilha';
import type { TipoDocumento } from '../fiscal/documentos';
import { NENHUM } from '../xml/arvore';

/** Maior planilha aceita (o mesmo limite do download, 30 MB). */
export const LIMITE_PLANILHA_BYTES = 30 * 1024 * 1024;

const DOCUMENTOS: readonly TipoDocumento[] = ['st', 'tipi', 'combustiveis'];

export type Tarefa =
  | { tipo: 'xml'; caminho: string }
  | { tipo: 'nfe'; caminho: string }
  | { tipo: 'planilha'; documento: TipoDocumento; dados: Uint8Array };

export type TipoTarefa = Tarefa['tipo'];

/** Etapas que o filho anuncia (a janela mostra em palavras). */
export type EtapaProgresso =
  | 'lendo'
  | 'decodificando'
  | 'arvore'
  | 'linhas'
  | 'planilha';

export const ETAPAS: readonly EtapaProgresso[] = [
  'lendo',
  'decodificando',
  'arvore',
  'linhas',
  'planilha',
];

export interface Pedido {
  id: number;
  tarefa: Tarefa;
}

export type MensagemDoFilho =
  | { id: number; tipo: 'progresso'; etapa: EtapaProgresso }
  | { id: number; tipo: 'resultado'; resultado: unknown }
  | { id: number; tipo: 'falha'; mensagem: string };

/** Resultado da NF-e: o texto (já conferido) ou a recusa para a pessoa. */
export type ResultadoNfe =
  | { ok: true; texto: string }
  | { ok: false; mensagem: string };

export type ResultadoDe<T extends TipoTarefa> = T extends 'xml'
  ? LeituraParaTela
  : T extends 'nfe'
    ? ResultadoNfe
    : LeituraPlanilha;

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const inteiro = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Caminho absoluto do Windows, sem byte zero, de tamanho razoável. */
function caminhoValido(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 2 &&
    v.length < 32768 &&
    !v.includes('\0') &&
    (/^[A-Za-z]:[\\/]/.test(v) || /^[\\/]{2}[^\\/?.]/.test(v))
  );
}

/** O pedido que o filho aceita. */
export function pedidoValido(v: unknown): v is Pedido {
  if (!objeto(v) || !inteiro(v.id) || !objeto(v.tarefa)) return false;
  const t = v.tarefa;
  if (t.tipo === 'xml' || t.tipo === 'nfe') return caminhoValido(t.caminho);
  if (t.tipo === 'planilha') {
    return (
      DOCUMENTOS.includes(t.documento as TipoDocumento) &&
      t.dados instanceof Uint8Array &&
      t.dados.byteLength <= LIMITE_PLANILHA_BYTES
    );
  }
  return false;
}

/** A mensagem que o principal aceita do filho (sem olhar o resultado). */
export function mensagemValida(v: unknown): v is MensagemDoFilho {
  if (!objeto(v) || !inteiro(v.id)) return false;
  if (v.tipo === 'progresso') return ETAPAS.includes(v.etapa as EtapaProgresso);
  if (v.tipo === 'falha') return typeof v.mensagem === 'string';
  return v.tipo === 'resultado' && 'resultado' in v;
}

// ---------- conferência dos resultados ----------

const colunaInt = (v: unknown, n: number): v is Int32Array =>
  v instanceof Int32Array && v.length === n;

/** Linhas da vista Texto coerentes com o texto. */
function linhasValidas(l: unknown, tamanhoTexto: number): boolean {
  if (!objeto(l) || !inteiro(l.quantidade)) return false;
  const n = l.quantidade;
  if (
    !colunaInt(l.inicio, n) ||
    !colunaInt(l.fim, n) ||
    !(l.nivel instanceof Uint16Array && l.nivel.length === n) ||
    !(l.tipo instanceof Uint8Array && l.tipo.length === n) ||
    !(l.continuacoes instanceof Int32Array) ||
    typeof l.indentado !== 'boolean' ||
    typeof l.cortado !== 'boolean'
  )
    return false;
  let antes = 0;
  for (let i = 0; i < n; i++) {
    const a = l.inicio[i];
    const b = l.fim[i];
    if (a < antes || b < a || b > tamanhoTexto) return false;
    antes = b;
  }
  const c = l.continuacoes;
  for (let k = 0; k < c.length; k++)
    if (c[k] < 0 || c[k] >= n || (k > 0 && c[k] <= c[k - 1])) return false;
  return true;
}

/**
 * Árvore compacta coerente: pai sempre antes do filho, filhos e irmãos
 * sempre depois (sem laço possível), índices e trechos dentro das tabelas.
 */
function arvoreValida(a: unknown, tamanhoTexto: number): boolean {
  if (!objeto(a) || !inteiro(a.quantidade)) return false;
  const n = a.quantidade;
  const cols = [
    'pai',
    'primeiroFilho',
    'proximoIrmao',
    'nome',
    'valorInicio',
    'valorFim',
    'primeiroAtributo',
    'quantosAtributos',
    'inicio',
    'fim',
  ];
  if (!(a.tipo instanceof Uint8Array && a.tipo.length === n)) return false;
  for (const c of cols) if (!colunaInt(a[c], n)) return false;
  if (
    !Array.isArray(a.nomes) ||
    !a.nomes.every((s) => typeof s === 'string') ||
    typeof a.valores !== 'string' ||
    !(a.atributoNome instanceof Int32Array) ||
    !colunaInt(a.atributoValorInicio, a.atributoNome.length) ||
    !colunaInt(a.atributoValorFim, a.atributoNome.length) ||
    !(
      a.primeiraRaiz === NENHUM ||
      (inteiro(a.primeiraRaiz) && a.primeiraRaiz < n)
    )
  )
    return false;
  const t = a as unknown as Record<string, Int32Array> & {
    tipo: Uint8Array;
    nomes: string[];
    valores: string;
  };
  const nNomes = t.nomes.length;
  const nValores = t.valores.length;
  const nAtrib = t.atributoNome.length;
  for (let i = 0; i < n; i++) {
    if (t.tipo[i] > 5) return false;
    const pai = t.pai[i];
    if (pai !== NENHUM && (pai < 0 || pai >= i)) return false;
    const f = t.primeiroFilho[i];
    if (f !== NENHUM && (f <= i || f >= n)) return false;
    const irmao = t.proximoIrmao[i];
    if (irmao !== NENHUM && (irmao <= i || irmao >= n)) return false;
    const nome = t.nome[i];
    if (nome !== NENHUM && (nome < 0 || nome >= nNomes)) return false;
    if (t.valorInicio[i] < 0 || t.valorFim[i] < t.valorInicio[i]) return false;
    if (t.valorFim[i] > nValores) return false;
    const pa = t.primeiroAtributo[i];
    const qa = t.quantosAtributos[i];
    if (pa < 0 || qa < 0 || pa + qa > nAtrib) return false;
    if (t.inicio[i] < 0 || t.fim[i] < t.inicio[i]) return false;
    if (t.fim[i] > tamanhoTexto) return false;
    if (i > 0 && t.inicio[i] < t.inicio[i - 1]) return false;
  }
  for (let k = 0; k < nAtrib; k++) {
    const nm = t.atributoNome[k];
    if (nm < 0 || nm >= nNomes) return false;
    const vi = t.atributoValorInicio[k];
    const vf = t.atributoValorFim[k];
    if (vi < 0 || vf < vi || vf > nValores) return false;
  }
  return true;
}

function erroXmlValido(e: unknown): boolean {
  return (
    e === null ||
    (objeto(e) &&
      inteiro(e.linha, 1) &&
      inteiro(e.coluna, 1) &&
      inteiro(e.posicao) &&
      typeof e.motivo === 'string')
  );
}

function leituraXmlValida(v: unknown): boolean {
  if (!objeto(v) || !objeto(v.resultado)) return false;
  const r = v.resultado;
  if (r.status === 'sem-arquivo') return v.texto === null;
  if (!objeto(r.arquivo) || typeof r.arquivo.nome !== 'string') return false;
  if (typeof r.arquivo.caminho !== 'string') return false;
  if (r.arquivo.tamanho !== null && !inteiro(r.arquivo.tamanho)) return false;
  if (r.status === 'recusado')
    return (
      typeof r.motivo === 'string' &&
      typeof r.mensagem === 'string' &&
      v.texto === null
    );
  if (r.status !== 'ok' || typeof v.texto !== 'string') return false;
  const l = r.leitura;
  if (!objeto(l) || (l.modo !== 'arvore' && l.modo !== 'texto')) return false;
  if (!objeto(l.codificacao) || typeof l.codificacao.codificacao !== 'string')
    return false;
  if (!inteiro(l.controles) || typeof l.doctype !== 'boolean') return false;
  if (l.avisoCodificacao !== null && typeof l.avisoCodificacao !== 'string')
    return false;
  if (!erroXmlValido(l.erro)) return false;
  if (
    l.erro !== null &&
    (l.erro as { posicao: number }).posicao > v.texto.length
  )
    return false;
  if (!linhasValidas(l.linhas, v.texto.length)) return false;
  if (l.arvore !== null && !arvoreValida(l.arvore, v.texto.length))
    return false;
  return (l.modo === 'arvore') === (l.arvore !== null);
}

function nfeValida(v: unknown): boolean {
  if (!objeto(v)) return false;
  return v.ok === true
    ? typeof v.texto === 'string'
    : v.ok === false && typeof v.mensagem === 'string';
}

function planilhaValida(v: unknown, documento: TipoDocumento): boolean {
  if (!objeto(v) || typeof v.reconhecido !== 'string') return false;
  if (v.relatorio !== null && !objeto(v.relatorio)) return false;
  if (
    !Array.isArray(v.segmentosIncompletos) ||
    !v.segmentosIncompletos.every((s) => typeof s === 'string')
  )
    return false;
  if (v.erroFormato !== undefined && typeof v.erroFormato !== 'string')
    return false;
  const e = v.erroPreparo;
  if (
    e !== null &&
    e !== 'formato' &&
    !(objeto(e) && typeof e.mensagem === 'string')
  )
    return false;
  const p = v.preparado;
  if (p === null) return true;
  return (
    objeto(p) &&
    p.tipo === documento &&
    (p.tipoArquivo === 'xlsx' || p.tipoArquivo === 'txt') &&
    inteiro(p.tamanhoArquivo) &&
    objeto(p.resumo) &&
    objeto(p.gravar)
  );
}

/** O resultado que voltou do filho tem o formato da tarefa pedida. */
export function resultadoValido(tarefa: Tarefa, v: unknown): boolean {
  try {
    if (tarefa.tipo === 'xml') return leituraXmlValida(v);
    if (tarefa.tipo === 'nfe') return nfeValida(v);
    return planilhaValida(v, tarefa.documento);
  } catch {
    return false;
  }
}
