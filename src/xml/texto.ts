// Vista Texto do leitor genérico de XML: o texto do arquivo em linhas com
// indentação, sem montar a árvore. Puro (sem DOM, sem Electron), para rodar
// onde o arquivo é preparado e nos testes.
//
// Cada linha é um trecho do texto original (início e fim), com o nível de
// indentação e o tipo, guardados em colunas (typed arrays), como a árvore
// compacta: um arquivo de 100 MB pode dar milhões de linhas e elas precisam
// passar pelo IPC sem custo. A tela só desenha as linhas visíveis.
//
// Regras:
// - Cada marcação, comentário, CDATA, instrução e DOCTYPE começa linha nova.
// - Elemento só com texto curto fica numa linha: <nome>texto</nome>.
// - Texto só de espaços entre marcações some; o resto perde os espaços das
//   pontas. Quebras de linha de dentro de um trecho viram linhas novas.
// - Linha com mais de LARGURA_LINHA caracteres continua na linha de baixo
//   (marcada como continuação, sem número próprio).
// - XML malformado não para nada: a indentação só nunca fica negativa.
// - Mais de LIMITE_LINHAS linhas: desiste da indentação e mostra o texto sem
//   indentação, quebrando as linhas compridas nas marcações, até o limite.

/** Tipo de cada linha (coluna `tipo`, sem o bit de continuação). */
export const LINHA_MARCACAO = 0;
export const LINHA_TEXTO = 1;
export const LINHA_COMENTARIO = 2;
export const LINHA_CDATA = 3;
export const LINHA_INSTRUCAO = 4;
export const LINHA_DOCTYPE = 5;
/** Pedaço de uma marcação que foi quebrada em mais de uma linha. */
export const LINHA_MARCACAO_PARTE = 6;

/** Bit da coluna `tipo`: a linha continua a linha de cima. */
export const CONTINUACAO = 0x80;

/** Máximo de caracteres numa linha da tela. */
export const LARGURA_LINHA = 1000;

/** Máximo de linhas (cerca de 88 MB de colunas). */
export const LIMITE_LINHAS = 8_000_000;

/** Sem indentação, linha comprida quebra no primeiro ">" depois disto. */
const LARGURA_SUAVE = 160;

/** Elemento com texto até este tamanho fica numa linha só. */
const TEXTO_NA_LINHA = 200;

export const MENSAGEM_SEM_INDENTACAO =
  'O arquivo tem marcações demais para indentar; o texto aparece sem indentação, quebrado nas marcações.';

export const MENSAGEM_LINHAS_CORTADAS =
  'O texto tem linhas demais; só as primeiras 8.000.000 aparecem. Use o Bloco de Notas para ver o resto.';

export interface LinhasTexto {
  quantidade: number;
  /** Trecho do texto de cada linha: [inicio, fim). */
  inicio: Int32Array;
  fim: Int32Array;
  /** Nível de indentação. */
  nivel: Uint16Array;
  /** LINHA_* com o bit CONTINUACAO. */
  tipo: Uint8Array;
  /** Linhas que são continuação, em ordem (para numerar as outras). */
  continuacoes: Int32Array;
  /** false quando passou do limite e caiu no texto sem indentação. */
  indentado: boolean;
  /** Parou em LIMITE_LINHAS. */
  cortado: boolean;
}

class Montador {
  private capacidade = 1024;
  quantidade = 0;
  inicio = new Int32Array(this.capacidade);
  fim = new Int32Array(this.capacidade);
  nivel = new Uint16Array(this.capacidade);
  tipo = new Uint8Array(this.capacidade);
  continuacoes: number[] = [];
  cheio = false;
  private readonly limite: number;

  constructor(limite: number) {
    this.limite = limite;
  }

  private crescer(): void {
    const c = (this.capacidade *= 2);
    const i = new Int32Array(c);
    i.set(this.inicio);
    this.inicio = i;
    const f = new Int32Array(c);
    f.set(this.fim);
    this.fim = f;
    const n = new Uint16Array(c);
    n.set(this.nivel);
    this.nivel = n;
    const t = new Uint8Array(c);
    t.set(this.tipo);
    this.tipo = t;
  }

