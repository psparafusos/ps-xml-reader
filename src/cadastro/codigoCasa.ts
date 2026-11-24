// Código da casa na Conferência: o que fica escolhido para cada item da
// NF-e (o produto do cadastro da loja e o fator, ou "nenhum"), de onde veio
// (o motor de src/cadastro/casamento.ts, uma decisão lembrada ou a escolha
// da pessoa), a situação do item (definido ou precisa da pessoa), os textos
// da coluna e do quadro de escolha, a busca no cadastro e a validação das
// decisões lembradas e das escolhas gravadas no .psxml.
//
// Ordem de quem vale num item: a escolha gravada no .psxml (ou feita agora
// pela pessoa), depois a decisão lembrada (raiz do CNPJ do emitente + código
// do item), depois o motor. Definido: escolha da pessoa, decisão lembrada,
// "nenhum" ou o motor com confiança alta. Precisa da pessoa: o motor com
// confiança média ou baixa, os ambíguos e os sem sugestão.
//
// Lógica pura, sem DOM e sem Electron.

import type {
  Caminho,
  Confianca,
  FatorSugerido,
  SugestaoItem,
} from './casamento';
import type { ProdutoCadastro } from './formato';

/** Id da coluna "Código da casa" no catálogo de colunas. */
export const ID_CODIGO_CASA = 'codigoCasa';

export const TITULO_CODIGO_CASA = 'Código da casa';

/** Motivo da coluna apagada sem cadastro (editor de colunas). */
export const TEXTO_SEM_CADASTRO =
  'Carregue o cadastro do sistema de gestão em Documentos de referência';

/** Texto da escolha "nenhum". */
export const TEXTO_NENHUM = 'Nenhum (vincular no sistema de gestão)';

export type OrigemCodigoCasa = 'motor' | 'lembrada' | 'pessoa';
export type ConfiancaCasa = Exclude<Confianca, 'nenhuma'>;

const ORIGENS: readonly OrigemCodigoCasa[] = ['motor', 'lembrada', 'pessoa'];
const CONFIANCAS: readonly ConfiancaCasa[] = ['alta', 'media', 'baixa'];

/** O que fica escolhido para um item (na tela e no .psxml). */
export interface EscolhaCodigoCasa {
  /** Código da casa; null: "nenhum" (vincular no sistema de gestão). */
  codigo: string | null;
  /** Descrição e unidade de venda do produto ('' no "nenhum"). */
  descricao: string;
  unidade: string;
  /** Unidades de venda em uma unidade de compra; null: sem fator. */
  fator: number | null;
  /** Unidade de compra a que o fator se refere (a uCom do item). */
  unidadeCompra: string;
  origem: OrigemCodigoCasa;
  /** Só na origem "motor". */
  confianca: ConfiancaCasa | null;
}

/** Decisão lembrada do código da casa (decisoes.json, seção codigosCasa). */
export interface DecisaoCodigoCasa {
  /** Raiz do CNPJ do emitente (8 dígitos). */
  raizCnpj: string;
  /** Nome do emitente, para a lista das Configurações. */
  fornecedor: string;
  cProd: string;
  xProd: string;
  /** null: "nenhum". */
  codigo: string | null;
  descricao: string;
  unidade: string;
  fator: number | null;
  unidadeCompra: string;
  /** ISO 8601. */
  atualizadaEm: string;
}

export const raizDoDocumento = (doc: string) =>
  doc.replace(/\D/g, '').slice(0, 8);

/** Chave da decisão: a mesma das decisões da ST (raiz + "|" + código). */
export function chaveCodigoCasa(cnpj: string, cProd: string): string {
  return `${raizDoDocumento(cnpj)}|${cProd.trim()}`;
}

// ---------- validação ----------

const ehTexto = (v: unknown): v is string => typeof v === 'string';
const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const fatorValido = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0);

