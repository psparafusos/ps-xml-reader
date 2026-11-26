// Motor de casamento: para cada item de uma NF-e de compra, sugere o produto
// do cadastro da loja (código da casa), diz por qual caminho chegou nele e
// com que confiança, sugere o fator de conversão do par fornecedor e
// produto e junta os avisos (nota já lançada, produto inativo, código
// reaproveitado, NCM ou unidade diferente, custo fora do padrão).
//
// Os caminhos, tentados nesta ordem; o primeiro que acha algum produto
// decide (docs/formato-cadastro.md, "Como o app sugere o produto"):
//   (a) vínculo exato do emitente;
//   (b) vínculo exato de outro CNPJ com a mesma raiz (filial);
//   (c) código sem espaços e sem zeros à esquerda, no emitente e depois na raiz;
//   (d) cEAN da nota contra os códigos dos vínculos do emitente (há sistemas
//       que gravam o vínculo com o GTIN do item, não com o cProd);
//   (e) cEAN da nota contra o código de barras do produto;
//   (f) cEAN da nota contra os códigos dos vínculos das filiais (mesma raiz);
//   (g) cProd com cara de EAN contra o código de barras.
// Mais de um produto no caminho que decidiu: ambíguo, com a lista, sem
// sugestão única.
//
// Lógica pura, sem Node e sem Electron, e só `import type` (o medidor,
// scripts/medir-cadastro.mjs, usa este arquivo compilado sozinho).

import type { Cadastro, FatorCadastro, ProdutoCadastro } from './formato';

/** Os caminhos, com a letra do documento. */
export type Caminho =
  | 'vinculo-emitente'
  | 'vinculo-raiz'
  | 'codigo-emitente'
  | 'codigo-raiz'
  | 'cean-vinculo-emitente'
  | 'cean-vinculo-raiz'
  | 'cean'
  | 'cprod-ean';

export const CAMINHOS: readonly Caminho[] = [
  'vinculo-emitente',
  'vinculo-raiz',
  'codigo-emitente',
  'codigo-raiz',
  'cean-vinculo-emitente',
  'cean',
  'cean-vinculo-raiz',
  'cprod-ean',
];

export const ROTULO_CAMINHO: Record<Caminho, string> = {
  'vinculo-emitente': 'a) vínculo exato do emitente',
  'vinculo-raiz': 'b) vínculo exato de outro CNPJ da mesma raiz (filial)',
  'codigo-emitente':
    'c) código sem espaços e sem zeros à esquerda, no emitente',
  'codigo-raiz': 'c) código sem espaços e sem zeros à esquerda, na raiz',
  'cean-vinculo-emitente': 'd) cEAN da nota contra os vínculos do emitente',
  cean: 'e) cEAN da nota contra o código de barras',
  'cean-vinculo-raiz': 'f) cEAN da nota contra os vínculos da raiz (filial)',
  'cprod-ean': 'g) cProd com cara de EAN contra o código de barras',
};

export type Confianca = 'alta' | 'media' | 'baixa' | 'nenhuma';

/**
 * Confiança de cada caminho antes dos rebaixamentos. O (d) e o (f) seguem o
 * (a) e o (b): são vínculos que a loja gravou para o fornecedor, só que pelo
 * GTIN; no emitente valem como o vínculo exato (alta), na filial como o da
 * filial (média). O da filial vem depois do código de barras do produto:
 * nas notas reais medidas, quando os dois discordavam, o código de barras
 * estava certo e o vínculo da filial era de outro produto.
 *
 * O (e) é alta: se ele decidiu, o emitente não tinha vínculo para o item, e
 * o sistema de gestão vincula pelo mesmo código de barras do produto. Os
 * caminhos (c) continuam abaixo: o sistema de gestão compara o código do
 * fornecedor como texto exato, e o código sem espaços e sem zeros à
 * esquerda não é o que ele vai achar.
 *
 * A cor diz o que a pessoa precisa fazer: alta, nada a conferir; média e
 * baixa, conferir a sugestão; sem sugestão ou ambíguo, escolher.
 */
export const CONFIANCA_CAMINHO: Record<
  Caminho,
  Exclude<Confianca, 'nenhuma'>
> = {
  'vinculo-emitente': 'alta',
  'vinculo-raiz': 'media',
  'codigo-emitente': 'media',
  'codigo-raiz': 'baixa',
  'cean-vinculo-emitente': 'alta',
  'cean-vinculo-raiz': 'media',
  cean: 'alta',
  'cprod-ean': 'baixa',
};

