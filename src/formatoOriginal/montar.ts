// Modo Formato original da aba XML: monta o layout a partir do próprio XML,
// sem executar nada do arquivo e sem folha de estilo (xml-stylesheet é só
// texto). Lógica pura sobre a árvore compacta do leitor próprio
// (src/xml/arvore.ts), lida no serviço de leitura pesada: sem DOM, sem
// DOMParser.
//
// Regras:
// - grupos viram seções com título; uma cadeia de grupos com um filho só
//   (ICMS > ICMS00) vira um título só;
// - elementos repetidos (o mesmo nome entre irmãos) viram uma tabela: as
//   colunas são os atributos e os filhos simples; os grupos de cada linha
//   ficam no detalhe dela;
// - valores simples viram pares rótulo e valor; atributos aparecem junto do
//   elemento;
// - NF-e: rótulos em português (com a tag visível), itens com as colunas
//   principais e o resto no detalhe, e o significado dos códigos comuns;
// - valores formatados para leitura (datas dd/mm/aaaa, números no formato
//   brasileiro); o valor exato fica no modo .XML.

import {
  atributosDe,
  filhosDe,
  NENHUM,
  nomeDe,
  TIPOS,
  valorDe,
  type ArvoreXml,
} from '../xml/arvore';
import {
  CODIGOS_NFE,
  COLUNAS_ITENS_NFE,
  CST_POR_IMPOSTO,
  ROTULOS_NFE,
} from './rotulos';

/** Acima de tantos elementos, o Formato original não é montado. */
export const LIMITE_ELEMENTOS_FORMATO = 200_000;

export const MENSAGEM_FORMATO_GRANDE =
  'Arquivo grande demais para o Formato original. Veja o arquivo no modo .XML.';

export interface Campo {
  tag: string;
  atributo: boolean;
  /** Rótulo em português (NF-e), ou null: só a tag. */
  rotulo: string | null;
  /** Valor formatado para leitura. */
  valor: string;
  /** Significado do código (CRT 3: Regime normal), ou null. */
  sentido: string | null;
  /** O valor como está no XML. */
  exato: string;
}

export interface Coluna {
  tag: string;
  atributo: boolean;
  rotulo: string | null;
  /** Só números: alinhada à direita. */
  numerica: boolean;
}

export interface Linha {
  celulas: string[];
  /** O resto do elemento (campos e grupos que não viraram coluna). */
  detalhe: Bloco[];
}

export type Bloco =
  | { tipo: 'campos'; campos: Campo[] }
  | {
      tipo: 'secao';
      /** A cadeia de tags (ICMS / ICMS00). */
      tags: string[];
      /** Título em português, ou null: a tag é o título. */
      titulo: string | null;
      atributos: Campo[];
      blocos: Bloco[];
      /** As seções de dentro ficam lado a lado (impostos do item). */
      lado: boolean;
    }
  | {
      tipo: 'tabela';
      tags: string[];
      titulo: string | null;
      /** "4 itens", "3 linhas". */
      quantidade: string;
      colunas: Coluna[];
      linhas: Linha[];
    };

export type FormatoOriginal =
  | {
      status: 'ok';
      /** É NF-e (rótulos e códigos da NF-e). */
      nfe: boolean;
      /** Nome do elemento raiz. */
      raiz: string;
      /** Versão (atributo versao da raiz), ou null. */
      versao: string | null;
      blocos: Bloco[];
    }
  | { status: 'grande'; mensagem: string }
  | { status: 'vazio' };

const ELEMENTO = TIPOS.indexOf('elemento');
const TEXTO = TIPOS.indexOf('texto');
const CDATA = TIPOS.indexOf('cdata');

// ---------- formatação dos valores ----------

const RE_DATA =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const RE_DECIMAL = /^-?\d+\.\d+$/;

const casas = (t: string) => (t.split('.')[1] ?? '').length;

function numeroBr(t: string, minimo: number): string {
  const n = Number(t);
  const max = Math.max(minimo, casas(t));
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: minimo,
    maximumFractionDigits: max,
  });
}

/** Tag de valor em dinheiro (vProd, vICMS; precoUnitario, valorTotal). */
const ehValor = (tag: string) =>
  /^v[A-Z]/.test(tag) || /preco|valor/i.test(tag);

