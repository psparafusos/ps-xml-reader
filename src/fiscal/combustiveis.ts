// Planilha de combustíveis e lubrificantes do CONFAZ (Ato COTEPE/ICMS 61/19).
// Lógica pura: recebe as abas já lidas (fiscal/xlsx.ts) e devolve só as
// linhas do Apêndice XIV (lubrificantes derivados de petróleo), com a
// descrição, a MVA e a alíquota de cada uma. As outras abas ficam de fora.
//
// A aba é achada pelo nome ou pelo título "APÊNDICE XIV" nas primeiras
// linhas. As colunas são achadas pelo título: descrição, MVA (uma coluna
// única ou uma por alíquota interestadual, como na planilha de ST) e
// alíquota. Se a aba tiver coluna de UF, só as linhas de SE (ou sem UF)
// entram. Arquivo sem a aba: ErroFormato ("não parece a planilha de
// combustíveis"), e o documento anterior fica como estava.

import { ErroFormato, MENSAGEM_SEM_APENDICE } from './documentos';
import { ALIQUOTAS_MVA, type AliquotaMva, type MvaPorAliquota } from './st';
import { letraColuna, type Aba, type ValorCelula } from './xlsx';

export interface LinhaCombustivel {
  descricao: string;
  /** MVA em fração por coluna de alíquota (4, 7, 12 e 19 = interna). */
  mvaPorAliquota: MvaPorAliquota;
  /** Alíquota como está na planilha ("18%"); null quando a célula está vazia. */
  aliquotaTexto: string | null;
  /** Alíquota em percentual; null quando não deu para ler. */
  aliquota: number | null;
  /** Linha na planilha (base 1), para conferir na origem. */
  linhaPlanilha: number;
}

export interface ProblemaCombustivel {
  aba: string;
  celula: string;
  valor: string;
  motivo: string;
}

export interface RelatorioCombustiveis {
  /** Nome da aba lida. */
  aba: string;
  /** Linha do cabeçalho (base 1). */
  linhaCabecalho: number;
  totalLinhas: number;
  /** Linhas de outra UF (a aba tem coluna de UF): ficam de fora. */
  outrasUf: number;
  /** Abas da planilha que não são do Apêndice XIV (ignoradas). */
  abasIgnoradas: string[];
  problemas: ProblemaCombustivel[];
  notas: string[];
}

export interface TabelaCombustiveis {
  linhas: LinhaCombustivel[];
  relatorio: RelatorioCombustiveis;
}

const RE_APENDICE = /ap[eê]ndice\s*xiv(?![a-z])/i;
/** Acima disto a MVA só pode estar em percentual (69,7 = 69,7%). */
const LIMITE_FRACAO = 10;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const texto = (v: ValorCelula | undefined) =>
  v === undefined ? '' : String(v).trim();

function ehApendiceXIV(aba: Aba): boolean {
  if (RE_APENDICE.test(semAcento(aba.nome))) return true;
  return aba.linhas
    .slice(0, 10)
    .some((l) => l.some((v) => RE_APENDICE.test(semAcento(texto(v)))));
}

