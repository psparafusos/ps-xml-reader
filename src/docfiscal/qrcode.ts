// QR Code (ISO/IEC 18004) gerado sem biblioteca e sem rede, para os
// documentos auxiliares que levam o texto do QR Code no próprio XML (DANFE
// NFC-e, DACTE, DANFSe). Só o modo byte (UTF-8), que serve para qualquer
// URL; versões 1 a 40; níveis de correção L, M, Q e H; a máscara é a de
// menor penalidade, como manda a norma.
//
// Não usa DOM, para poder ser testado fora do app; o SVG é montado em
// ./svg.ts. As tabelas de blocos e o desenho seguem a norma (as mesmas
// tabelas publicadas em implementações abertas de referência).

export type NivelCorrecao = 'L' | 'M' | 'Q' | 'H';

const ORDEM_NIVEL: Record<NivelCorrecao, number> = { L: 0, M: 1, Q: 2, H: 3 };
/** Bits do nível no campo de formato (norma, tabela 12). */
const BITS_NIVEL: Record<NivelCorrecao, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Palavras de correção por bloco e número de blocos, por nível e versão
// (índice 0 não usado).
const CORRECAO_POR_BLOCO: readonly (readonly number[])[] = [
  [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30,
    28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30,
  ],
  [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26,
    26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28,
  ],
  [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28,
    26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30,
  ],
  [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28,
    26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30,
  ],
];

const BLOCOS: readonly (readonly number[])[] = [
  [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10,
    12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17,
    17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23,
    23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77,
    81,
  ],
];

export interface QrCode {
  versao: number;
  nivel: NivelCorrecao;
  mascara: number;
  /** Lado em módulos (sem a zona de silêncio). */
  tamanho: number;
  /** modulos[linha][coluna]: true é escuro. */
  modulos: boolean[][];
}

/** Módulos de dados (fora dos padrões fixos) de uma versão. */
export function modulosDeDados(versao: number): number {
  let n = (16 * versao + 128) * versao + 64;
  if (versao >= 2) {
    const alinhamentos = Math.floor(versao / 7) + 2;
    n -= (25 * alinhamentos - 10) * alinhamentos - 55;
    if (versao >= 7) n -= 36;
  }
  return n;
}

/** Palavras de dados (sem as de correção) de uma versão e nível. */
export function palavrasDeDados(versao: number, nivel: NivelCorrecao): number {
  const i = ORDEM_NIVEL[nivel];
  return (
    Math.floor(modulosDeDados(versao) / 8) -
    CORRECAO_POR_BLOCO[i][versao] * BLOCOS[i][versao]
  );
}

/** Centros dos padrões de alinhamento (linha e coluna). */
export function posicoesAlinhamento(versao: number): number[] {
  if (versao === 1) return [];
  const n = Math.floor(versao / 7) + 2;
  const tamanho = versao * 4 + 17;
  const passo =
    versao === 32 ? 26 : Math.ceil((versao * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = tamanho - 7; r.length < n; p -= passo) r.splice(1, 0, p);
  return r;
}

// ---------- Reed-Solomon sobre GF(256), polinômio 0x11D ----------

export function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisor(grau: number): number[] {
  const r = Array.from({ length: grau }, () => 0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}

/** Palavras de correção de `dados` (grau = quantas). */
export function correcao(dados: readonly number[], grau: number): number[] {
  const div = divisor(grau);
  const r = Array.from({ length: grau }, () => 0);
  for (const b of dados) {
    const fator = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => {
      r[i] ^= multiplicar(c, fator);
    });
  }
  return r;
}

// ---------- dados ----------

/** Bits do contador de caracteres no modo byte. */
const bitsContador = (versao: number) => (versao <= 9 ? 8 : 16);

/** Palavras de dados do texto (modo byte), com terminador e enchimento. */
export function palavrasDoTexto(
  bytes: Uint8Array,
  versao: number,
  nivel: NivelCorrecao,
): number[] {
  const capacidade = palavrasDeDados(versao, nivel) * 8;
  const bits: number[] = [];
  const por = (valor: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  por(0b0100, 4);
  por(bytes.length, bitsContador(versao));
  for (const b of bytes) por(b, 8);
  por(0, Math.min(4, capacidade - bits.length));
  por(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < capacidade; p ^= 0xec ^ 0x11) por(p, 8);
  const palavras: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    palavras.push(v);
  }
  return palavras;
}

/** Divide em blocos, acrescenta a correção e intercala (norma, 7.6). */
export function intercalar(
  dados: readonly number[],
  versao: number,
  nivel: NivelCorrecao,
): number[] {
  const i = ORDEM_NIVEL[nivel];
  const nBlocos = BLOCOS[i][versao];
  const grau = CORRECAO_POR_BLOCO[i][versao];
  const total = Math.floor(modulosDeDados(versao) / 8);
  const curtos = nBlocos - (total % nBlocos);
  const tamCurto = Math.floor(total / nBlocos);
  const blocos: number[][] = [];
  for (let b = 0, k = 0; b < nBlocos; b++) {
    const n = tamCurto - grau + (b < curtos ? 0 : 1);
    const dat = dados.slice(k, k + n);
    k += n;
    const ecc = correcao(dat, grau);
    if (b < curtos) dat.push(0);
    blocos.push([...dat, ...ecc]);
  }
  const r: number[] = [];
  for (let p = 0; p < blocos[0].length; p++) {
    blocos.forEach((bl, b) => {
      // A posição de enchimento dos blocos curtos não entra.
      if (p !== tamCurto - grau || b >= curtos) r.push(bl[p]);
    });
  }
  return r;
}

// ---------- desenho ----------

/** Bits do formato (nível e máscara), com BCH e a máscara fixa 0x5412. */
export function bitsFormato(nivel: NivelCorrecao, mascara: number): number {
  const dado = (BITS_NIVEL[nivel] << 3) | mascara;
  let resto = dado;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dado << 10) | resto) ^ 0x5412;
}