export function decisaoCodigoCasaValida(d: unknown): d is DecisaoCodigoCasa {
  if (!ehObjeto(d)) return false;
  return (
    /^\d{8}$/.test(String(d.raizCnpj ?? '')) &&
    ehTexto(d.fornecedor) &&
    ehTexto(d.cProd) &&
    d.cProd.trim() !== '' &&
    ehTexto(d.xProd) &&
    (d.codigo === null || (ehTexto(d.codigo) && d.codigo.trim() !== '')) &&
    ehTexto(d.descricao) &&
    ehTexto(d.unidade) &&
    fatorValido(d.fator) &&
    ehTexto(d.unidadeCompra) &&
    ehTexto(d.atualizadaEm) &&
    !Number.isNaN(Date.parse(d.atualizadaEm))
  );
}

/** Só os campos conhecidos, sem o que vier a mais. */
export function limparDecisaoCodigoCasa(
  d: DecisaoCodigoCasa,
): DecisaoCodigoCasa {
  return {
    raizCnpj: d.raizCnpj,
    fornecedor: d.fornecedor,
    cProd: d.cProd,
    xProd: d.xProd,
    codigo: d.codigo,
    descricao: d.descricao,
    unidade: d.unidade,
    fator: d.fator,
    unidadeCompra: d.unidadeCompra,
    atualizadaEm: d.atualizadaEm,
  };
}

/**
 * As decisões do código da casa do arquivo de decisões lembradas (seção
 * `codigosCasa`, ao lado das da ST); o que não serve fica de fora.
 */
export function lerDecisoesCodigoCasa(
  v: unknown,
): Record<string, DecisaoCodigoCasa> {
  const r: Record<string, DecisaoCodigoCasa> = {};
  if (!ehObjeto(v) || !ehObjeto(v.codigosCasa)) return r;
  for (const [chave, d] of Object.entries(v.codigosCasa))
    if (
      decisaoCodigoCasaValida(d) &&
      chave === chaveCodigoCasa(d.raizCnpj, d.cProd)
    )
      r[chave] = limparDecisaoCodigoCasa(d);
  return r;
}

// ---------- no .psxml ----------

const numeroTexto = (n: number) => String(n);

/** Atributos do <item> gravado no .psxml (nItem à parte). */
export function atributosEscolha(e: EscolhaCodigoCasa): [string, string][] {
  const a: [string, string][] = [];
  if (e.codigo === null) a.push(['nenhum', 'true']);
  else a.push(['codigo', e.codigo]);
  a.push(['origem', e.origem]);
  if (e.origem === 'motor' && e.confianca) a.push(['confianca', e.confianca]);
  if (e.fator !== null) a.push(['fator', numeroTexto(e.fator)]);
  if (e.unidadeCompra) a.push(['unidadeCompra', e.unidadeCompra]);
  if (e.descricao) a.push(['descricao', e.descricao]);
  if (e.unidade) a.push(['unidade', e.unidade]);
  return a;
}

/** A escolha lida dos atributos de um <item>; null se não serve. */
export function escolhaDeAtributos(
  ler: (nome: string) => string | null,
): EscolhaCodigoCasa | null {
  const nenhum = ler('nenhum') === 'true';
  const codigo = ler('codigo')?.trim() ?? '';
  if (!nenhum && !codigo) return null;
  const origem = ler('origem') as OrigemCodigoCasa | null;
  if (!origem || !ORIGENS.includes(origem)) return null;
  const conf = ler('confianca') as ConfiancaCasa | null;
  const confianca =
    origem === 'motor' && conf && CONFIANCAS.includes(conf) ? conf : null;
  if (origem === 'motor' && !confianca) return null;
  const fatorTexto = ler('fator');
  const fator = fatorTexto === null ? null : Number(fatorTexto);
  if (fator !== null && !fatorValido(fator)) return null;
  return {
    codigo: nenhum ? null : codigo,
    descricao: nenhum ? '' : (ler('descricao') ?? ''),
    unidade: nenhum ? '' : (ler('unidade') ?? ''),
    fator: nenhum ? null : fator,
    unidadeCompra: ler('unidadeCompra') ?? '',
    origem,
    confianca,
  };
}

// ---------- situação de cada item ----------

export type SituacaoCodigoCasa =
  | 'definido'
  | 'confirmar'
  | 'ambiguo'
  | 'sem-sugestao';

