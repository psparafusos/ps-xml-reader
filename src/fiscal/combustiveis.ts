// Planilha de combustíveis e lubrificantes do CONFAZ (Ato COTEPE/ICMS 61/19),
// como o CONFAZ publica para cada UF: uma aba só (de nome qualquer), com o
// cabeçalho (ato, UF destinatária, versão, início dos efeitos) e os Apêndices
// I a XIV empilhados. Lógica pura: recebe as abas já lidas (fiscal/xlsx.ts) e
// devolve só as MVAs do Apêndice XIV (lubrificantes).
//
// O Apêndice XIV começa na linha cujo texto começa com "APÊNDICE XIV". Logo
// abaixo vêm:
//   1. os grupos ("Lubrificantes Derivados de Petróleo" e "Lubrificantes Não
//      Derivados de Petróleo"), cada um mesclado sobre as suas colunas;
//   2. "Internas" e "Interestaduais" dentro de cada grupo;
//   3. quando as interestaduais são divididas, a alíquota de cada coluna
//      (0,07, 0,12, "Importação 4%");
//   4. a linha dos valores (MVA em fração: 0,6534 = 65,34%).
// Tudo é achado pelos títulos e pelas células mescladas, não por posição
// fixa. Sem mesclas, um título vale até o próximo título da mesma linha.
//
// Recusa (ErroFormato, o documento anterior fica como estava): sem a linha
// "APÊNDICE XIV", UF destinatária que não é Sergipe, ou o apêndice sem os
// dois grupos e os valores.

import { ErroFormato, MENSAGEM_SEM_APENDICE } from './documentos';
import { letraColuna, type Aba, type ValorCelula } from './xlsx';

import type { TipoLubrificante } from './entrada';

export type { TipoLubrificante };
/** Coluna das interestaduais divididas: 7%, 12% e importação (4%). */
export type AliquotaInterestadual = '4' | '7' | '12';
export const ALIQUOTAS_INTERESTADUAIS: readonly AliquotaInterestadual[] = [
  '7',
  '12',
  '4',
];

export interface GrupoLubrificante {
  /** Título do grupo como está na planilha. */
  titulo: string;
  /** MVA das operações internas (fornecedor de SE), em fração. */
  interna: number | null;
  /**
   * Interestaduais numa coluna só: a MVA dela. null quando a coluna está
   * vazia ou quando as interestaduais são divididas (porAliquota).
   */
  interestadual: number | null;
  /** Interestaduais divididas por alíquota; null quando é uma coluna só. */
  porAliquota: Record<AliquotaInterestadual, number | null> | null;
  /** Célula de cada valor ("A99"), para conferir na origem. */
  celulas: Partial<
    Record<'interna' | 'interestadual' | AliquotaInterestadual, string>
  >;
}

export interface CabecalhoCombustiveis {
  /** "002"; vazio quando a planilha não diz. */
  versao: string;
  /** "SERGIPE", como está na planilha. */
  uf: string;
  /** Início dos efeitos ("01/05/2023"); vazio quando a planilha não diz. */
  vigencia: string;
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
  /** Linha do título "APÊNDICE XIV" (base 1). */
  linhaApendice: number;
  /** Linha dos valores (base 1). */
  linhaValores: number;
  /** Apêndices da mesma aba que não são o XIV ("APÊNDICE I", ...). */
  outrosApendices: string[];
  /** Outras abas da planilha (ignoradas). */
  abasIgnoradas: string[];
  problemas: ProblemaCombustivel[];
  notas: string[];
  /** O que foi lido, em texto, para conferir com a planilha (UF e MVAs). */
  lido: string[];
}

export interface TabelaCombustiveis {
  cabecalho: CabecalhoCombustiveis;
  derivado: GrupoLubrificante;
  naoDerivado: GrupoLubrificante;
  relatorio: RelatorioCombustiveis;
}

/** A tabela gravada tem o formato deste leitor (a antiga, por linhas, não). */
export function tabelaCombustiveisValida(v: unknown): v is TabelaCombustiveis {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Partial<TabelaCombustiveis>;
  return (
    typeof t.cabecalho === 'object' &&
    typeof t.derivado === 'object' &&
    t.derivado !== null &&
    typeof t.naoDerivado === 'object' &&
    t.naoDerivado !== null &&
    typeof t.relatorio === 'object'
  );
}