/**
 * Diferença relativa entre o custo da nota (na unidade de venda) e o custo
 * do cadastro acima da qual o custo é "fora do padrão". Provisório: a
 * calibrar com notas reais.
 */
export const LIMITE_CUSTO = 0.3;

/** Um item da NF-e, com os campos que o motor usa. */
export interface ItemNota {
  nItem: number;
  cProd: string;
  cEAN: string;
  xProd: string;
  NCM: string;
  uCom: string;
  /** Valor unitário na unidade da nota; sem ele, o custo não é conferido. */
  vUnCom?: number | null;
}

export interface NotaParaCasar {
  /** CNPJ do emitente (14 dígitos); null quando o emitente é CPF. */
  cnpjEmitente: string | null;
  cpfEmitente?: string | null;
  /** Chave de acesso (44 dígitos), para o aviso de nota já lançada. */
  chave?: string | null;
  itens: ItemNota[];
}

export interface Candidato {
  codigo: string;
  descricao: string;
  unidade: string;
  ativo: boolean;
  reaproveitadoEm: string | null;
  /** CNPJ ou CPF cujo vínculo levou ao produto; null nos caminhos de código de barras. */
  fornecedor: string | null;
}

export interface FatorSugerido {
  fator: number;
  unidadeCompra: string;
  ultimaEntrada: string | null;
  /** De quem é o fator: o emitente ou uma filial (mesma raiz). */
  fornecedor: string;
  deFilial: boolean;
  /** A unidade do fator é a uCom do item. */
  unidadeConfere: boolean;
}

export type TipoAviso =
  | 'inativo'
  | 'reaproveitado'
  | 'ambiguo-um-ativo'
  | 'ncm-diferente'
  | 'unidade-diferente'
  | 'custo-fora';

export interface AvisoItem {
  tipo: TipoAviso;
  texto: string;
}

export interface SugestaoItem {
  nItem: number;
  caminho: Caminho | null;
  /** Código da casa sugerido; null se nenhum caminho achou ou se ficou ambíguo. */
  codigo: string | null;
  /** Os produtos achados no caminho que decidiu (um, ou vários se ambíguo). */
  candidatos: Candidato[];
  ambiguo: boolean;
  confianca: Confianca;
  fator: FatorSugerido | null;
  avisos: AvisoItem[];
}

export interface ResultadoNota {
  /** A chave da nota está em notas_lancadas. */
  notaLancada: { entrada: string | null } | null;
  /** O CNPJ (ou a raiz) ou o CPF do emitente aparece no cadastro. */
  emitenteConhecido: boolean;
  itens: SugestaoItem[];
}

// ---------- comparação de códigos ----------

/** Vínculo exato: sem diferenciar maiúsculas e sem os espaços das pontas. */
export function chaveExata(codigo: string): string {
  return codigo.trim().toUpperCase();
}

/** Sem espaços em nenhuma posição e sem zeros à esquerda ("0" se só zeros). */
export function normalizarCodigo(codigo: string): string {
  const t = codigo.replace(/\s+/g, '');
  if (t === '') return '';
  const u = t.replace(/^0+/, '');
  return (u === '' ? '0' : u).toUpperCase();
}

/** Só dígitos, com 8, 12, 13 ou 14 posições. "SEM GTIN" e vazio não. */
export function pareceGtin(s: string): boolean {
  const t = s.trim();
  return /^\d+$/.test(t) && [8, 12, 13, 14].includes(t.length);
}

/** GTIN comparado sem zeros à esquerda: o GTIN-14 "0789..." casa com o EAN-13 "789...". */
const chaveGtin = (s: string) => s.trim().replace(/^0+/, '');

const raizCnpj = (cnpj: string) =>
  cnpj.length === 14 ? cnpj.slice(0, 8) : null;
const unidade = (u: string) => u.trim().toUpperCase();
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

// ---------- índice ----------

type Mapa = Map<string, Map<string, Set<string>>>;

export interface IndiceCadastro {
  produtos: Map<string, ProdutoCadastro>;
  vinculoExato: Mapa;
  vinculoNormal: Mapa;
  /** Vínculos cujo código tem cara de GTIN, pelo GTIN sem zeros à esquerda. */
  vinculoGtin: Mapa;
  /** Raiz do CNPJ para os CNPJs dela que aparecem no cadastro. */
  porRaiz: Map<string, Set<string>>;
  /** CNPJs e CPFs que aparecem em alguma seção. */
  documentos: Set<string>;
  barras: Map<string, Set<string>>;
  fatores: Map<string, FatorCadastro[]>;
  notas: Map<string, string | null>;
}

