// Árvore compacta do leitor genérico de XML. Em vez de um objeto por nó, a
// árvore guarda colunas (typed arrays) indexadas pelo número do nó, uma
// tabela de nomes sem repetição e uma string única com todos os valores.
// Motivo, medido no protótipo do utilityProcess: um XML de 20 MB dá mais de
// 1 milhão de nós, e mandar 1 milhão de objetos por postMessage leva
// segundos; typed arrays e uma string passam quase de graça.
//
// Os nós ficam em ordem de documento. Pai, primeiro filho e próximo irmão
// permitem percorrer a árvore sem recursão e sem listas por nó.

export type TipoNo =
  | 'elemento'
  | 'texto'
  | 'comentario'
  | 'cdata'
  | 'instrucao'
  | 'doctype';

/** Código numérico de cada tipo, guardado na coluna `tipo`. */
export const TIPOS: readonly TipoNo[] = [
  'elemento',
  'texto',
  'comentario',
  'cdata',
  'instrucao',
  'doctype',
];

const CODIGO_TIPO = Object.fromEntries(
  TIPOS.map((tipo, codigo) => [tipo, codigo]),
) as Record<TipoNo, number>;

/** Sem nó (sem pai, sem filho, sem irmão, sem nome). */
export const NENHUM = -1;

export interface ArvoreXml {
  /** Quantos nós há (o tamanho de cada coluna por nó). */
  quantidade: number;
  /** Índice em TIPOS. */
  tipo: Uint8Array;
  /** Nó pai, ou NENHUM no nível do documento. */
  pai: Int32Array;
  primeiroFilho: Int32Array;
  proximoIrmao: Int32Array;
  /** Índice em `nomes` (elemento ou alvo da instrução), ou NENHUM. */
  nome: Int32Array;
  /** Trecho de `valores` com o valor do nó (vazio em elementos). */
  valorInicio: Int32Array;
  valorFim: Int32Array;
  /** Primeiro atributo do nó nas colunas de atributo, e quantos são. */
  primeiroAtributo: Int32Array;
  quantosAtributos: Int32Array;
  /** Posição (em caracteres do texto original) onde o nó começa. */
  inicio: Int32Array;
  /** Posição logo depois do fim do nó (ou de onde a leitura parou). */
  fim: Int32Array;
  /** Primeiro nó do nível do documento, ou NENHUM. */
  primeiraRaiz: number;
  /** Nomes de elementos, atributos e instruções, sem repetição. */
  nomes: string[];
  /** Todos os valores (textos e atributos), um depois do outro. */
  valores: string;
  /** Colunas por atributo. */
  atributoNome: Int32Array;
  atributoValorInicio: Int32Array;
  atributoValorFim: Int32Array;
}

export interface AtributoXml {
  nome: string;
  valor: string;
}

/** Um nó montado como objeto, para a tela e os testes. */
export interface NoXml {
  tipo: TipoNo;
  pai: number;
  nome: string;
  atributos: AtributoXml[] | null;
  valor: string;
  filhos: number[] | null;
  inicio: number;
  fim: number;
}

export const tipoDe = (a: ArvoreXml, no: number): TipoNo => TIPOS[a.tipo[no]];

export const nomeDe = (a: ArvoreXml, no: number): string =>
  a.nome[no] === NENHUM ? '' : a.nomes[a.nome[no]];

export const valorDe = (a: ArvoreXml, no: number): string =>
  a.valores.slice(a.valorInicio[no], a.valorFim[no]);

export function atributosDe(a: ArvoreXml, no: number): AtributoXml[] {
  const lista: AtributoXml[] = [];
  const fim = a.primeiroAtributo[no] + a.quantosAtributos[no];
  for (let k = a.primeiroAtributo[no]; k < fim; k++) {
    lista.push({
      nome: a.nomes[a.atributoNome[k]],
      valor: a.valores.slice(a.atributoValorInicio[k], a.atributoValorFim[k]),
    });
  }
  return lista;
}

/** Filhos do nó, em ordem; com NENHUM, os nós do nível do documento. */
export function filhosDe(a: ArvoreXml, no: number): number[] {
  const lista: number[] = [];
  let f = no === NENHUM ? a.primeiraRaiz : a.primeiroFilho[no];
  for (; f !== NENHUM; f = a.proximoIrmao[f]) lista.push(f);
  return lista;
}