/** Acima disto a MVA só pode estar em percentual (69,7 = 69,7%). */
const LIMITE_FRACAO = 10;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const texto = (v: ValorCelula | undefined) =>
  v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
const normal = (v: ValorCelula | undefined) =>
  semAcento(texto(v)).toLowerCase();

const RE_APENDICE = /^ap[eê]ndice\s+([ivxlc]+)(?![a-z])/i;
const RE_UF = /^uf\s+destinat[aá]ria(?:\s*\/\s*declarante)?\s*:\s*(.+)$/i;
const RE_VERSAO = /^vers[aã]o\s*:\s*(.+)$/i;
const RE_VIGENCIA =
  /^produ[cç][aã]o\s+de\s+efeitos(?:\s+a\s+partir\s+de)?\s*:\s*(.+)$/i;

/** Texto da linha: as células com algo, juntas. */
const textoLinha = (l: (ValorCelula | undefined)[] | undefined) =>
  (l ?? [])
    .filter((v) => v !== undefined)
    .map(texto)
    .join(' ')
    .trim();

/** Número do apêndice da linha ("XIV"), ou null se a linha não abre um apêndice. */
function apendiceDaLinha(l: (ValorCelula | undefined)[]): string | null {
  const m = RE_APENDICE.exec(semAcento(textoLinha(l)));
  return m ? m[1].toUpperCase() : null;
}

