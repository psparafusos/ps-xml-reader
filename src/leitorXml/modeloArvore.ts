// Modelo da vista Árvore do leitor genérico de XML: quais nós estão abertos
// e a lista das linhas visíveis, em ordem, para a rolagem virtual desenhar só
// o que cabe na tela. Abrir um nó com 50 mil filhos só acrescenta números a
// uma lista; nenhum elemento de tela é criado para o que não aparece. Puro,
// sem DOM e sem recursão (pilha explícita).

import { NENHUM, TIPOS, nomeDe, valorDe, type ArvoreXml } from '../xml/arvore';
import type { ClassePedaco } from '../xml/texto';

const ELEMENTO = TIPOS.indexOf('elemento');
const TEXTO = TIPOS.indexOf('texto');
const COMENTARIO = TIPOS.indexOf('comentario');
const CDATA = TIPOS.indexOf('cdata');
const INSTRUCAO = TIPOS.indexOf('instrucao');
const DOCTYPE = TIPOS.indexOf('doctype');

/** Máximo de caracteres de um valor na linha da árvore (o resto: vista Texto). */
export const LIMITE_VALOR_ARVORE = 300;
/** O mesmo para o valor de um atributo. */
export const LIMITE_VALOR_ATRIBUTO = 200;

export type ClasseArvore = ClassePedaco | 'info';

export interface PedacoArvore {
  classe: ClasseArvore;
  texto: string;
}

export class ModeloArvore {
  readonly arvore: ArvoreXml;
  /** Profundidade de cada nó (0 no nível do documento). */
  readonly nivel: Uint16Array;
  readonly quantosFilhos: Int32Array;
  private readonly aberto: Uint8Array;
  /** Nós das linhas visíveis, em ordem. */
  visiveis: number[] = [];

  constructor(arvore: ArvoreXml) {
    this.arvore = arvore;
    const n = arvore.quantidade;
    this.nivel = new Uint16Array(n);
    this.quantosFilhos = new Int32Array(n);
    this.aberto = new Uint8Array(n);
    // Em ordem de documento o pai sempre vem antes do filho.
    for (let i = 0; i < n; i++) {
      const pai = arvore.pai[i];
      if (pai !== NENHUM) {
        this.nivel[i] = Math.min(this.nivel[pai] + 1, 0xffff);
        this.quantosFilhos[pai]++;
      }
    }
    for (let f = arvore.primeiraRaiz; f !== NENHUM; f = arvore.proximoIrmao[f])
      this.visiveis.push(f);
  }

  /** Elemento com um único filho de texto ou CDATA: fica na mesma linha. */
  emLinha(no: number): boolean {
    const a = this.arvore;
    if (a.tipo[no] !== ELEMENTO || this.quantosFilhos[no] !== 1) return false;
    const filho = a.tipo[a.primeiroFilho[no]];
    return filho === TEXTO || filho === CDATA;
  }

  /** Tem filhos para mostrar (abre e fecha). */
  expansivel(no: number): boolean {
    return (
      this.arvore.tipo[no] === ELEMENTO &&
      this.quantosFilhos[no] > 0 &&
      !this.emLinha(no)
    );
  }

  estaAberto(no: number): boolean {
    return this.aberto[no] === 1;
  }

  /** Nós visíveis abaixo de `no` aberto, em ordem. */
  private descendentesVisiveis(no: number): number[] {
    const a = this.arvore;
    const saida: number[] = [];
    const pilha: number[] = [];
    const empilharFilhos = (p: number) => {
      const filhos: number[] = [];
      for (let f = a.primeiroFilho[p]; f !== NENHUM; f = a.proximoIrmao[f])
        filhos.push(f);
      for (let k = filhos.length - 1; k >= 0; k--) pilha.push(filhos[k]);
    };
    empilharFilhos(no);
    while (pilha.length > 0) {
      const f = pilha.pop() as number;
      saida.push(f);
      if (this.aberto[f] && this.expansivel(f)) empilharFilhos(f);
    }
    return saida;
  }

  /** Linha do nó entre as visíveis, ou -1. */
  linhaDoNo(no: number): number {
    return this.visiveis.indexOf(no);
  }