/** O nó como objeto (cria listas novas a cada chamada). */
export function noXml(a: ArvoreXml, no: number): NoXml {
  const filhos = filhosDe(a, no);
  return {
    tipo: tipoDe(a, no),
    pai: a.pai[no],
    nome: nomeDe(a, no),
    atributos: a.quantosAtributos[no] ? atributosDe(a, no) : null,
    valor: valorDe(a, no),
    filhos: filhos.length ? filhos : null,
    inicio: a.inicio[no],
    fim: a.fim[no],
  };
}

function crescer<T extends Int32Array | Uint8Array>(
  atual: T,
  tamanho: number,
): T {
  const novo = new (atual.constructor as new (n: number) => T)(tamanho);
  novo.set(atual);
  return novo;
}

/** Monta a árvore nó a nó, em ordem de documento. Só o leitor usa. */
export class MontadorArvore {
  private capacidade = 1024;
  private capacidadeAtributos = 256;
  private quantidade = 0;
  private quantidadeAtributos = 0;
  private tipo = new Uint8Array(this.capacidade);
  private pai = new Int32Array(this.capacidade);
  private primeiroFilho = new Int32Array(this.capacidade);
  private proximoIrmao = new Int32Array(this.capacidade);
  private ultimoFilho = new Int32Array(this.capacidade);
  private nome = new Int32Array(this.capacidade);
  private valorInicio = new Int32Array(this.capacidade);
  private valorFim = new Int32Array(this.capacidade);
  private primeiroAtributo = new Int32Array(this.capacidade);
  private quantosAtributos = new Int32Array(this.capacidade);
  private inicio = new Int32Array(this.capacidade);
  private fim = new Int32Array(this.capacidade);
  private atributoNome = new Int32Array(this.capacidadeAtributos);
  private atributoValorInicio = new Int32Array(this.capacidadeAtributos);
  private atributoValorFim = new Int32Array(this.capacidadeAtributos);
  private primeiraRaiz = NENHUM;
  private ultimaRaiz = NENHUM;
  private nomes: string[] = [];
  private indiceNomes = new Map<string, number>();
  private partes: string[] = [];
  private tamanhoValores = 0;

  // Cache de nomes já vistos, por posição calculada do trecho, para não criar
  // uma string nova (e calcular o hash dela) a cada marcação repetida.
  private cacheNomes: (string | undefined)[] = Array.from({ length: 4096 });

  /**
   * O nome entre `inicio` e `fim` do texto, como string já guardada quando
   * ele já apareceu antes (comparar e procurar no Map fica barato).
   */
  nomeEm(texto: string, inicio: number, fim: number): string {
    const tamanho = fim - inicio;
    const chave =
      (tamanho * 31 +
        texto.charCodeAt(inicio) * 7 +
        texto.charCodeAt(fim - 1) * 131 +
        texto.charCodeAt(inicio + (tamanho >> 1))) &
      4095;
    const guardado = this.cacheNomes[chave];
    if (
      guardado !== undefined &&
      guardado.length === tamanho &&
      texto.startsWith(guardado, inicio)
    ) {
      return guardado;
    }
    const nome = texto.slice(inicio, fim);
    const k = this.codigoNome(nome);
    this.cacheNomes[chave] = this.nomes[k];
    return this.nomes[k];
  }

  private codigoNome(nome: string): number {
    let k = this.indiceNomes.get(nome);
    if (k === undefined) {
      k = this.nomes.length;
      this.nomes.push(nome);
      this.indiceNomes.set(nome, k);
    }
    return k;
  }

  /** Guarda o valor no fim da string única e devolve onde ele começa. */
  private guardarValor(valor: string): number {
    const inicio = this.tamanhoValores;
    if (valor !== '') {
      this.partes.push(valor);
      this.tamanhoValores += valor.length;
    }
    return inicio;
  }