export function lerCombustiveis(abas: Aba[]): TabelaCombustiveis {
  let aba: Aba | undefined;
  let iApendice = -1;
  for (const a of abas) {
    iApendice = a.linhas.findIndex((l) => apendiceDaLinha(l) === 'XIV');
    if (iApendice >= 0) {
      aba = a;
      break;
    }
  }
  if (!aba) throw new ErroFormato(MENSAGEM_SEM_APENDICE);
  const nomeAba = aba.nome;
  const linhas = aba.linhas;
  const problemas: ProblemaCombustivel[] = [];
  const notas: string[] = [];
  function recusar(motivo: string): never {
    throw new ErroFormato(
      `Este arquivo não parece a planilha de combustíveis: ${motivo}`,
    );
  }

  // Cabeçalho: antes do primeiro apêndice (ou do XIV, se não houver outro).
  const iPrimeiro = linhas.findIndex((l) => apendiceDaLinha(l) !== null);
  const cabecalho: CabecalhoCombustiveis = { versao: '', uf: '', vigencia: '' };
  let temAto = false;
  for (const l of linhas.slice(0, iPrimeiro < 0 ? iApendice : iPrimeiro)) {
    const t = textoLinha(l);
    const s = semAcento(t);
    if (/cotepe\s*\/?\s*icms\s*61\s*\/\s*19/i.test(s)) temAto = true;
    const uf = RE_UF.exec(t);
    if (uf) cabecalho.uf = uf[1].trim();
    const versao = RE_VERSAO.exec(t);
    if (versao) cabecalho.versao = versao[1].trim();
    const vig = RE_VIGENCIA.exec(t);
    if (vig) cabecalho.vigencia = vig[1].trim();
  }
  if (!cabecalho.uf)
    recusar(
      'o cabeçalho não diz a UF destinatária ("UF DESTINATÁRIA/DECLARANTE: SERGIPE").',
    );
  if (semAcento(cabecalho.uf).toUpperCase() !== 'SERGIPE')
    throw new ErroFormato(
      `Esta planilha de combustíveis é da UF destinatária ${cabecalho.uf}, não de Sergipe.`,
    );
  if (!temAto) notas.push('cabeçalho sem "ATO COTEPE/ICMS 61/19"');
  if (!cabecalho.versao) notas.push('cabeçalho sem a versão');
  if (!cabecalho.vigencia)
    notas.push('cabeçalho sem a data de produção de efeitos');

  // As linhas do apêndice: do título até o próximo apêndice (ou o fim).
  const iFim = (() => {
    for (let i = iApendice + 1; i < linhas.length; i++)
      if (apendiceDaLinha(linhas[i]) !== null) return i;
    return linhas.length;
  })();
  const naoVazias: number[] = [];
  for (let i = iApendice + 1; i < iFim; i++)
    if ((linhas[i] ?? []).some((v) => v !== undefined && texto(v) !== ''))
      naoVazias.push(i);

  // Até onde vai um título: a mescla que começa nele; sem mescla, até a
  // coluna antes do próximo título da linha (ou até `limite`).
  const mesclas = aba.mesclas ?? [];
  const ate = (linha: number, coluna: number, limite: number): number => {
    const m = mesclas.find((x) => x.linha === linha && x.coluna === coluna);
    if (m) return Math.min(m.ateColuna, limite);
    const l = linhas[linha] ?? [];
    for (let c = coluna + 1; c <= limite; c++)
      if (l[c] !== undefined && texto(l[c]) !== '') return c - 1;
    return limite;
  };

  // 1. Grupos.
  const iGrupos = naoVazias[0];
  if (iGrupos === undefined)
    recusar('o Apêndice XIV está vazio (sem os grupos de lubrificantes).');
  const lGrupos = linhas[iGrupos];
  const ultimaColuna = Math.max(
    ...naoVazias.map((i) => (linhas[i] ?? []).length - 1),
  );
  type Grupo = {
    tipo: TipoLubrificante;
    titulo: string;
    de: number;
    ate: number;
  };
  const grupos: Grupo[] = [];
  for (let c = 0; c < lGrupos.length; c++) {
    const t = normal(lGrupos[c]);
    if (!t) continue;
    if (!/lubrificante/.test(t) || !/derivad/.test(t)) continue;
    grupos.push({
      tipo: /\bnao\s+derivad/.test(t) ? 'nao-derivado' : 'derivado',
      titulo: texto(lGrupos[c]),
      de: c,
      ate: ate(iGrupos, c, ultimaColuna),
    });
  }
  const derivadoG = grupos.find((g) => g.tipo === 'derivado');
  const naoDerivadoG = grupos.find((g) => g.tipo === 'nao-derivado');
  if (!derivadoG || !naoDerivadoG)
    recusar(
      'o Apêndice XIV não tem os grupos "Lubrificantes Derivados de Petróleo" e "Lubrificantes Não Derivados de Petróleo".',
    );

  // 2. Internas e Interestaduais.
  const iOperacao = naoVazias[1];
  if (iOperacao === undefined)
    recusar('o Apêndice XIV não tem a linha "Internas" / "Interestaduais".');
  const lOperacao = linhas[iOperacao];
  type Operacao = {
    tipo: 'interna' | 'interestadual';
    de: number;
    ate: number;
  };
  const operacoes: Operacao[] = [];
  for (const g of [derivadoG!, naoDerivadoG!])
    for (let c = g.de; c <= g.ate; c++) {
      const t = normal(lOperacao[c]);
      if (!t) continue;
      const tipo = t.startsWith('interna')
        ? 'interna'
        : t.startsWith('interestadua')
          ? 'interestadual'
          : null;
      if (!tipo) {
        problemas.push({
          aba: nomeAba,
          celula: `${letraColuna(c)}${iOperacao + 1}`,
          valor: texto(lOperacao[c]),
          motivo: 'título que não é "Internas" nem "Interestaduais"',
        });
        continue;
      }
      operacoes.push({ tipo, de: c, ate: ate(iOperacao, c, g.ate) });
    }

  // 3. Alíquotas das interestaduais divididas (linha opcional).
  const divididas = operacoes.filter(
    (o) => o.tipo === 'interestadual' && o.ate > o.de,
  );
  let iValores = naoVazias[2];
  const aliquotaDaColuna = new Map<number, AliquotaInterestadual>();
  if (divididas.length > 0) {
    const iAliq = naoVazias[2];
    if (iAliq === undefined)
      recusar('faltam as alíquotas das interestaduais no Apêndice XIV.');
    const lAliq = linhas[iAliq];
    for (const o of divididas)
      for (let c = o.de; c <= o.ate; c++) {
        const a = aliquotaDoTitulo(lAliq[c]);
        if (a) aliquotaDaColuna.set(c, a);
        else
          problemas.push({
            aba: nomeAba,
            celula: `${letraColuna(c)}${iAliq + 1}`,
            valor: texto(lAliq[c]),
            motivo: 'alíquota interestadual que não é 4%, 7% nem 12%',
          });
      }
    iValores = naoVazias[3];
  }
  if (iValores === undefined)
    recusar('o Apêndice XIV não tem a linha dos valores de MVA.');
  const lValores = linhas[iValores];

  const valor = (c: number): number | null => {
    const ref = `${letraColuna(c)}${iValores + 1}`;
    return numeroMva(lValores[c], (motivo) =>
      problemas.push({
        aba: nomeAba,
        celula: ref,
        valor: texto(lValores[c]),
        motivo,
      }),
    );
  };

  const montar = (g: Grupo): GrupoLubrificante => {
    const r: GrupoLubrificante = {
      titulo: g.titulo,
      interna: null,
      interestadual: null,
      porAliquota: null,
      celulas: {},
    };
    const ops = operacoes.filter((o) => o.de >= g.de && o.ate <= g.ate);
    const interna = ops.find((o) => o.tipo === 'interna');
    const inter = ops.find((o) => o.tipo === 'interestadual');
    if (!interna || !inter)
      recusar(
        `o grupo "${g.titulo}" do Apêndice XIV não tem as colunas "Internas" e "Interestaduais".`,
      );
    r.interna = valor(interna!.de);
    r.celulas.interna = `${letraColuna(interna!.de)}${iValores + 1}`;
    if (inter!.ate > inter!.de) {
      r.porAliquota = { '4': null, '7': null, '12': null };
      for (let c = inter!.de; c <= inter!.ate; c++) {
        const a = aliquotaDaColuna.get(c);
        if (!a) continue;
        r.porAliquota[a] = valor(c);
        r.celulas[a] = `${letraColuna(c)}${iValores + 1}`;
      }
    } else {
      r.interestadual = valor(inter!.de);
      r.celulas.interestadual = `${letraColuna(inter!.de)}${iValores + 1}`;
    }
    return r;
  };

  const outrosApendices: string[] = [];
  for (const l of linhas) {
    const n = apendiceDaLinha(l);
    if (n && n !== 'XIV') outrosApendices.push(`Apêndice ${n}`);
  }

  const derivado = montar(derivadoG!);
  const naoDerivado = montar(naoDerivadoG!);
  return {
    cabecalho,
    derivado,
    naoDerivado,
    relatorio: {
      lido: [
        `UF destinatária: ${cabecalho.uf}`,
        textoGrupo('Derivados de petróleo', derivado),
        textoGrupo('Não derivados de petróleo', naoDerivado),
      ],
      aba: nomeAba,
      linhaApendice: iApendice + 1,
      linhaValores: iValores + 1,
      outrosApendices,
      abasIgnoradas: abas.filter((a) => a !== aba).map((a) => a.nome),
      problemas,
      notas,
    },
  };
}