  /** Abre o nó (se visível, os filhos entram na lista). true se mudou. */
  abrir(no: number): boolean {
    if (!this.expansivel(no) || this.aberto[no]) return false;
    this.aberto[no] = 1;
    const i = this.linhaDoNo(no);
    if (i === -1) return true;
    const novos = this.descendentesVisiveis(no);
    // concat em vez de splice(...novos): a lista pode ter milhões de itens.
    this.visiveis = this.visiveis
      .slice(0, i + 1)
      .concat(novos, this.visiveis.slice(i + 1));
    return true;
  }

  /** Fecha o nó (os descendentes saem da lista). true se mudou. */
  fechar(no: number): boolean {
    if (!this.aberto[no]) return false;
    this.aberto[no] = 0;
    const i = this.linhaDoNo(no);
    if (i === -1) return true;
    let j = i + 1;
    const nivel = this.nivel[no];
    while (j < this.visiveis.length && this.nivel[this.visiveis[j]] > nivel)
      j++;
    this.visiveis.splice(i + 1, j - i - 1);
    return true;
  }

  alternar(no: number): boolean {
    return this.aberto[no] ? this.fechar(no) : this.abrir(no);
  }

  /** Fecha todos os nós. */
  recolherTudo(): void {
    this.aberto.fill(0);
    const a = this.arvore;
    this.visiveis = [];
    for (let f = a.primeiraRaiz; f !== NENHUM; f = a.proximoIrmao[f])
      this.visiveis.push(f);
  }

  /**
   * Abertura inicial: abre por níveis (os mais de cima primeiro) enquanto a
   * lista ficar com até `maxLinhas` linhas, pulando nós com mais de
   * `maxFilhos` filhos (ficam fechados, com a contagem à vista).
   */
  abrirInicial(maxLinhas = 300, maxFilhos = 200): void {
    let fila = [...this.visiveis];
    while (fila.length > 0) {
      const proxima: number[] = [];
      for (const no of fila) {
        if (!this.expansivel(no) || this.quantosFilhos[no] > maxFilhos)
          continue;
        if (this.visiveis.length + this.quantosFilhos[no] > maxLinhas) return;
        this.abrir(no);
        const a = this.arvore;
        for (let f = a.primeiroFilho[no]; f !== NENHUM; f = a.proximoIrmao[f])
          proxima.push(f);
      }
      fila = proxima;
    }
  }

  /** O nó que mostra `no` na tela (o texto de um elemento em linha é o pai). */
  noVisivel(no: number): number {
    const pai = this.arvore.pai[no];
    return pai !== NENHUM && this.emLinha(pai) ? pai : no;
  }

  /** Abre os antepassados de `no` e devolve a linha onde ele aparece. */
  mostrarNo(no: number): number {
    const alvo = this.noVisivel(no);
    const antepassados: number[] = [];
    for (let p = this.arvore.pai[alvo]; p !== NENHUM; p = this.arvore.pai[p])
      antepassados.push(p);
    // Do mais de cima para baixo: cada um já está visível quando abre.
    for (let k = antepassados.length - 1; k >= 0; k--)
      this.abrir(antepassados[k]);
    return this.linhaDoNo(alvo);
  }
}

/** O nó mais fundo que contém a posição do texto, ou NENHUM. */
export function noNaPosicao(arvore: ArvoreXml, posicao: number): number {
  const n = arvore.quantidade;
  if (n === 0) return NENHUM;
  // Último nó que começa até a posição (os inícios crescem em ordem).
  let a = 0;
  let b = n - 1;
  if (arvore.inicio[0] > posicao) return arvore.primeiraRaiz;
  while (a < b) {
    const meio = (a + b + 1) >> 1;
    if (arvore.inicio[meio] <= posicao) a = meio;
    else b = meio - 1;
  }
  let no = a;
  while (arvore.fim[no] <= posicao && arvore.pai[no] !== NENHUM)
    no = arvore.pai[no];
  return no;
}

/**
 * As linhas da Árvore com achado, a partir das posições achadas no texto
 * (buscaTexto.ts): cada posição vira o nó que a contém, mostrado na tela
 * (o texto de um elemento em linha é o próprio elemento). Sem repetir, em
 * ordem de documento. Posição fora da árvore (depois de um erro de XML) fica
 * de fora.
 */