  /** Uma linha lógica, quebrada em pedaços de LARGURA_LINHA. */
  linha(inicio: number, fim: number, nivel: number, tipo: number): void {
    let a = inicio;
    let primeira = true;
    do {
      if (this.quantidade >= this.limite) {
        this.cheio = true;
        return;
      }
      if (this.quantidade >= this.capacidade) this.crescer();
      const b = Math.min(fim, a + LARGURA_LINHA);
      const k = this.quantidade++;
      this.inicio[k] = a;
      this.fim[k] = b;
      this.nivel[k] = Math.min(nivel, 0xffff);
      this.tipo[k] = primeira ? tipo : tipo | CONTINUACAO;
      if (!primeira) this.continuacoes.push(k);
      primeira = false;
      a = b;
    } while (a < fim);
  }

  terminar(indentado: boolean): LinhasTexto {
    const n = this.quantidade;
    return {
      quantidade: n,
      inicio: this.inicio.slice(0, n),
      fim: this.fim.slice(0, n),
      nivel: this.nivel.slice(0, n),
      tipo: this.tipo.slice(0, n),
      continuacoes: Int32Array.from(this.continuacoes),
      indentado,
      cortado: this.cheio,
    };
  }
}

const ehEspaco = (c: number) =>
  c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

/**
 * Acrescenta o trecho [a, b) como uma ou mais linhas: quebra nas quebras de
 * linha de dentro e tira os espaços das pontas de cada pedaço. Pedaço vazio
 * só entra se `vazias` (dentro de comentário e CDATA a linha vazia conta).
 */
function trecho(
  m: Montador,
  texto: string,
  a: number,
  b: number,
  nivel: number,
  tipo: number,
  vazias: boolean,
  tipoDasOutras = tipo,
  nivelDasOutras = nivel,
): void {
  let inicio = a;
  let primeira = true;
  while (inicio <= b && !m.cheio) {
    let fim = inicio;
    while (fim < b) {
      const c = texto.charCodeAt(fim);
      if (c === 0x0a || c === 0x0d) break;
      fim++;
    }
    let x = inicio;
    let y = fim;
    while (x < y && ehEspaco(texto.charCodeAt(x))) x++;
    while (y > x && ehEspaco(texto.charCodeAt(y - 1))) y--;
    if (y > x || (vazias && fim < b)) {
      m.linha(
        x,
        y,
        primeira ? nivel : nivelDasOutras,
        primeira ? tipo : tipoDasOutras,
      );
      primeira = false;
    }
    if (fim >= b) break;
    // CRLF conta como uma quebra.
    inicio =
      texto.charCodeAt(fim) === 0x0d && texto.charCodeAt(fim + 1) === 0x0a
        ? fim + 2
        : fim + 1;
  }
}

/** Fim (exclusivo) da marcação que começa em `k`, pulando o que está entre aspas. */
function fimDaMarcacao(texto: string, k: number): number {
  const n = texto.length;
  let aspas = 0;
  for (let i = k + 1; i < n; i++) {
    const c = texto.charCodeAt(i);
    if (aspas) {
      if (c === aspas) aspas = 0;
    } else if (c === 0x22 || c === 0x27) {
      aspas = c;
    } else if (c === 0x3e) {
      return i + 1;
    } else if (c === 0x3c) {
      // "<" dentro de uma marcação: malformado; a marcação acaba aqui.
      return i;
    }
  }
  return n;
}

/** Fim (exclusivo) da declaração <!DOCTYPE ...>, com o bloco [...]. */
function fimDoDoctype(texto: string, k: number): number {
  const n = texto.length;
  let colchetes = 0;
  let i = k + 2;
  while (i < n) {
    const c = texto.charCodeAt(i);
    if (c === 0x22 || c === 0x27) {
      const fecha = texto.indexOf(c === 0x22 ? '"' : "'", i + 1);
      if (fecha === -1) return n;
      i = fecha + 1;
    } else if (c === 0x3c && texto.startsWith('<!--', i)) {
      const fecha = texto.indexOf('-->', i + 4);
      if (fecha === -1) return n;
      i = fecha + 3;
    } else if (c === 0x5b) {
      colchetes++;
      i++;
    } else if (c === 0x5d) {
      colchetes--;
      i++;
    } else if (c === 0x3e && colchetes <= 0) {
      return i + 1;
    } else {
      i++;
    }
  }
  return n;
}