/** Tag de percentual da NF-e (pICMS, pMVAST). */
const ehPercentual = (tag: string) => /^p[A-Z]/.test(tag);

/**
 * O valor formatado para leitura e o significado do código. `contexto`: as
 * tags de cima (do pai para a raiz), para saber de que imposto é o CST.
 * `nfe`: só na NF-e os códigos ganham significado.
 */
export function formatarValor(
  tag: string,
  texto: string,
  contexto: readonly string[] = [],
  nfe = false,
): { valor: string; sentido: string | null } {
  const t = texto.trim();
  const data = RE_DATA.exec(t);
  if (data) {
    const [, ano, mes, dia, hora, minuto] = data;
    return {
      valor: `${dia}/${mes}/${ano}${hora ? ` ${hora}:${minuto}` : ''}`,
      sentido: null,
    };
  }
  if (/^CNPJ/i.test(tag) && /^\d{14}$/.test(t))
    return {
      valor: t.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        '$1.$2.$3/$4-$5',
      ),
      sentido: null,
    };
  if (/^CPF/i.test(tag) && /^\d{11}$/.test(t))
    return {
      valor: t.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
      sentido: null,
    };
  if (tag === 'CEP' && /^\d{8}$/.test(t))
    return { valor: t.replace(/^(\d{5})(\d{3})$/, '$1-$2'), sentido: null };
  if (tag === 'fone' && /^\d{10,11}$/.test(t))
    return {
      valor: t.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'),
      sentido: null,
    };
  // Versão (versao="4.00") fica como está: não é um número.
  if (RE_DECIMAL.test(t) && !/^vers/i.test(tag)) {
    if (ehValor(tag)) return { valor: numeroBr(t, 2), sentido: null };
    if (nfe && ehPercentual(tag))
      return { valor: `${numeroBr(t, 0)}%`, sentido: null };
    return { valor: numeroBr(t, 0), sentido: null };
  }
  if (!nfe) return { valor: t, sentido: null };
  let tabela: Readonly<Record<string, string>> | undefined;
  if (tag === 'CST' || tag === 'CSOSN') {
    const imposto = contexto.find((c) => /^(ICMS|IPI|PIS|COFINS)/.test(c));
    if (imposto?.startsWith('ICMS')) tabela = CST_POR_IMPOSTO.ICMS;
    else if (imposto?.startsWith('IPI')) tabela = CST_POR_IMPOSTO.IPI;
    else if (imposto) tabela = CST_POR_IMPOSTO.PIS;
  } else tabela = CODIGOS_NFE[tag];
  const sentido =
    tabela && Object.hasOwn(tabela, t) ? (tabela[t] ?? null) : null;
  return { valor: t, sentido };
}

// ---------- árvore ----------

function elementos(a: ArvoreXml, no: number): number[] {
  return filhosDe(a, no).filter((f) => a.tipo[f] === ELEMENTO);
}

/** Texto direto do elemento (textos e CDATA), sem as bordas em branco. */
function textoDe(a: ArvoreXml, no: number): string {
  let t = '';
  for (const f of filhosDe(a, no))
    if (a.tipo[f] === TEXTO || a.tipo[f] === CDATA) t += valorDe(a, f);
  return t.trim();
}

const ehFolha = (a: ArvoreXml, no: number) => elementos(a, no).length === 0;