export function linhasDosAchados(
  modelo: ModeloArvore,
  posicoes: ArrayLike<number>,
): number[] {
  const a = modelo.arvore;
  const vistos = new Set<number>();
  for (let k = 0; k < posicoes.length; k++) {
    const pos = posicoes[k];
    const no = noNaPosicao(a, pos);
    if (no === NENHUM || a.inicio[no] > pos || a.fim[no] <= pos) continue;
    vistos.add(modelo.noVisivel(no));
  }
  return [...vistos].sort((x, y) => x - y);
}

/**
 * Espaços com quebra de linha viram um espaço só (a linha da árvore é uma).
 * `aparar`: tira também os espaços das pontas (texto; comentário e CDATA
 * ficam com os seus).
 */
function umaLinha(s: string, aparar: boolean): string {
  const r = s.replace(/[\t\n\r ]*[\r\n][\t\n\r ]*/g, ' ');
  return aparar ? r.trim() : r;
}

/** Corta em `limite` caracteres; devolve o pedaço e quanto sobrou. */
function cortar(s: string, limite: number): [string, number] {
  return s.length > limite ? [s.slice(0, limite), s.length - limite] : [s, 0];
}

const sobra = (n: number): PedacoArvore => ({
  classe: 'info',
  texto: ` … mais ${n.toLocaleString('pt-BR')} caracteres (veja na vista Texto)`,
});

/** Pedaços coloridos da linha de um nó. Nunca HTML: a tela põe como texto. */
export function pedacosDoNo(modelo: ModeloArvore, no: number): PedacoArvore[] {
  const a = modelo.arvore;
  const tipo = a.tipo[no];
  const saida: PedacoArvore[] = [];
  const p = (classe: ClasseArvore, texto: string) =>
    saida.push({ classe, texto });
  const valorCortado = (classe: ClasseArvore, bruto: string) => {
    const [v, resto] = cortar(
      umaLinha(bruto, classe === 'texto'),
      LIMITE_VALOR_ARVORE,
    );
    p(classe, v);
    if (resto) saida.push(sobra(resto));
  };

  if (tipo === ELEMENTO) {
    const nome = nomeDe(a, no);
    p('sinal', '<');
    p('nome', nome);
    const primeiro = a.primeiroAtributo[no];
    for (let k = 0; k < a.quantosAtributos[no]; k++) {
      const i = primeiro + k;
      const valor = a.valores.slice(
        a.atributoValorInicio[i],
        a.atributoValorFim[i],
      );
      const [v, resto] = cortar(umaLinha(valor, false), LIMITE_VALOR_ATRIBUTO);
      p('texto', ' ');
      p('atributo', a.nomes[a.atributoNome[i]]);
      p('sinal', '=');
      p('valor', `"${v}${resto ? '…' : ''}"`);
    }
    if (modelo.quantosFilhos[no] === 0) {
      p('sinal', '/>');
    } else if (modelo.emLinha(no)) {
      p('sinal', '>');
      const filho = a.primeiroFilho[no];
      if (a.tipo[filho] === CDATA) {
        p('sinal', '<![CDATA[');
        valorCortado('cdata', valorDe(a, filho));
        p('sinal', ']]>');
      } else {
        valorCortado('texto', valorDe(a, filho));
      }
      p('sinal', '</');
      p('nome', nome);
      p('sinal', '>');
    } else {
      p('sinal', '>');
      if (!modelo.estaAberto(no)) {
        const n = modelo.quantosFilhos[no];
        p(
          'info',
          `  (${n.toLocaleString('pt-BR')} ${n === 1 ? 'item dentro' : 'itens dentro'})`,
        );
      }
    }
  } else if (tipo === TEXTO) {
    valorCortado('texto', valorDe(a, no));
  } else if (tipo === COMENTARIO) {
    p('comentario', '<!--');
    valorCortado('comentario', valorDe(a, no));
    p('comentario', '-->');
  } else if (tipo === CDATA) {
    p('sinal', '<![CDATA[');
    valorCortado('cdata', valorDe(a, no));
    p('sinal', ']]>');
  } else if (tipo === INSTRUCAO) {
    p('instrucao', `<?${nomeDe(a, no)} `);
    valorCortado('instrucao', valorDe(a, no));
    p('instrucao', '?>');
  } else if (tipo === DOCTYPE) {
    valorCortado('doctype', valorDe(a, no));
    p('info', '  (DOCTYPE mostrado como texto, não processado)');
  }
  return saida;
}