const pct = (v: number | null) =>
  v === null
    ? '-'
    : `${(Math.round(v * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** "Derivados de petróleo: interna 65,34% (A99), interestadual 106,67% (B99)". */
function textoGrupo(nome: string, g: GrupoLubrificante): string {
  const partes = [`interna ${pct(g.interna)} (${g.celulas.interna ?? '-'})`];
  if (g.porAliquota)
    for (const a of ALIQUOTAS_INTERESTADUAIS)
      partes.push(
        `${a === '4' ? 'importação 4%' : `interestadual ${a}%`} ${pct(g.porAliquota[a])} (${g.celulas[a] ?? '-'})`,
      );
  else
    partes.push(
      `interestadual ${pct(g.interestadual)} (${g.celulas.interestadual ?? '-'})`,
    );
  return `${nome}: ${partes.join(', ')}`;
}

/** 0,07 ou "7%" -> "7"; "Importação 4%" -> "4"; outra coisa: null. */
function aliquotaDoTitulo(
  v: ValorCelula | undefined,
): AliquotaInterestadual | null {
  if (v === undefined) return null;
  let n: number;
  if (typeof v === 'number') n = v < 1 ? v * 100 : v;
  else {
    const m = /(\d+(?:[.,]\d+)?)\s*%?/.exec(v);
    if (!m) return null;
    n = Number(m[1].replace(',', '.'));
    if (n < 1) n *= 100;
  }
  const r = Math.round(n);
  if (Math.abs(n - r) > 1e-6) return null;
  return r === 4 || r === 7 || r === 12
    ? (String(r) as AliquotaInterestadual)
    : null;
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
  return n > LIMITE_FRACAO ? arredondar(n / 100) : arredondar(n);
}

function arredondar(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