function juntar(m: Mapa, fornecedor: string, codigo: string, produto: string) {
  let porCodigo = m.get(fornecedor);
  if (!porCodigo) m.set(fornecedor, (porCodigo = new Map()));
  let s = porCodigo.get(codigo);
  if (!s) porCodigo.set(codigo, (s = new Set()));
  s.add(produto);
}

/** Monta os índices uma vez por cadastro (o cadastro real tem dezenas de milhares de linhas). */
export function prepararCadastro(c: Cadastro): IndiceCadastro {
  const produtos = new Map(c.produtos.map((p) => [p.codigo, p]));
  const vinculoExato: Mapa = new Map();
  const vinculoNormal: Mapa = new Map();
  const vinculoGtin: Mapa = new Map();
  const documentos = new Set<string>();
  for (const v of c.vinculos) {
    juntar(
      vinculoExato,
      v.fornecedor,
      chaveExata(v.codigoFornecedor),
      v.produto,
    );
    const n = normalizarCodigo(v.codigoFornecedor);
    if (n) juntar(vinculoNormal, v.fornecedor, n, v.produto);
    if (pareceGtin(v.codigoFornecedor))
      juntar(
        vinculoGtin,
        v.fornecedor,
        chaveGtin(v.codigoFornecedor),
        v.produto,
      );
    documentos.add(v.fornecedor);
  }
  const barras = new Map<string, Set<string>>();
  for (const p of c.produtos) {
    if (!p.codigoBarras || !pareceGtin(p.codigoBarras)) continue;
    const k = chaveGtin(p.codigoBarras);
    let s = barras.get(k);
    if (!s) barras.set(k, (s = new Set()));
    s.add(p.codigo);
  }
  const fatores = new Map<string, FatorCadastro[]>();
  for (const f of c.fatores) {
    const k = `${f.fornecedor}\u0001${f.produto}`;
    const l = fatores.get(k);
    if (l) l.push(f);
    else fatores.set(k, [f]);
    documentos.add(f.fornecedor);
  }
  for (const f of c.fornecedores) documentos.add(f.cnpjCpf);
  const porRaiz = new Map<string, Set<string>>();
  for (const d of documentos) {
    const r = raizCnpj(d);
    if (!r) continue;
    let s = porRaiz.get(r);
    if (!s) porRaiz.set(r, (s = new Set()));
    s.add(d);
  }
  const notas = new Map(c.notasLancadas.map((n) => [n.chave, n.entrada]));
  return {
    produtos,
    vinculoExato,
    vinculoNormal,
    vinculoGtin,
    porRaiz,
    documentos,
    barras,
    fatores,
    notas,
  };
}

// ---------- casamento ----------

/** Produtos achados e, para cada um, o CNPJ do vínculo (null: código de barras). */
type Achados = Map<string, string | null>;

function buscarVinculo(
  m: Mapa,
  fornecedores: string[],
  codigo: string,
): Achados {
  const achados: Achados = new Map();
  if (!codigo) return achados;
  for (const f of fornecedores)
    for (const p of m.get(f)?.get(codigo) ?? [])
      if (!achados.has(p)) achados.set(p, f);
  return achados;
}

function buscarBarras(ind: IndiceCadastro, codigo: string): Achados {
  if (!pareceGtin(codigo)) return new Map();
  return new Map(
    [...(ind.barras.get(chaveGtin(codigo)) ?? [])].map((p) => [p, null]),
  );
}

/** Avisos que não rebaixam, mas tiram a sugestão da alta (a pessoa confere). */
export const AVISOS_QUE_LIMITAM: readonly TipoAviso[] = [
  'ncm-diferente',
  'unidade-diferente',
  'custo-fora',
];

const REBAIXA: Record<Confianca, Confianca> = {
  alta: 'media',
  media: 'baixa',
  baixa: 'baixa',
  nenhuma: 'nenhuma',
};

/**
 * Fator do par fornecedor e produto: entre os do emitente e os das filiais
 * (mesma raiz), primeiro o da mesma unidade da nota, depois o do emitente,
 * depois o da entrada mais recente.
 */