/** Fim de um bloco que termina em `marca` (ou o fim do texto). */
function fimAte(texto: string, k: number, marca: string): number {
  const fim = texto.indexOf(marca, k);
  return fim === -1 ? texto.length : fim + marca.length;
}

/** Fim do nome que começa em `k` (até espaço, "/", ">" ou "<"). */
function fimDoNome(texto: string, k: number, limite: number): number {
  let i = k;
  while (i < limite) {
    const c = texto.charCodeAt(i);
    if (ehEspaco(c) || c === 0x2f || c === 0x3e || c === 0x3c) break;
    i++;
  }
  return i;
}

/**
 * Se logo depois da abertura [a, b) de <nome> vem um texto curto (ou nada) e
 * o </nome>, devolve o fim do fechamento; senão -1.
 */
function fimDoElementoCurto(
  texto: string,
  a: number,
  b: number,
  nomeFim: number,
): number {
  const menor = texto.indexOf('<', b);
  if (menor === -1 || texto.charCodeAt(menor + 1) !== 0x2f) return -1;
  if (menor - b > TEXTO_NA_LINHA) return -1;
  for (let i = b; i < menor; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0x0a || c === 0x0d) return -1;
  }
  const tamanhoNome = nomeFim - (a + 1);
  if (
    tamanhoNome === 0 ||
    texto.substr(menor + 2, tamanhoNome) !== texto.substr(a + 1, tamanhoNome)
  ) {
    return -1;
  }
  let k = menor + 2 + tamanhoNome;
  while (k < texto.length && ehEspaco(texto.charCodeAt(k))) k++;
  return texto.charCodeAt(k) === 0x3e ? k + 1 : -1;
}

/** Linhas com indentação; null se passou de `limite` linhas. */
function indentar(texto: string, limite: number): LinhasTexto | null {
  const m = new Montador(limite);
  const n = texto.length;
  let nivel = 0;
  let pos = 0;
  while (pos < n) {
    if (m.cheio) return null;
    let menor = texto.indexOf('<', pos);
    if (menor === -1) menor = n;
    if (menor > pos) {
      trecho(m, texto, pos, menor, nivel, LINHA_TEXTO, false);
    }
    if (menor >= n) break;
    const c1 = texto.charCodeAt(menor + 1);
    let fim: number;
    if (c1 === 0x21 && texto.startsWith('<!--', menor)) {
      fim = fimAte(texto, menor + 4, '-->');
      trecho(m, texto, menor, fim, nivel, LINHA_COMENTARIO, true);
    } else if (c1 === 0x21 && texto.startsWith('<![CDATA[', menor)) {
      fim = fimAte(texto, menor + 9, ']]>');
      trecho(m, texto, menor, fim, nivel, LINHA_CDATA, true);
    } else if (c1 === 0x21) {
      fim = fimDoDoctype(texto, menor);
      trecho(m, texto, menor, fim, nivel, LINHA_DOCTYPE, true);
    } else if (c1 === 0x3f) {
      fim = fimAte(texto, menor + 2, '?>');
      trecho(m, texto, menor, fim, nivel, LINHA_INSTRUCAO, true);
    } else if (c1 === 0x2f) {
      fim = fimDaMarcacao(texto, menor);
      if (nivel > 0) nivel--;
      trecho(
        m,
        texto,
        menor,
        fim,
        nivel,
        LINHA_MARCACAO,
        false,
        LINHA_MARCACAO_PARTE,
        nivel + 1,
      );
    } else {
      fim = fimDaMarcacao(texto, menor);
      const vazio =
        texto.charCodeAt(fim - 1) === 0x3e &&
        texto.charCodeAt(fim - 2) === 0x2f;
      const nomeFim = fimDoNome(texto, menor + 1, fim);
      const curto =
        !vazio && texto.charCodeAt(fim - 1) === 0x3e
          ? fimDoElementoCurto(texto, menor, fim, nomeFim)
          : -1;
      if (curto !== -1 && !temQuebra(texto, menor, fim)) {
        m.linha(menor, curto, nivel, LINHA_MARCACAO);
        fim = curto;
      } else {
        trecho(
          m,
          texto,
          menor,
          fim,
          nivel,
          LINHA_MARCACAO,
          false,
          LINHA_MARCACAO_PARTE,
          nivel + 1,
        );
        if (!vazio && nomeFim > menor + 1) nivel++;
      }
    }
    pos = fim;
  }
  if (m.cheio) return null;
  return m.terminar(true);
}

