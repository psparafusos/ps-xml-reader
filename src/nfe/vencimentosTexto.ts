// Vencimentos escritos nas informações complementares. Alguns fornecedores
// não mandam duplicatas no XML (cobr/dup) e escrevem as datas no texto
// ("SEUS VCTOS SERAO: 04/12 11/12 18/12"). Aqui se lê esse trecho e se
// divide o total da nota em parcelas iguais (a diferença dos centavos fica
// na última). Sem segurança para ler todas as datas, não se inventa: devolve
// só o trecho.
// Lógica pura, sem DOM e sem Electron.

export interface ParcelaTexto {
  /** Data no formato do XML (aaaa-mm-dd). */
  dVenc: string;
  /** Valor no formato do XML ("1967.47"). */
  vDup: string;
}

export type VencimentosTexto =
  /** Todas as datas lidas: as parcelas e o trecho, como está na nota. */
  | { tipo: 'datas'; trecho: string; parcelas: ParcelaTexto[] }
  /** Fala de vencimento, mas as datas não deram para ler com segurança. */
  | { tipo: 'ilegivel'; trecho: string };

/**
 * Divide o total (em centavos) em `n` parcelas: as primeiras arredondadas
 * para cima e a última com a diferença (5.902,40 em 3 vezes: 1.967,47,
 * 1.967,47 e 1.967,46).
 */
export function dividirEmParcelas(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cima = Math.ceil(total / n);
  const ultima = total - cima * (n - 1);
  if (ultima >= 0) return [...Array<number>(n - 1).fill(cima), ultima];
  // Total menor que o número de parcelas (centavos): reparte o que há.
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/**
 * Maiúsculas e sem acento, com o mesmo tamanho do texto original (cada
 * posição continua apontando para a mesma letra), para recortar o trecho
 * da nota como foi escrito.
 */
function normalizar(t: string): string {
  let r = '';
  for (const c of t) {
    const u = c.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
    r += u.length === c.length ? u : c;
  }
  return r;
}

/**
 * VCTO, VCTOS, VENCIMENTO, VENCIMENTOS ou VENC, palavra inteira. O ponto
 * das abreviações ("VENC.") faz parte da palavra; depois de VENCIMENTO, o
 * ponto é fim de frase.
 */
const RE_PALAVRA =
  /(?<![\p{L}\d])(?:(?:VCTOS?|VENC)(?![\p{L}\d])\.?|VENCIMENTOS?(?![\p{L}\d]))/gu;
/** Entre a palavra e a primeira data: até 30 letras, sem número nem fim de frase. */
const RE_INTERVALO = /^[^\d.;|\n\r]{0,30}/u;
/** Palavra no intervalo que diz que o número é de outra coisa. */
const RE_OUTRA_DATA =
  /(?<![\p{L}\d])(?:EMISSAO|VALIDADE|PEDIDO|FABRICACAO|ENTREGA|SAIDA)(?![\p{L}\d])/u;
/** dd/mm ou dd/mm/aaaa (também dd/mm/aa), sem número grudado depois. */
const RE_DATA = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/u;
/** Entre duas datas: espaço, vírgula, hífen ou "E". */
const RE_SEPARADOR = /^(?:\s*[,-]\s*|\s+E\s+|\s+)/u;
/** Fim da frase, para recortar o trecho que não deu para ler. */
const RE_FIM_FRASE = /[;|\n\r]|\.(?=\s|$)/u;
const MAX_TRECHO = 200;

const dois = (n: number) => String(n).padStart(2, '0');

/**
 * Data completa (aaaa-mm-dd) de "dd/mm" ou "dd/mm/aaaa". Sem ano: a
 * primeira vez que o dia e o mês aparecem a partir da emissão (no mesmo dia
 * da emissão conta). null se a data não existe ou falta a emissão.
 */
function dataCompleta(
  dia: number,
  mes: number,
  anoEscrito: string | undefined,
  emissao: { ano: number; mes: number; dia: number } | null,
): string | null {
  let ano: number;
  if (anoEscrito)
    ano =
      anoEscrito.length === 2 ? 2000 + Number(anoEscrito) : Number(anoEscrito);
  else {
    if (!emissao) return null;
    const antes =
      mes < emissao.mes || (mes === emissao.mes && dia < emissao.dia);
    ano = emissao.ano + (antes ? 1 : 0);
  }
  const t = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    t.getUTCFullYear() !== ano ||
    t.getUTCMonth() !== mes - 1 ||
    t.getUTCDate() !== dia
  )
    return null;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

/** Recorta o trecho original, sem espaços sobrando e com limite de tamanho. */
function recorte(original: string, inicio: number, fim: number): string {
  const t = original.slice(inicio, fim).replace(/\s+/g, ' ').trim();
  return t.length > MAX_TRECHO ? `${t.slice(0, MAX_TRECHO).trimEnd()}...` : t;
}

/**
 * Vencimentos escritos nas informações complementares (`infCpl`), ou null
 * quando o texto não traz um trecho de vencimento seguido de número. O
 * trecho começa por VCTO, VCTOS, VENCIMENTO, VENCIMENTOS ou VENC (sem
 * diferenciar maiúsculas e acentos) e segue com as datas. `dhEmi` dá o ano
 * das datas sem ano; `vNF` é dividido entre as parcelas.
 */
export function vencimentosDoTexto(
  infCpl: string,
  dhEmi: string,
  vNF: string,
): VencimentosTexto | null {
  const t = normalizar(infCpl);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dhEmi);
  const emissao = m
    ? { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
    : null;
  for (const palavra of t.matchAll(RE_PALAVRA)) {
    const inicio = palavra.index;
    const depois = inicio + palavra[0].length;
    const intervalo = RE_INTERVALO.exec(t.slice(depois))![0];
    let pos = depois + intervalo.length;
    // Sem número logo depois, ou o número é de outra coisa ("VENCIMENTO
    // CONFORME PEDIDO 4512"): não é um trecho de vencimento.
    if (!/\d/.test(t[pos] ?? '') || RE_OUTRA_DATA.test(intervalo)) continue;

    const ilegivel = (): VencimentosTexto => {
      const fim = RE_FIM_FRASE.exec(t.slice(depois));
      return {
        tipo: 'ilegivel',
        trecho: recorte(infCpl, inicio, fim ? depois + fim.index : t.length),
      };
    };

    const datas: string[] = [];
    for (;;) {
      const d = RE_DATA.exec(t.slice(pos));
      if (!d) return ilegivel();
      const completa = dataCompleta(Number(d[1]), Number(d[2]), d[3], emissao);
      if (!completa) return ilegivel();
      datas.push(completa);
      pos += d[0].length;
      const sep = RE_SEPARADOR.exec(t.slice(pos));
      // Outra data (ou outro número) depois do separador: continua lendo;
      // número que não é data deixa o trecho ilegível.
      if (sep && /\d/.test(t[pos + sep[0].length] ?? '')) pos += sep[0].length;
      else break;
    }
    const valores = dividirEmParcelas(
      Math.round((Number(vNF) || 0) * 100),
      datas.length,
    );
    return {
      tipo: 'datas',
      trecho: recorte(infCpl, inicio, pos),
      parcelas: datas.map((dVenc, i) => ({
        dVenc,
        vDup: (valores[i] / 100).toFixed(2),
      })),
    };
  }
  return null;
}