/** Monta o Formato original da árvore (lida pelo leitor próprio). */
export function montarFormato(a: ArvoreXml): FormatoOriginal {
  let quantos = 0;
  for (let i = 0; i < a.quantidade; i++) if (a.tipo[i] === ELEMENTO) quantos++;
  if (quantos > LIMITE_ELEMENTOS_FORMATO)
    return { status: 'grande', mensagem: MENSAGEM_FORMATO_GRANDE };
  const raiz = elementos(a, NENHUM)[0];
  if (raiz === undefined) return { status: 'vazio' };
  const nomeRaiz = nomeDe(a, raiz);
  const nfe = nomeRaiz === 'nfeProc' || nomeRaiz === 'NFe';
  const versao =
    atributosDe(a, raiz).find((x) => x.nome === 'versao')?.valor ?? null;

  const rotulo = (tag: string): string | null =>
    nfe ? (ROTULOS_NFE[tag] ?? null) : null;

  function campo(
    tag: string,
    texto: string,
    contexto: readonly string[],
    atributo = false,
  ): Campo {
    const f = formatarValor(tag, texto, contexto, nfe);
    return {
      tag,
      atributo,
      rotulo: rotulo(tag),
      valor: f.valor,
      sentido: f.sentido,
      exato: texto,
    };
  }

  const atributos = (no: number, contexto: readonly string[]): Campo[] =>
    atributosDe(a, no).map((x) => campo(x.nome, x.valor, contexto, true));

  /** Cadeia de grupos com um filho só e sem atributos: um título só. */
  function cadeia(no: number): number[] {
    const nos = [no];
    let n = no;
    for (;;) {
      const filhos = elementos(a, n);
      if (
        a.quantosAtributos[n] !== 0 ||
        filhos.length !== 1 ||
        ehFolha(a, filhos[0]) ||
        textoDe(a, n) !== ''
      )
        break;
      n = filhos[0];
      nos.push(n);
    }
    return nos;
  }

  /** Os blocos de dentro de `no`: campos, seções e tabelas, na ordem. */
  function blocosDe(no: number, contexto: readonly string[]): Bloco[] {
    const ctx = [nomeDe(a, no), ...contexto];
    const filhos = elementos(a, no);
    const blocos: Bloco[] = [];
    const feitos = new Set<string>();
    let campos: Campo[] | null = null;
    for (const f of filhos) {
      const nome = nomeDe(a, f);
      if (ehFolha(a, f)) {
        if (!campos) {
          campos = [];
          blocos.push({ tipo: 'campos', campos });
        }
        campos.push(campo(nome, textoDe(a, f), ctx));
        campos.push(...atributos(f, ctx));
        continue;
      }
      campos = null;
      if (feitos.has(nome)) continue;
      const iguais = filhos.filter((x) => nomeDe(a, x) === nome);
      // Itens da NF-e: sempre em tabela, mesmo com um item só.
      if (iguais.length > 1 || (nfe && nome === 'det')) {
        feitos.add(nome);
        blocos.push(tabela(iguais, ctx));
      } else blocos.push(secao(f, ctx));
    }
    return blocos;
  }

  function secao(no: number, contexto: readonly string[]): Bloco {
    const nos = cadeia(no);
    const ultimo = nos[nos.length - 1];
    const tags = nos.map((n) => nomeDe(a, n));
    const ctx = [...tags.slice(0, -1).reverse(), ...contexto];
    const titulos = tags.map(rotulo);
    const titulo = titulos.some((t) => t !== null)
      ? titulos.map((t, i) => t ?? tags[i]).join(' › ')
      : null;
    const filhos = elementos(a, ultimo);
    const nomeUltimo = tags[tags.length - 1];
    // Todos os filhos iguais e repetidos: a tabela é o corpo da seção.
    if (
      filhos.length > 1 &&
      filhos.every((f) => nomeDe(a, f) === nomeDe(a, filhos[0]))
    ) {
      return {
        tipo: 'secao',
        tags,
        titulo,
        atributos: atributos(ultimo, ctx),
        blocos: [tabela(filhos, [nomeUltimo, ...ctx])],
        lado: false,
      };
    }
    return {
      tipo: 'secao',
      tags,
      titulo,
      atributos: atributos(ultimo, ctx),
      blocos: blocosDe(ultimo, ctx),
      lado: nfe && nomeUltimo === 'imposto',
    };
  }

  function tabela(lista: number[], contexto: readonly string[]): Bloco {
    const tag = nomeDe(a, lista[0]);
    const itensNfe = nfe && tag === 'det';
    const ctx = [tag, ...contexto];
    /** De onde vêm as colunas de cada linha (no item da NF-e, o prod). */
    const fonte = (no: number) =>
      itensNfe
        ? (elementos(a, no).find((f) => nomeDe(a, f) === 'prod') ?? no)
        : no;
    const nomesAtributos: string[] = [];
    for (const no of lista)
      for (const x of atributosDe(a, no))
        if (!nomesAtributos.includes(x.nome)) nomesAtributos.push(x.nome);
    const nomesColunas: string[] = [];
    if (itensNfe) nomesColunas.push(...COLUNAS_ITENS_NFE);
    else
      for (const no of lista)
        for (const f of elementos(a, no))
          if (ehFolha(a, f) && !nomesColunas.includes(nomeDe(a, f)))
            nomesColunas.push(nomeDe(a, f));

    const linhas: Linha[] = [];
    const brutos: string[][] = [];
    for (const no of lista) {
      const src = fonte(no);
      const folhas = new Map<string, string>();
      for (const f of elementos(a, src))
        if (ehFolha(a, f) && !folhas.has(nomeDe(a, f)))
          folhas.set(nomeDe(a, f), textoDe(a, f));
      const attrs = new Map(atributosDe(a, no).map((x) => [x.nome, x.valor]));
      const bruto = [
        ...nomesAtributos.map((n) => attrs.get(n) ?? ''),
        ...nomesColunas.map((n) => folhas.get(n) ?? ''),
      ];
      brutos.push(bruto);
      const celulas = [
        ...nomesAtributos.map((n) =>
          attrs.has(n)
            ? formatarValor(n, attrs.get(n) ?? '', ctx, nfe).valor
            : '',
        ),
        ...nomesColunas.map((n) =>
          folhas.has(n)
            ? formatarValor(n, folhas.get(n) ?? '', ctx, nfe).valor
            : '',
        ),
      ];
      // Detalhe: o que não virou coluna.
      const detalhe: Bloco[] = [];
      if (itensNfe) {
        const resto = elementos(a, src)
          .filter(
            (f) => ehFolha(a, f) && !COLUNAS_ITENS_NFE.includes(nomeDe(a, f)),
          )
          .map((f) => campo(nomeDe(a, f), textoDe(a, f), ['prod', ...ctx]));
        if (resto.length) detalhe.push({ tipo: 'campos', campos: resto });
        for (const f of elementos(a, no)) {
          if (f === src) continue;
          if (ehFolha(a, f))
            detalhe.push({
              tipo: 'campos',
              campos: [campo(nomeDe(a, f), textoDe(a, f), ctx)],
            });
          else detalhe.push(secao(f, ctx));
        }
      } else {
        for (const f of elementos(a, no))
          if (!ehFolha(a, f)) detalhe.push(secao(f, ctx));
      }
      linhas.push({ celulas, detalhe });
    }
    const todas = [...nomesAtributos, ...nomesColunas];
    const colunas: Coluna[] = todas.map((n, i) => ({
      tag: n,
      atributo: i < nomesAtributos.length,
      rotulo: rotulo(n),
      numerica:
        brutos.some((b) => b[i] !== '') &&
        brutos.every((b) => b[i] === '' || /^-?\d+([.,]\d+)?$/.test(b[i])) &&
        !(nfe && ['NCM', 'CFOP', 'cProd', 'CEST'].includes(n)),
    }));
    const n = lista.length;
    return {
      tipo: 'tabela',
      tags: [tag],
      titulo: rotulo(tag),
      quantidade: `${n} ${itensNfe ? (n === 1 ? 'item' : 'itens') : n === 1 ? 'linha' : 'linhas'}`,
      colunas,
      linhas,
    };
  }

  let blocos: Bloco[];
  if (nfe) {
    const nfeEl =
      nomeRaiz === 'NFe'
        ? raiz
        : elementos(a, raiz).find((f) => nomeDe(a, f) === 'NFe');
    const inf =
      nfeEl !== undefined
        ? elementos(a, nfeEl).find((f) => nomeDe(a, f) === 'infNFe')
        : undefined;
    blocos = [];
    if (inf !== undefined) {
      const attrs = atributos(inf, ['NFe']);
      if (attrs.length) blocos.push({ tipo: 'campos', campos: attrs });
      blocos.push(...blocosDe(inf, ['NFe', nomeRaiz]));
      // A assinatura e o protocolo, depois da nota.
      if (nfeEl !== undefined)
        for (const f of elementos(a, nfeEl))
          if (f !== inf) blocos.push(secao(f, ['NFe']));
    }
    if (nomeRaiz === 'nfeProc')
      for (const f of elementos(a, raiz))
        if (f !== nfeEl) blocos.push(secao(f, [nomeRaiz]));
    if (inf === undefined) blocos = [secao(raiz, [])];
  } else blocos = [secao(raiz, [])];
  return { status: 'ok', nfe, raiz: nomeRaiz, versao, blocos };
}