function temQuebra(texto: string, a: number, b: number): boolean {
  for (let i = a; i < b; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0x0a || c === 0x0d) return true;
  }
  return false;
}

/**
 * O texto sem indentação: as quebras de linha do arquivo continuam, e uma
 * linha comprida é quebrada no primeiro ">" depois de LARGURA_SUAVE
 * caracteres (assim um XML de uma linha só não vira pedaços cortados no meio
 * das marcações).
 */
function semIndentacao(texto: string, limite: number): LinhasTexto {
  const m = new Montador(limite);
  const n = texto.length;
  let inicio = 0;
  while (inicio <= n && !m.cheio) {
    let fim = inicio;
    while (fim < n) {
      const c = texto.charCodeAt(fim);
      if (c === 0x0a || c === 0x0d) break;
      fim++;
    }
    let a = inicio;
    while (fim - a > LARGURA_SUAVE && !m.cheio) {
      const maior = texto.indexOf('>', a + LARGURA_SUAVE);
      // Sem ">" por perto: o Montador corta em LARGURA_LINHA.
      if (maior === -1 || maior + 1 >= fim || maior + 1 - a > LARGURA_LINHA)
        break;
      m.linha(a, maior + 1, 0, LINHA_MARCACAO);
      a = maior + 1;
    }
    m.linha(a, fim, 0, LINHA_MARCACAO);
    if (fim >= n) break;
    inicio =
      texto.charCodeAt(fim) === 0x0d && texto.charCodeAt(fim + 1) === 0x0a
        ? fim + 2
        : fim + 1;
  }
  return m.terminar(false);
}

/** As linhas da vista Texto. `limite` só muda nos testes. */
export function formatarTexto(
  texto: string,
  limite = LIMITE_LINHAS,
): LinhasTexto {
  return indentar(texto, limite) ?? semIndentacao(texto, limite);
}

/** Linha (a partir de 0) que contém a posição, ou a primeira depois dela. */
export function linhaDaPosicao(linhas: LinhasTexto, posicao: number): number {
  let a = 0;
  let b = linhas.quantidade - 1;
  if (b < 0) return 0;
  while (a < b) {
    const meio = (a + b) >> 1;
    if (linhas.fim[meio] > posicao) b = meio;
    else a = meio + 1;
  }
  return a;
}

/** Número mostrado na margem (a partir de 1); 0 para continuação. */
export function numeroDaLinha(linhas: LinhasTexto, linha: number): number {
  if (linhas.tipo[linha] & CONTINUACAO) return 0;
  // Quantas continuações vêm antes desta linha.
  const c = linhas.continuacoes;
  let a = 0;
  let b = c.length;
  while (a < b) {
    const meio = (a + b) >> 1;
    if (c[meio] < linha) a = meio + 1;
    else b = meio;
  }
  return linha + 1 - a;
}

/** Quantas linhas numeradas há (sem as continuações). */
export function totalNumerado(linhas: LinhasTexto): number {
  return linhas.quantidade - linhas.continuacoes.length;
}

/** Classe de cor de um pedaço de linha. */
export type ClassePedaco =
  | 'sinal'
  | 'nome'
  | 'atributo'
  | 'valor'
  | 'texto'
  | 'comentario'
  | 'cdata'
  | 'instrucao'
  | 'doctype';

