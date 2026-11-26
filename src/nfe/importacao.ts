// XML de importação: uma cópia separada do XML da NF-e para o sistema de
// gestão importar a nota já vinculada ao produto da casa e na unidade de
// venda. O XML original nunca é alterado; a cópia é outro arquivo
// (<nome da nota> - importacao.xml), sem a assinatura e com uma marca do app
// no topo (uma instrução de processamento, fora de qualquer campo fiscal).
//
// Item a item, só nos itens com produto da casa definido (escolha da pessoa,
// decisão lembrada ou o motor com confiança alta):
//   1. cEAN e cEANTrib passam a ser o código de barras do produto no
//      cadastro, como está lá. Produto sem código de barras: o item fica
//      como veio.
//   2. cProd: o original, a não ser que o emitente tenha, no cadastro, um
//      vínculo desse cProd para OUTRO produto; aí vira "PSR-" + cProd (até
//      60 caracteres, cortando o fim do original), para o sistema de gestão
//      não seguir o vínculo antigo.
//   3. Unidade: com fator conhecido para a unidade da nota, qCom = qCom x
//      fator, uCom = unidade de venda, vUnCom = vProd / nova qCom; o mesmo no
//      lado tributável quando uTrib é a mesma unidade de compra. vProd,
//      impostos e totais não mudam. Sem fator e com unidade diferente da de
//      venda: o item fica todo como veio (vinculado com a unidade errada, a
//      entrada pareceria pronta com a quantidade errada). Fator 1 ou mesma
//      unidade: não converte.
// Todo o resto do texto fica igual, byte a byte: a cópia é feita trocando
// só o conteúdo desses elementos no texto original, sem reserializar.
//
// Lógica pura, sem DOM e sem Electron.

import type { EscolhaCodigoCasa } from '../cadastro/codigoCasa';

/** Fim do nome do arquivo da cópia: <nome da nota> - importacao.xml. */
export const SUFIXO_IMPORTACAO = ' - importacao.xml';

/** Prefixo do cProd quando o vínculo do emitente é de outro produto. */
export const PREFIXO_CPROD = 'PSR-';
/** Tamanho máximo do cProd no leiaute. */
export const LIMITE_CPROD = 60;
/** Casas decimais do leiaute: qCom e qTrib até 4, vUnCom e vUnTrib até 10. */
export const CASAS_QUANTIDADE = 4;
export const CASAS_VALOR_UNITARIO = 10;

/** Alvo e atributo da marca no topo da cópia. */
export const ALVO_MARCA = 'ps-reader';
const RE_MARCA =
  /^﻿?\s*(?:<\?xml\s[^?]*\?>\s*)?<\?ps-reader\s+[^?]*\bcopia="importacao"/;

/** Aviso ao abrir uma cópia de importação. */
export const AVISO_COPIA_IMPORTACAO =
  'Esta é uma cópia gerada pelo PS Reader para importar no sistema de gestão, não a nota original. Para o DANFE e para guardar, use o XML original da nota.';

/** O texto é uma cópia de importação gerada pelo app (tem a marca no topo). */
export function ehCopiaImportacao(texto: string): boolean {
  return RE_MARCA.test(texto.slice(0, 1000));
}

/** O que o cadastro diz do produto escolhido num item. */
export interface DadosCadastroItem {
  /** O produto ainda está no cadastro carregado. */
  existe: boolean;
  codigoBarras: string | null;
  /** Unidade de venda do cadastro. */
  unidade: string;
  /** Produtos para os quais o emitente tem vínculo exato deste cProd. */
  vinculosCProd: string[];
}

/** Um item da nota, com o que o plano usa. */
export interface ItemParaImportacao {
  nItem: string;
  cProd: string;
  xProd: string;
  uCom: string;
}

export type SituacaoImportacao =
  | 'vinculado'
  | 'convertido'
  | 'sem-produto'
  | 'sem-codigo-barras'
  | 'sem-fator';

export const ROTULO_SITUACAO: Record<SituacaoImportacao, string> = {
  vinculado: 'Vinculado',
  convertido: 'Vinculado e convertido de unidade',
  'sem-produto': 'Sem produto da casa definido',
  'sem-codigo-barras': 'Produto sem código de barras no cadastro',
  'sem-fator': 'Sem fator para a unidade da nota',
};

export interface PlanoItem {
  nItem: string;
  xProd: string;
  situacao: SituacaoImportacao;
  /** Código da casa (null: sem produto). */
  codigo: string | null;
  /** Os campos que mudam; null quando o item fica como veio. */
  troca: {
    cEAN: string;
    cProd: string;
    /** O cProd ganhou o prefixo (vínculo do emitente para outro produto). */
    cProdTrocado: boolean;
    /** Conversão de unidade, ou null. */
    conversao: {
      fator: number;
      unidadeCompra: string;
      unidadeVenda: string;
    } | null;
  } | null;
  /** Explicação curta para a lista do resumo. */
  detalhe: string;
}