export function fatorDoPar(
  ind: IndiceCadastro,
  emitente: string | null,
  filiais: string[],
  produto: string,
  uCom: string,
): FatorSugerido | null {
  const u = unidade(uCom);
  let melhor: { f: FatorCadastro; deFilial: boolean; confere: boolean } | null =
    null;
  const ordem = (x: {
    f: FatorCadastro;
    deFilial: boolean;
    confere: boolean;
  }) =>
    [x.confere ? 1 : 0, x.deFilial ? 0 : 1, x.f.ultimaEntrada ?? ''] as const;
  const fornecedores = emitente ? [emitente, ...filiais] : filiais;
  for (const d of fornecedores)
    for (const f of ind.fatores.get(`${d}\u0001${produto}`) ?? []) {
      const atual = {
        f,
        deFilial: d !== emitente,
        confere: unidade(f.unidadeCompra) === u,
      };
      if (!melhor) {
        melhor = atual;
        continue;
      }
      const a = ordem(atual);
      const b = ordem(melhor);
      if (
        a[0] > b[0] ||
        (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))
      )
        melhor = atual;
    }
  if (!melhor) return null;
  return {
    fator: melhor.f.fator,
    unidadeCompra: melhor.f.unidadeCompra,
    ultimaEntrada: melhor.f.ultimaEntrada,
    fornecedor: melhor.f.fornecedor,
    deFilial: melhor.deFilial,
    unidadeConfere: melhor.confere,
  };
}

function candidato(
  ind: IndiceCadastro,
  codigo: string,
  fornecedor: string | null,
): Candidato {
  const p = ind.produtos.get(codigo)!;
  return {
    codigo,
    descricao: p.descricao,
    unidade: p.unidade,
    ativo: p.ativo,
    reaproveitadoEm: p.reaproveitadoEm,
    fornecedor,
  };
}