export function lerCombustiveis(abas: Aba[]): TabelaCombustiveis {
  const aba = abas.find(ehApendiceXIV);
  if (!aba) throw new ErroFormato(MENSAGEM_SEM_APENDICE);
  const problemas: ProblemaCombustivel[] = [];
  const notas: string[] = [];
  const problema = (celula: string, valor: unknown, motivo: string) =>
    problemas.push({
      aba: aba.nome,
      celula,
      valor: String(valor ?? ''),
      motivo,
    });

  const iCab = aba.linhas.findIndex((l) => {
    const t = l.map((v) => semAcento(texto(v)).toLowerCase());
    return (
      t.some((x) => x.startsWith('descri')) && t.some((x) => /mva/.test(x))
    );
  });
  if (iCab < 0)
    throw new ErroFormato(
      `A aba "${aba.nome}" não tem o cabeçalho com Descrição e MVA: não parece a planilha de combustíveis.`,
    );
  const titulos = aba.linhas[iCab].map((v) =>
    semAcento(texto(v)).replace(/\s+/g, ' '),
  );
  const achar = (re: RegExp) => {
    const c = titulos.findIndex((t) => t && re.test(t));
    return c < 0 ? undefined : c;
  };
  const colDescricao = achar(/^descri/i)!;
  const colUf = achar(/^uf$/i);
  const colAliquota = titulos.findIndex(
    (t) => t && /aliq/i.test(t) && !/mva/i.test(t),
  );
  const colunasMva: { coluna: number; aliquota: AliquotaMva | 'unica' }[] = [];
  for (let c = 0; c < titulos.length; c++) {
    if (!titulos[c] || !/mva/i.test(titulos[c])) continue;
    colunasMva.push({ coluna: c, aliquota: aliquotaDoTitulo(titulos[c]) });
  }
  if (colAliquota < 0) notas.push('aba sem coluna de alíquota');
  if (colUf !== undefined)
    notas.push('aba com coluna de UF: só as linhas de SE');

  const linhas: LinhaCombustivel[] = [];
  let outrasUf = 0;
  for (let i = iCab + 1; i < aba.linhas.length; i++) {
    const l = aba.linhas[i];
    if (!l.some((v) => v !== undefined)) continue;
    const descricao = texto(l[colDescricao]).replace(/\s+/g, ' ');
    if (!descricao) {
      problema(
        `${letraColuna(colDescricao)}${i + 1}`,
        l.filter((v) => v !== undefined).join(' | '),
        'linha sem descrição',
      );
      continue;
    }
    if (colUf !== undefined) {
      const uf = texto(l[colUf]).toUpperCase();
      if (uf && uf !== 'SE') {
        outrasUf++;
        continue;
      }
    }
    const mvaPorAliquota: MvaPorAliquota = {
      '4': null,
      '7': null,
      '12': null,
      '19': null,
    };
    for (const m of colunasMva) {
      const ref = `${letraColuna(m.coluna)}${i + 1}`;
      const valor = numeroMva(l[m.coluna], (motivo) =>
        problema(ref, l[m.coluna], motivo),
      );
      if (m.aliquota === 'unica')
        for (const a of ALIQUOTAS_MVA) mvaPorAliquota[a] ??= valor;
      else mvaPorAliquota[m.aliquota] = valor;
    }
    const aliq = colAliquota < 0 ? null : lerAliquota(l[colAliquota]);
    if (
      colAliquota >= 0 &&
      l[colAliquota] !== undefined &&
      aliq?.numero == null
    )
      problema(
        `${letraColuna(colAliquota)}${i + 1}`,
        l[colAliquota],
        'alíquota sem percentual',
      );
    linhas.push({
      descricao,
      mvaPorAliquota,
      aliquotaTexto: aliq?.texto ?? null,
      aliquota: aliq?.numero ?? null,
      linhaPlanilha: i + 1,
    });
  }
  return {
    linhas,
    relatorio: {
      aba: aba.nome,
      linhaCabecalho: iCab + 1,
      totalLinhas: linhas.length,
      outrasUf,
      abasIgnoradas: abas.filter((a) => a !== aba).map((a) => a.nome),
      problemas,
      notas,
    },
  };
}

/** "MVA 4%" -> "4"; 17 a 27% conta como a interna (19); sem alíquota: única. */
function aliquotaDoTitulo(titulo: string): AliquotaMva | 'unica' {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(titulo);
  if (!m) return 'unica';
  const n = Math.round(Number(m[1].replace(',', '.')));
  if (n === 4 || n === 7 || n === 12) return String(n) as AliquotaMva;
  if (n >= 17 && n <= 27) return '19';
  return 'unica';
}

function numeroMva(
  v: ValorCelula | undefined,
  problema: (motivo: string) => void,
): number | null {
  if (v === undefined) return null;
  let n: number;
  if (typeof v === 'number') n = v;
  else {
    const t = v.trim();
    if (t === '' || /^[-–]+$/.test(t)) return null;
    const m = /^(\d+(?:[.,]\d+)?)\s*(%?)$/.exec(t);
    if (!m) {
      problema('MVA não é número nem percentual');
      return null;
    }
    n = Number(m[1].replace(',', '.'));
    if (m[2] === '%') return arredondar(n / 100);
  }
  return n > LIMITE_FRACAO ? arredondar(n / 100) : n;
}

function lerAliquota(
  v: ValorCelula | undefined,
): { texto: string; numero: number | null } | null {
  if (v === undefined) return null;
  if (typeof v === 'number') {
    const pct = v < 1 ? arredondar(v * 100) : v;
    return { texto: `${String(pct).replace('.', ',')}%`, numero: pct };
  }
  const partes = [...v.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) =>
    Number(m[1].replace(',', '.')),
  );
  return {
    texto: v.trim(),
    numero:
      partes.length === 0
        ? null
        : arredondar(partes.reduce((a, b) => a + b, 0)),
  };
}

function arredondar(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