/** Bits da versão (só da 7 em diante), com BCH. */
export function bitsVersao(versao: number): number {
  let resto = versao;
  for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
  return (versao << 12) | resto;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** Condição de cada máscara (norma, tabela 10): x é a coluna, y a linha. */
export const MASCARAS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Matriz {
  readonly tamanho: number;
  readonly modulos: boolean[][];
  readonly fixo: boolean[][];
  readonly versao: number;
  constructor(versao: number) {
    this.versao = versao;
    this.tamanho = versao * 4 + 17;
    const vazio = () =>
      Array.from({ length: this.tamanho }, () =>
        Array.from({ length: this.tamanho }, () => false),
      );
    this.modulos = vazio();
    this.fixo = vazio();
  }

  marcar(x: number, y: number, escuro: boolean): void {
    this.modulos[y][x] = escuro;
    this.fixo[y][x] = true;
  }

  padroesFixos(): void {
    const t = this.tamanho;
    for (let i = 0; i < t; i++) {
      this.marcar(6, i, i % 2 === 0);
      this.marcar(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [t - 4, 3],
      [3, t - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < t && y >= 0 && y < t)
            this.marcar(x, y, d !== 2 && d !== 4);
        }
    }
    const pos = posicoesAlinhamento(this.versao);
    const ult = pos.length - 1;
    pos.forEach((px, i) =>
      pos.forEach((py, j) => {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === ult) ||
          (i === ult && j === 0)
        )
          return;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            this.marcar(
              px + dx,
              py + dy,
              Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
            );
      }),
    );
    // Reserva o formato (escrito de novo com a máscara escolhida).
    this.formato('M', 0);
    if (this.versao >= 7) {
      const b = bitsVersao(this.versao);
      for (let i = 0; i < 18; i++) {
        const a = t - 11 + (i % 3);
        const c = Math.floor(i / 3);
        this.marcar(a, c, bit(b, i));
        this.marcar(c, a, bit(b, i));
      }
    }
  }

  formato(nivel: NivelCorrecao, mascara: number): void {
    const b = bitsFormato(nivel, mascara);
    const t = this.tamanho;
    for (let i = 0; i <= 5; i++) this.marcar(8, i, bit(b, i));
    this.marcar(8, 7, bit(b, 6));
    this.marcar(8, 8, bit(b, 7));
    this.marcar(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) this.marcar(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) this.marcar(t - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) this.marcar(8, t - 15 + i, bit(b, i));
    this.marcar(8, t - 8, true);
  }

  /** Coloca as palavras no zigue-zague de duas colunas (norma, 7.7.3). */
  palavras(dados: readonly number[]): void {
    const t = this.tamanho;
    let i = 0;
    for (let direita = t - 1; direita >= 1; direita -= 2) {
      if (direita === 6) direita = 5;
      for (let v = 0; v < t; v++) {
        for (let j = 0; j < 2; j++) {
          const x = direita - j;
          const subindo = ((direita + 1) & 2) === 0;
          const y = subindo ? t - 1 - v : v;
          if (!this.fixo[y][x] && i < dados.length * 8) {
            this.modulos[y][x] = bit(dados[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  aplicarMascara(m: number): void {
    const cond = MASCARAS[m];
    for (let y = 0; y < this.tamanho; y++)
      for (let x = 0; x < this.tamanho; x++)
        if (!this.fixo[y][x] && cond(x, y))
          this.modulos[y][x] = !this.modulos[y][x];
  }
}

/** Mapa dos módulos fixos (localizadores, tempo, alinhamento, formato, versão). */
export function mapaFixo(versao: number): boolean[][] {
  const q = new Matriz(versao);
  q.padroesFixos();
  return q.fixo;
}

/** Blocos de uma versão e nível: quantos, correção por bloco, dados dos curtos e quantos curtos. */
export function estruturaBlocos(
  versao: number,
  nivel: NivelCorrecao,
): { blocos: number; grau: number; dadosCurto: number; curtos: number } {
  const i = ORDEM_NIVEL[nivel];
  const blocos = BLOCOS[i][versao];
  const grau = CORRECAO_POR_BLOCO[i][versao];
  const total = Math.floor(modulosDeDados(versao) / 8);
  return {
    blocos,
    grau,
    dadosCurto: Math.floor(total / blocos) - grau,
    curtos: blocos - (total % blocos),
  };
}

/** Penalidade da norma (7.8.3): sequências, blocos 2x2, falsos localizadores, proporção. */
export function penalidade(m: readonly (readonly boolean[])[]): number {
  const t = m.length;
  let p = 0;
  const linhas: boolean[][] = [];
  for (let i = 0; i < t; i++) {
    linhas.push([...m[i]]);
    linhas.push(m.map((l) => l[i]));
  }
  const padrao1 = [
    true,
    false,
    true,
    true,
    true,
    false,
    true,
    false,
    false,
    false,
    false,
  ];
  const padrao2 = [...padrao1].reverse();
  for (const l of linhas) {
    let corrida = 1;
    for (let i = 1; i <= t; i++) {
      if (i < t && l[i] === l[i - 1]) corrida++;
      else {
        if (corrida >= 5) p += 3 + (corrida - 5);
        corrida = 1;
      }
    }
    for (let i = 0; i + 11 <= t; i++) {
      const igual = (pad: boolean[]) => pad.every((v, k) => l[i + k] === v);
      if (igual(padrao1) || igual(padrao2)) p += 40;
    }
  }
  let escuros = 0;
  for (let y = 0; y < t; y++)
    for (let x = 0; x < t; x++) {
      if (m[y][x]) escuros++;
      if (
        y + 1 < t &&
        x + 1 < t &&
        m[y][x] === m[y][x + 1] &&
        m[y][x] === m[y + 1][x] &&
        m[y][x] === m[y + 1][x + 1]
      )
        p += 3;
    }
  const total = t * t;
  const k = Math.ceil(Math.abs(escuros * 20 - total * 10) / total) - 1;
  return p + Math.max(0, k) * 10;
}

/** Menor versão em que o texto cabe, ou null (passa da versão 40). */
export function versaoMinima(
  bytes: number,
  nivel: NivelCorrecao,
): number | null {
  for (let v = 1; v <= 40; v++) {
    const bits = 4 + bitsContador(v) + bytes * 8;
    if (bits <= palavrasDeDados(v, nivel) * 8) return v;
  }
  return null;
}

/**
 * QR Code do texto (UTF-8). Lança erro se o texto não cabe na versão 40.
 * `mascara` força uma máscara (só para os testes).
 */
export function gerarQrCode(
  textoQr: string,
  nivel: NivelCorrecao = 'M',
  mascara?: number,
): QrCode {
  const bytes = new TextEncoder().encode(textoQr);
  const versao = versaoMinima(bytes.length, nivel);
  if (versao === null) throw new Error('Texto grande demais para o QR Code.');
  const dados = intercalar(
    palavrasDoTexto(bytes, versao, nivel),
    versao,
    nivel,
  );
  const montar = (m: number) => {
    const q = new Matriz(versao);
    q.padroesFixos();
    q.palavras(dados);
    q.aplicarMascara(m);
    q.formato(nivel, m);
    return q;
  };
  let escolhida = mascara ?? 0;
  if (mascara === undefined) {
    let menor = Infinity;
    for (let m = 0; m < 8; m++) {
      const pen = penalidade(montar(m).modulos);
      if (pen < menor) {
        menor = pen;
        escolhida = m;
      }
    }
  }
  const q = montar(escolhida);
  return {
    versao,
    nivel,
    mascara: escolhida,
    tamanho: q.tamanho,
    modulos: q.modulos,
  };
}