export interface EstadoCodigoCasa {
  /** O que vale no item agora; null nos ambíguos e sem sugestão. */
  escolha: EscolhaCodigoCasa | null;
  situacao: SituacaoCodigoCasa;
  /** Média, baixa, ambíguo ou sem sugestão: entra no "precisam de você". */
  precisaDeVoce: boolean;
}

export const escolhaDaDecisao = (d: DecisaoCodigoCasa): EscolhaCodigoCasa => ({
  codigo: d.codigo,
  descricao: d.codigo === null ? '' : d.descricao,
  unidade: d.codigo === null ? '' : d.unidade,
  fator: d.codigo === null ? null : d.fator,
  unidadeCompra: d.unidadeCompra,
  origem: 'lembrada',
  confianca: null,
});

/** A sugestão do motor como escolha (só quando há um produto). */
export function escolhaDoMotor(
  s: SugestaoItem,
  uCom: string,
): EscolhaCodigoCasa | null {
  if (!s.codigo || s.confianca === 'nenhuma') return null;
  const c = s.candidatos.find((x) => x.codigo === s.codigo);
  if (!c) return null;
  return {
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    fator: s.fator?.fator ?? null,
    unidadeCompra: s.fator?.unidadeCompra ?? uCom.trim(),
    origem: 'motor',
    confianca: s.confianca,
  };
}

function situacaoDaEscolha(e: EscolhaCodigoCasa): SituacaoCodigoCasa {
  return e.origem === 'motor' && e.confianca !== 'alta'
    ? 'confirmar'
    : 'definido';
}

/**
 * Situação de um item. `gravada`: a escolha do .psxml ou a feita agora pela
 * pessoa; `lembrada`: a decisão lembrada do par emitente e código; `sugestao`:
 * o motor (null sem cadastro).
 */
export function estadoCodigoCasa(
  gravada: EscolhaCodigoCasa | null | undefined,
  lembrada: DecisaoCodigoCasa | null | undefined,
  sugestao: SugestaoItem | null | undefined,
  uCom: string,
): EstadoCodigoCasa {
  const escolha =
    gravada ??
    (lembrada ? escolhaDaDecisao(lembrada) : null) ??
    (sugestao ? escolhaDoMotor(sugestao, uCom) : null);
  if (escolha) {
    const situacao = situacaoDaEscolha(escolha);
    return { escolha, situacao, precisaDeVoce: situacao !== 'definido' };
  }
  const situacao = sugestao?.ambiguo ? 'ambiguo' : 'sem-sugestao';
  return { escolha: null, situacao, precisaDeVoce: true };
}

export interface ResumoCodigoCasa {
  definidos: number;
  total: number;
  /** nItem dos que precisam da pessoa, na ordem recebida. */
  pendentes: string[];
}

export function resumoCodigoCasa(
  estados: readonly { nItem: string; estado: EstadoCodigoCasa }[],
): ResumoCodigoCasa {
  const pendentes = estados
    .filter((e) => e.estado.precisaDeVoce)
    .map((e) => e.nItem);
  return {
    definidos: estados.length - pendentes.length,
    total: estados.length,
    pendentes,
  };
}

/** O próximo pendente depois de `atual` (na ordem de `pendentes`), dando a volta. */
export function proximoPendente(
  pendentes: readonly string[],
  atual: string | null,
): string | null {
  if (pendentes.length === 0) return null;
  const i = atual === null ? -1 : pendentes.indexOf(atual);
  return pendentes[(i + 1) % pendentes.length];
}

// ---------- textos ----------

export const ROTULO_CONFIANCA: Record<ConfiancaCasa, string> = {
  alta: 'Confiança alta',
  media: 'Confiança média',
  baixa: 'Confiança baixa',
};

export const ROTULO_ORIGEM: Record<OrigemCodigoCasa, string> = {
  motor: 'sugestão do app',
  lembrada: 'decisão lembrada',
  pessoa: 'sua escolha',
};

/** "12", "0,5", "2,25": o fator como a pessoa escreve. */
export const textoFator = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

/** Fator digitado ("12", "0,5", "1.000"); null se não é um número maior que zero. */
export function lerFator(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+([.,]\d+)?$/.test(t)) return null;
  const n = /,/.test(t)
    ? Number(t.replace(/\./g, '').replace(',', '.'))
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? Number(t.replace(/\./g, ''))
      : Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "12 UN por CX" quando o fator é diferente de 1; '' senão. */