  private garantir(): void {
    if (this.quantidade < this.capacidade) return;
    const c = (this.capacidade *= 2);
    this.tipo = crescer(this.tipo, c);
    this.pai = crescer(this.pai, c);
    this.primeiroFilho = crescer(this.primeiroFilho, c);
    this.proximoIrmao = crescer(this.proximoIrmao, c);
    this.ultimoFilho = crescer(this.ultimoFilho, c);
    this.nome = crescer(this.nome, c);
    this.valorInicio = crescer(this.valorInicio, c);
    this.valorFim = crescer(this.valorFim, c);
    this.primeiroAtributo = crescer(this.primeiroAtributo, c);
    this.quantosAtributos = crescer(this.quantosAtributos, c);
    this.inicio = crescer(this.inicio, c);
    this.fim = crescer(this.fim, c);
  }

  private garantirAtributos(): void {
    if (this.quantidadeAtributos < this.capacidadeAtributos) return;
    const c = (this.capacidadeAtributos *= 2);
    this.atributoNome = crescer(this.atributoNome, c);
    this.atributoValorInicio = crescer(this.atributoValorInicio, c);
    this.atributoValorFim = crescer(this.atributoValorFim, c);
  }

  /** Acrescenta um nó como último filho de `pai` e devolve o número dele. */
  acrescentar(
    tipo: TipoNo,
    pai: number,
    nome: string,
    valor: string,
    inicio: number,
    fim: number,
    atributos: AtributoXml[] | null = null,
  ): number {
    this.garantir();
    const no = this.quantidade++;
    this.tipo[no] = CODIGO_TIPO[tipo];
    this.pai[no] = pai;
    this.primeiroFilho[no] = NENHUM;
    this.proximoIrmao[no] = NENHUM;
    this.ultimoFilho[no] = NENHUM;
    this.nome[no] = nome === '' ? NENHUM : this.codigoNome(nome);
    this.valorInicio[no] = this.guardarValor(valor);
    this.valorFim[no] = this.tamanhoValores;
    this.primeiroAtributo[no] = this.quantidadeAtributos;
    this.quantosAtributos[no] = atributos ? atributos.length : 0;
    for (const atributo of atributos ?? []) {
      this.garantirAtributos();
      const k = this.quantidadeAtributos++;
      this.atributoNome[k] = this.codigoNome(atributo.nome);
      this.atributoValorInicio[k] = this.guardarValor(atributo.valor);
      this.atributoValorFim[k] = this.tamanhoValores;
    }
    this.inicio[no] = inicio;
    this.fim[no] = fim;

    if (pai === NENHUM) {
      if (this.ultimaRaiz === NENHUM) this.primeiraRaiz = no;
      else this.proximoIrmao[this.ultimaRaiz] = no;
      this.ultimaRaiz = no;
    } else {
      const ultimo = this.ultimoFilho[pai];
      if (ultimo === NENHUM) this.primeiroFilho[pai] = no;
      else this.proximoIrmao[ultimo] = no;
      this.ultimoFilho[pai] = no;
    }
    return no;
  }

  nomeDoNo(no: number): string {
    return this.nome[no] === NENHUM ? '' : this.nomes[this.nome[no]];
  }

  fimDoNo(no: number): number {
    return this.fim[no];
  }

  definirFim(no: number, fim: number): void {
    this.fim[no] = fim;
  }

  /** A árvore pronta, com as colunas cortadas no tamanho exato. */
  terminar(): ArvoreXml {
    const n = this.quantidade;
    const na = this.quantidadeAtributos;
    return {
      quantidade: n,
      tipo: this.tipo.slice(0, n),
      pai: this.pai.slice(0, n),
      primeiroFilho: this.primeiroFilho.slice(0, n),
      proximoIrmao: this.proximoIrmao.slice(0, n),
      nome: this.nome.slice(0, n),
      valorInicio: this.valorInicio.slice(0, n),
      valorFim: this.valorFim.slice(0, n),
      primeiroAtributo: this.primeiroAtributo.slice(0, n),
      quantosAtributos: this.quantosAtributos.slice(0, n),
      inicio: this.inicio.slice(0, n),
      fim: this.fim.slice(0, n),
      primeiraRaiz: this.primeiraRaiz,
      nomes: this.nomes,
      valores: this.partes.join(''),
      atributoNome: this.atributoNome.slice(0, na),
      atributoValorInicio: this.atributoValorInicio.slice(0, na),
      atributoValorFim: this.atributoValorFim.slice(0, na),
    };
  }
}