/** Ordem estável dos candidatos: código numérico pelo valor, depois como texto. */
function compararCodigo(a: string, b: string): number {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  if (na !== nb) return na ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sugestão para um item. `emitente`: CNPJ ou CPF; `filiais`: os outros CNPJs da raiz. */
export function sugerirItem(
  ind: IndiceCadastro,
  emitente: string | null,
  filiais: string[],
  item: ItemNota,
): SugestaoItem {
  const doEmitente = emitente ? [emitente] : [];
  const exato = chaveExata(item.cProd);
  const normal = normalizarCodigo(item.cProd);
  const gtin = pareceGtin(item.cEAN) ? chaveGtin(item.cEAN) : '';
  const tentativas: [Caminho, () => Achados][] = [
    [
      'vinculo-emitente',
      () => buscarVinculo(ind.vinculoExato, doEmitente, exato),
    ],
    ['vinculo-raiz', () => buscarVinculo(ind.vinculoExato, filiais, exato)],
    [
      'codigo-emitente',
      () => buscarVinculo(ind.vinculoNormal, doEmitente, normal),
    ],
    ['codigo-raiz', () => buscarVinculo(ind.vinculoNormal, filiais, normal)],
    [
      'cean-vinculo-emitente',
      () => buscarVinculo(ind.vinculoGtin, doEmitente, gtin),
    ],
    ['cean', () => buscarBarras(ind, item.cEAN)],
    ['cean-vinculo-raiz', () => buscarVinculo(ind.vinculoGtin, filiais, gtin)],
    ['cprod-ean', () => buscarBarras(ind, item.cProd)],
  ];
  const sugestao: SugestaoItem = {
    nItem: item.nItem,
    caminho: null,
    codigo: null,
    candidatos: [],
    ambiguo: false,
    confianca: 'nenhuma',
    fator: null,
    avisos: [],
  };
  for (const [caminho, buscar] of tentativas) {
    const achados = buscar();
    if (achados.size === 0) continue;
    sugestao.caminho = caminho;
    sugestao.candidatos = [...achados.keys()]
      .sort(compararCodigo)
      .map((c) => candidato(ind, c, achados.get(c) ?? null));
    break;
  }
  const { caminho, candidatos, avisos } = sugestao;
  if (!caminho) return sugestao;

  if (candidatos.length > 1) {
    sugestao.ambiguo = true;
    const ativos = candidatos.filter((c) => c.ativo);
    if (ativos.length === 1)
      avisos.push({
        tipo: 'ambiguo-um-ativo',
        texto: `Dos ${candidatos.length} produtos, só o ${ativos[0].codigo} está ativo.`,
      });
    return sugestao;
  }

  const escolhido = candidatos[0];
  const produto = ind.produtos.get(escolhido.codigo)!;
  sugestao.codigo = escolhido.codigo;
  let confianca: Confianca = CONFIANCA_CAMINHO[caminho];
  const fator = fatorDoPar(ind, emitente, filiais, escolhido.codigo, item.uCom);
  sugestao.fator = fator;

  if (!produto.ativo) {
    confianca = REBAIXA[confianca];
    avisos.push({
      tipo: 'inativo',
      texto:
        'Produto inativo no cadastro: para lançar, reative ou troque o produto.',
    });
  }
  // Código reaproveitado: o vínculo pode ser da mercadoria antiga se o par
  // não teve compra depois do reaproveitamento. Só nos caminhos de vínculo
  // (o código de barras é do produto como está hoje).
  if (produto.reaproveitadoEm && escolhido.fornecedor !== null) {
    const compra = fator?.ultimaEntrada ?? null;
    if (!compra || compra < produto.reaproveitadoEm) {
      confianca = REBAIXA[confianca];
      avisos.push({
        tipo: 'reaproveitado',
        texto: `Código reaproveitado em ${dataBR(produto.reaproveitadoEm)} e ${compra ? `a última compra deste fornecedor é de ${dataBR(compra)}` : 'sem compra deste fornecedor registrada'}: o vínculo pode ser da mercadoria antiga.`,
      });
    }
  }
  const ncmNota = item.NCM.trim();
  if (produto.ncm && /^\d{8}$/.test(ncmNota) && ncmNota !== produto.ncm)
    avisos.push({
      tipo: 'ncm-diferente',
      texto: `NCM do cadastro ${produto.ncm}, na nota ${ncmNota}.`,
    });
  if (fator && !fator.unidadeConfere)
    avisos.push({
      tipo: 'unidade-diferente',
      texto: `O fator conhecido (${fator.fator}) é para ${fator.unidadeCompra}; a nota vem em ${item.uCom.trim() || 'unidade não informada'}.`,
    });
  const custoNota = custoNaUnidadeDeVenda(item, produto, fator);
  if (custoNota !== null && produto.custo) {
    const dif = (custoNota - produto.custo) / produto.custo;
    if (Math.abs(dif) > LIMITE_CUSTO)
      avisos.push({
        tipo: 'custo-fora',
        texto: `Custo na nota ${formatarValor(custoNota)} por ${produto.unidade}, ${Math.round(Math.abs(dif) * 100)}% ${dif > 0 ? 'acima' : 'abaixo'} do cadastro (${formatarValor(produto.custo)}).`,
      });
  }
  // NCM, unidade do fator ou custo diferentes do cadastro: o produto pode
  // estar certo, mas a pessoa precisa olhar. Limitam a confiança a média.
  if (
    confianca === 'alta' &&
    avisos.some((a) =>
      (AVISOS_QUE_LIMITAM as readonly string[]).includes(a.tipo),
    )
  )
    confianca = 'media';
  sugestao.confianca = confianca;
  return sugestao;
}

/** vUnCom levado à unidade de venda: pelo fator da mesma unidade, ou direto se a unidade é a mesma. */
function custoNaUnidadeDeVenda(
  item: ItemNota,
  produto: ProdutoCadastro,
  fator: FatorSugerido | null,
): number | null {
  const v = item.vUnCom;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  if (fator?.unidadeConfere) return v / fator.fator;
  if (unidade(item.uCom) === unidade(produto.unidade)) return v;
  return null;
}

const formatarValor = (v: number) =>
  v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

/**
 * Produtos para os quais o emitente tem vínculo exato deste código (o
 * caminho (a)), na ordem dos códigos. Usado no XML de importação: o cProd
 * só muda quando aponta para outro produto.
 */
export function vinculosDoCodigo(
  ind: IndiceCadastro,
  emitente: string | null,
  cProd: string,
): string[] {
  if (!emitente) return [];
  return [
    ...(ind.vinculoExato.get(emitente)?.get(chaveExata(cProd)) ?? []),
  ].sort(compararCodigo);
}

/** CNPJs da mesma raiz do emitente, sem ele. */
export function filiaisDo(ind: IndiceCadastro, cnpj: string | null): string[] {
  const r = cnpj ? raizCnpj(cnpj) : null;
  if (!r) return [];
  return [...(ind.porRaiz.get(r) ?? [])].filter((d) => d !== cnpj).sort();
}

/** Sugestões de todos os itens de uma nota e o aviso de nota já lançada. */
export function sugerirNota(
  ind: IndiceCadastro,
  nota: NotaParaCasar,
): ResultadoNota {
  const emitente = nota.cnpjEmitente || nota.cpfEmitente || null;
  const filiais = filiaisDo(ind, nota.cnpjEmitente);
  const chave = nota.chave ?? null;
  const lancada = chave !== null && ind.notas.has(chave);
  return {
    notaLancada: lancada ? { entrada: ind.notas.get(chave) ?? null } : null,
    emitenteConhecido:
      !!emitente && (ind.documentos.has(emitente) || filiais.length > 0),
    itens: nota.itens.map((i) => sugerirItem(ind, emitente, filiais, i)),
  };
}