export function textoConversao(e: EscolhaCodigoCasa): string {
  if (e.codigo === null || e.fator === null || e.fator === 1) return '';
  const compra = e.unidadeCompra.trim() || 'unidade de compra';
  const venda = e.unidade.trim() || 'unidades';
  return `${textoFator(e.fator)} ${venda} por ${compra}`;
}

/** A célula como texto: impressão, PDF, ordenação. */
export function textoCodigoCasa(e: EstadoCodigoCasa): string {
  const x = e.escolha;
  if (!x) return '';
  if (x.codigo === null) return TEXTO_NENHUM;
  const conv = textoConversao(x);
  return [x.codigo, x.descricao, conv].filter(Boolean).join(' · ');
}

/** Por que o motor chegou no produto, em palavras. */
export const MOTIVO_CAMINHO: Record<Caminho, string> = {
  'vinculo-emitente':
    'O código do item está vinculado a este produto no cadastro deste fornecedor.',
  'vinculo-raiz':
    'O código do item está vinculado a este produto em outra filial do fornecedor (mesma raiz do CNPJ).',
  'codigo-emitente':
    'O código do item, sem espaços e sem zeros à esquerda, está vinculado a este produto neste fornecedor.',
  'codigo-raiz':
    'O código do item, sem espaços e sem zeros à esquerda, está vinculado a este produto em outra filial do fornecedor.',
  'cean-vinculo-emitente':
    'O código de barras do item está vinculado a este produto neste fornecedor.',
  cean: 'O código de barras do item é o do produto no cadastro.',
  'cean-vinculo-raiz':
    'O código de barras do item está vinculado a este produto em outra filial do fornecedor.',
  'cprod-ean':
    'O código do item tem cara de código de barras e é o do produto no cadastro.',
};

/** Como o fator foi achado, para o quadro de escolha. */
export function textoOrigemFator(f: FatorSugerido | null): string {
  if (!f) return 'Sem fator no cadastro para este fornecedor e produto.';
  const partes = [
    `Fator do cadastro: ${textoFator(f.fator)} por ${f.unidadeCompra}`,
  ];
  if (f.deFilial) partes.push('de uma filial do fornecedor');
  if (!f.unidadeConfere) partes.push('para outra unidade de compra');
  return `${partes.join(', ')}.`;
}

// ---------- busca no cadastro ----------

export interface ProdutoBusca {
  codigo: string;
  descricao: string;
  unidade: string;
  codigoBarras: string | null;
  ativo: boolean;
}

export const LIMITE_BUSCA = 50;

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const semZeros = (s: string) => s.trim().replace(/^0+/, '');

/**
 * Busca por código da casa, código de barras ou descrição. Primeiro o código
 * igual, depois o código de barras igual (sem zeros à esquerda), depois o
 * código que começa com o texto, depois as descrições com todas as palavras.
 * Até `limite` produtos.
 */
export function buscarProdutos(
  produtos: readonly ProdutoCadastro[],
  texto: string,
  limite = LIMITE_BUSCA,
): ProdutoBusca[] {
  const t = texto.trim();
  if (!t) return [];
  const T = semAcento(t);
  const palavras = T.split(/\s+/).filter(Boolean);
  const gtin = /^\d{8,14}$/.test(t) ? semZeros(t) : null;
  const grupos: ProdutoCadastro[][] = [[], [], [], []];
  for (const p of produtos) {
    const cod = p.codigo.toUpperCase();
    if (cod === T) grupos[0].push(p);
    else if (gtin && p.codigoBarras && semZeros(p.codigoBarras) === gtin)
      grupos[1].push(p);
    else if (cod.startsWith(T)) grupos[2].push(p);
    else {
      const d = semAcento(p.descricao);
      if (palavras.every((w) => d.includes(w))) grupos[3].push(p);
    }
  }
  return grupos
    .flat()
    .slice(0, limite)
    .map((p) => ({
      codigo: p.codigo,
      descricao: p.descricao,
      unidade: p.unidade,
      codigoBarras: p.codigoBarras,
      ativo: p.ativo,
    }));
}