export interface Pedaco {
  classe: ClassePedaco;
  texto: string;
}

const CLASSE_DO_TIPO: Record<number, ClassePedaco> = {
  [LINHA_TEXTO]: 'texto',
  [LINHA_COMENTARIO]: 'comentario',
  [LINHA_CDATA]: 'cdata',
  [LINHA_INSTRUCAO]: 'instrucao',
  [LINHA_DOCTYPE]: 'doctype',
};

/**
 * Pedaços coloridos de uma linha da vista Texto. Linhas de marcação são
 * separadas em sinais, nomes, atributos, valores e texto; as outras saem
 * inteiras com a cor do tipo. Nunca devolve HTML: a tela põe cada pedaço
 * como texto.
 */
export function pedacosDaLinha(trechoLinha: string, tipo: number): Pedaco[] {
  const base = tipo & ~CONTINUACAO;
  const classe = CLASSE_DO_TIPO[base];
  if (classe) return [{ classe, texto: trechoLinha }];
  // Continuação de uma linha longa de marcação: sem cores (o corte pode
  // cair no meio de um valor).
  if (tipo & CONTINUACAO) return [{ classe: 'valor', texto: trechoLinha }];
  return pedacosDaMarcacao(trechoLinha, base === LINHA_MARCACAO_PARTE);
}

/**
 * Separa uma linha de marcação (pode ter texto entre marcações, como em
 * <nome>texto</nome>). `dentro`: a linha começa no meio de uma marcação
 * (atributos da linha de cima).
 */
export function pedacosDaMarcacao(s: string, dentro = false): Pedaco[] {
  const saida: Pedaco[] = [];
  const por = (classe: ClassePedaco, a: number, b: number) => {
    if (b <= a) return;
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.classe === classe) ultimo.texto += s.slice(a, b);
    else saida.push({ classe, texto: s.slice(a, b) });
  };
  const n = s.length;
  let i = 0;
  // Estados: fora (texto), nome (logo depois de "<" ou "</"), atributos.
  let estado: 'fora' | 'nome' | 'atributos' = dentro ? 'atributos' : 'fora';
  while (i < n) {
    const c = s.charCodeAt(i);
    if (estado === 'fora') {
      const menor = s.indexOf('<', i);
      const fim = menor === -1 ? n : menor;
      por('texto', i, fim);
      if (menor === -1) break;
      const barra = s.charCodeAt(menor + 1) === 0x2f ? 2 : 1;
      por('sinal', menor, menor + barra);
      i = menor + barra;
      estado = 'nome';
      continue;
    }
    if (estado === 'nome') {
      let k = i;
      while (k < n) {
        const d = s.charCodeAt(k);
        if (ehEspaco(d) || d === 0x2f || d === 0x3e || d === 0x3c) break;
        k++;
      }
      por('nome', i, k);
      i = k;
      estado = 'atributos';
      continue;
    }
    // Atributos: nome=, valor entre aspas, até o ">".
    if (c === 0x3e) {
      por('sinal', i, i + 1);
      i++;
      estado = 'fora';
    } else if (c === 0x2f || c === 0x3d || c === 0x3f) {
      por('sinal', i, i + 1);
      i++;
    } else if (c === 0x22 || c === 0x27) {
      const fecha = s.indexOf(c === 0x22 ? '"' : "'", i + 1);
      const fim = fecha === -1 ? n : fecha + 1;
      por('valor', i, fim);
      i = fim;
    } else if (ehEspaco(c)) {
      let k = i;
      while (k < n && ehEspaco(s.charCodeAt(k))) k++;
      por('texto', i, k);
      i = k;
    } else if (c === 0x3c) {
      estado = 'fora';
    } else {
      let k = i;
      while (k < n) {
        const d = s.charCodeAt(k);
        if (
          ehEspaco(d) ||
          d === 0x3d ||
          d === 0x3e ||
          d === 0x2f ||
          d === 0x22 ||
          d === 0x27 ||
          d === 0x3c
        )
          break;
        k++;
      }
      por('atributo', i, k);
      i = k;
    }
  }
  return saida;
}