export interface PlanoImportacao {
  itens: PlanoItem[];
  vinculados: number;
  convertidos: number;
  comoVieram: number;
  porMotivo: Record<'sem-produto' | 'sem-codigo-barras' | 'sem-fator', number>;
}

const unidade = (u: string) => u.trim().toUpperCase();

/** cProd com o prefixo, cortando o fim do original para caber no leiaute. */
export function cProdComPrefixo(cProd: string): string {
  return (PREFIXO_CPROD + cProd).slice(0, LIMITE_CPROD);
}

/**
 * O plano item a item. `escolhas`: só as definidas, por nItem (o "nenhum"
 * não entra); `dados`: o que o cadastro diz do produto de cada uma.
 */
export function planejarImportacao(
  itens: readonly ItemParaImportacao[],
  escolhas: ReadonlyMap<string, EscolhaCodigoCasa>,
  dados: ReadonlyMap<string, DadosCadastroItem>,
): PlanoImportacao {
  const plano: PlanoItem[] = itens.map((i) => {
    const e = escolhas.get(i.nItem);
    const d = dados.get(i.nItem);
    const base = { nItem: i.nItem, xProd: i.xProd };
    if (!e || e.codigo === null || !d || !d.existe)
      return {
        ...base,
        situacao: 'sem-produto',
        codigo: null,
        troca: null,
        detalhe:
          e?.codigo && d && !d.existe
            ? `O produto ${e.codigo} não está no cadastro carregado.`
            : 'Sem produto da casa definido.',
      };
    const codigo = e.codigo;
    const barras = d.codigoBarras?.trim() ?? '';
    if (!barras)
      return {
        ...base,
        situacao: 'sem-codigo-barras',
        codigo,
        troca: null,
        detalhe: `O produto ${codigo} não tem código de barras no cadastro.`,
      };
    const venda = d.unidade.trim() || e.unidade.trim();
    const uCom = unidade(i.uCom);
    let conversao: NonNullable<PlanoItem['troca']>['conversao'] = null;
    if (venda && uCom !== unidade(venda)) {
      const fatorServe = e.fator !== null && unidade(e.unidadeCompra) === uCom;
      if (!fatorServe)
        return {
          ...base,
          situacao: 'sem-fator',
          codigo,
          troca: null,
          detalhe: `A nota vem em ${i.uCom.trim() || 'unidade não informada'} e o produto ${codigo} é vendido em ${venda}, sem fator conhecido para ${i.uCom.trim() || 'essa unidade'}.`,
        };
      if (e.fator !== 1)
        conversao = {
          fator: e.fator!,
          unidadeCompra: i.uCom.trim(),
          unidadeVenda: venda,
        };
    }
    const outro = d.vinculosCProd.some((p) => p !== codigo);
    const cProd = outro ? cProdComPrefixo(i.cProd) : i.cProd;
    const partes = [`Produto ${codigo}, código de barras ${barras}`];
    if (outro)
      partes.push(
        `código ${cProd} (o código ${i.cProd} está vinculado a outro produto neste fornecedor)`,
      );
    if (conversao)
      partes.push(
        `${conversao.fator.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} ${conversao.unidadeVenda} por ${conversao.unidadeCompra}`,
      );
    return {
      ...base,
      situacao: conversao ? 'convertido' : 'vinculado',
      codigo,
      troca: { cEAN: barras, cProd, cProdTrocado: outro, conversao },
      detalhe: `${partes.join('; ')}.`,
    };
  });
  const conta = (s: SituacaoImportacao) =>
    plano.filter((p) => p.situacao === s).length;
  const porMotivo = {
    'sem-produto': conta('sem-produto'),
    'sem-codigo-barras': conta('sem-codigo-barras'),
    'sem-fator': conta('sem-fator'),
  };
  const convertidos = conta('convertido');
  return {
    itens: plano,
    vinculados: conta('vinculado') + convertidos,
    convertidos,
    comoVieram:
      porMotivo['sem-produto'] +
      porMotivo['sem-codigo-barras'] +
      porMotivo['sem-fator'],
    porMotivo,
  };
}

// ---------- o texto da cópia ----------

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const desescapar = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Prefixo de namespace opcional nos nomes (nfe:det); o leiaute usa sem. */
const P = '(?:[A-Za-z_][\\w.-]*:)?';

/** Elemento simples `nome` dentro de `trecho`: o valor e onde ele está. */
function campo(
  trecho: string,
  nome: string,
): { inicio: number; fim: number; valor: string } | null {
  const re = new RegExp(`<(${P}${nome})(\\s[^>]*)?(?:/>|>([^<]*)</\\1\\s*>)`);
  const m = re.exec(trecho);
  if (!m) return null;
  return {
    inicio: m.index,
    fim: m.index + m[0].length,
    valor: desescapar(m[3] ?? ''),
  };
}

/** Troca o valor do elemento `nome` em `trecho` (mantém o nome e os atributos). */
function trocarCampo(trecho: string, nome: string, valor: string): string {
  const re = new RegExp(`<(${P}${nome})(\\s[^>]*)?(?:/>|>([^<]*)</\\1\\s*>)`);
  return trecho.replace(
    re,
    (_m, tag: string, attrs: string | undefined) =>
      `<${tag}${attrs ?? ''}>${escapar(valor)}</${tag}>`,
  );
}

/** Número do leiaute com `casas` casas, sem notação científica. */
export function numeroLeiaute(n: number, casas: number): string {
  return n.toFixed(casas);
}

/** Conversão de um lado (comercial ou tributável) do item. */
function converterLado(
  prod: string,
  lado: 'Com' | 'Trib',
  conv: { fator: number; unidadeCompra: string; unidadeVenda: string },
  vProd: number,
): string {
  const u = campo(prod, `u${lado}`);
  const q = campo(prod, `q${lado}`);
  if (!u || !q) return prod;
  if (unidade(u.valor) !== unidade(conv.unidadeCompra)) return prod;
  const qtd = Number(q.valor);
  if (!Number.isFinite(qtd) || qtd <= 0) return prod;
  const novaQ = Number(numeroLeiaute(qtd * conv.fator, CASAS_QUANTIDADE));
  if (novaQ <= 0) return prod;
  let r = trocarCampo(prod, `u${lado}`, conv.unidadeVenda);
  r = trocarCampo(r, `q${lado}`, numeroLeiaute(novaQ, CASAS_QUANTIDADE));
  if (Number.isFinite(vProd))
    r = trocarCampo(
      r,
      `vUn${lado}`,
      numeroLeiaute(vProd / novaQ, CASAS_VALOR_UNITARIO),
    );
  return r;
}

/** O <prod> de um item com as trocas do plano. */
function trocarProd(prod: string, t: NonNullable<PlanoItem['troca']>): string {
  let r = trocarCampo(prod, 'cProd', t.cProd);
  r = trocarCampo(r, 'cEAN', t.cEAN);
  r = trocarCampo(r, 'cEANTrib', t.cEAN);
  if (t.conversao) {
    const vProd = Number(campo(r, 'vProd')?.valor ?? NaN);
    r = converterLado(r, 'Com', t.conversao, vProd);
    r = converterLado(r, 'Trib', t.conversao, vProd);
  }
  return r;
}

/** A instrução de processamento que marca a cópia. */
export function marcaImportacao(agora: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}T${p(agora.getHours())}:${p(agora.getMinutes())}:${p(agora.getSeconds())}`;
  return `<?${ALVO_MARCA} copia="importacao" gerado-em="${data}" aviso="Copia para importacao no sistema de gestao. Nao e a NF-e original."?>`;
}

/**
 * O texto da cópia de importação a partir do texto do XML da NF-e (nfeProc
 * ou NFe). Só os itens do plano com troca mudam; a assinatura sai; a marca
 * vai logo depois da declaração XML.
 */
export function montarImportacao(
  textoNfe: string,
  plano: PlanoImportacao,
  agora: Date,
): string {
  let t = textoNfe.replace(/^﻿/, '');
  const trocas = new Map(
    plano.itens.filter((p) => p.troca).map((p) => [p.nItem, p.troca!]),
  );
  const reDet = new RegExp(`<(${P}det)(\\s[^>]*)>([\\s\\S]*?)</\\1\\s*>`, 'g');
  t = t.replace(reDet, (todo, _tag: string, attrs: string, corpo: string) => {
    const nItem = /\bnItem\s*=\s*["']\s*([^"']*?)\s*["']/.exec(attrs)?.[1];
    const troca = nItem !== undefined ? trocas.get(nItem) : undefined;
    if (!troca) return todo;
    const reProd = new RegExp(
      `(<(${P}prod)(?:\\s[^>]*)?>)([\\s\\S]*?)(</\\2\\s*>)`,
    );
    const novoCorpo = corpo.replace(
      reProd,
      (_m, abre: string, _n: string, prod: string, fecha: string) =>
        abre + trocarProd(prod, troca) + fecha,
    );
    return todo.replace(corpo, () => novoCorpo);
  });
  // Assinatura: a cópia não é o documento autorizado.
  t = t.replace(
    new RegExp(
      `[ \\t]*<(${P}Signature)[\\s>][\\s\\S]*?</\\1\\s*>(\\r?\\n)?`,
      'g',
    ),
    '',
  );
  const marca = marcaImportacao(agora);
  const decl = /^\s*<\?xml\s[^?]*\?>/.exec(t);
  if (decl) {
    const fim = decl.index + decl[0].length;
    return `${t.slice(0, fim)}\n${marca}${t.slice(fim)}`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${marca}\n${t}`;
}
