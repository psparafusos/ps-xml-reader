// Tabela de substituição tributária (ICMS-ST) de Sergipe, no leiaute do
// Portal ST do CONFAZ (portal-st-se-vNNNN.xlsx). Lógica pura: recebe as abas
// já lidas (fiscal/xlsx.ts) e devolve uma linha por NCM, mais um relatório do
// que não foi entendido. A busca devolve todos os candidatos de um NCM para
// uma pessoa confirmar; nunca escolhe sozinha quando há mais de um.
//
// Cada aba de segmento tem um cabeçalho em linha diferente. Acima dele vêm a
// versão, a data de produção de efeitos e a linha "ANEXO X – SEGMENTO: Y".
// As colunas são achadas pelo título; a aba "Leiaute" é só o modelo e fica de
// fora.

import { letraColuna, type Aba, type ValorCelula } from './xlsx';

/** Alíquotas interestaduais das colunas de MVA. A de 19 é a da operação interna. */
export const ALIQUOTAS_MVA = ['4', '7', '12', '19'] as const;
export type AliquotaMva = (typeof ALIQUOTAS_MVA)[number];

/** MVA em fração (0.5694 = 56,94%); null quando a célula está vazia ou com "-". */
export type MvaPorAliquota = Record<AliquotaMva, number | null>;

export interface JogoMva {
  /** Título do jogo na planilha, como "MVA-ST 1" ou "MVA Estado não signatário". */
  rotulo: string;
  porAliquota: MvaPorAliquota;
}

export interface AliquotaInterna {
  /** Como está na planilha ("19% + 1% (FECOEP)"); célula numérica vira "19%". */
  texto: string;
  /** Em percentual, somando as partes: "19% + 1% (FECOEP)" = 20. */
  numero: number | null;
}

export interface LinhaST {
  /** Nome da aba (Tintas, Autopecas...). */
  segmento: string;
  /** Segmento como escrito no título da aba ("TINTAS E VERNIZES"). */
  segmentoOficial: string;
  anexo: string;
  item: string;
  cest: string;
  /** Só dígitos, de 4 a 8: é um prefixo do NCM do produto. */
  ncm: string;
  /** Texto da célula de onde o NCM saiu (pode ter vários NCMs). */
  ncmOriginal: string;
  descricao: string;
  /** Primeiro jogo de MVA da linha. */
  mvaPorAliquota: MvaPorAliquota;
  /** Todos os jogos, na ordem das colunas (o primeiro é o mvaPorAliquota). */
  jogosMva: JogoMva[];
  aliquotaInterna: AliquotaInterna | null;
  /** Início de validade ou período de vigência da linha, quando a aba tem. */
  inicioValidade: string | null;
  versao: string;
  vigencia: string;
  /** Linha na planilha (base 1), para conferir na origem. */
  linhaPlanilha: number;
}

export interface ProblemaST {
  aba: string;
  /** Referência da célula ("D12") ou só a linha ("12"). */
  celula: string;
  valor: string;
  motivo: string;
}

export interface RelatorioAba {
  aba: string;
  /** Linha do cabeçalho (base 1); 0 quando não achou. */
  linhaCabecalho: number;
  /** Linhas de produto (com CEST) achadas na aba. */
  linhasProduto: number;
  /** Linhas normalizadas (uma por NCM). */
  linhasNcm: number;
  /** Linhas de produto sem NCM: não entram na busca. */
  linhasSemNcm: number;
  /** Observações sobre como a aba foi lida (colunas deduzidas, conversões). */
  notas: string[];
}

export interface RelatorioST {
  versao: string;
  vigencia: string;
  abas: RelatorioAba[];
  problemas: ProblemaST[];
  totalLinhas: number;
}

export interface TabelaST {
  linhas: LinhaST[];
  relatorio: RelatorioST;
}

const ABAS_IGNORADAS = new Set(['leiaute']);
const RE_CEST = /^\d{2}\.\d{3}\.\d{2}$/;
/** Acima disto a MVA só pode estar em percentual (69,7 = 69,7%), não em fração. */
const LIMITE_FRACAO = 10;

interface Colunas {
  item?: number;
  cest: number;
  ncm?: number;
  descricao?: number;
  aliquotaInterna?: number;
  inicioValidade?: number;
  mva: { coluna: number; jogo: string; aliquota: AliquotaMva | 'unica' }[];
}

export function lerTabelaST(abas: Aba[]): TabelaST {
  const linhas: LinhaST[] = [];
  const problemas: ProblemaST[] = [];
  const relatorios: RelatorioAba[] = [];
  let versao = '';
  let vigencia = '';

  for (const aba of abas) {
    if (ABAS_IGNORADAS.has(semAcento(aba.nome).toLowerCase())) continue;
    const r = lerAba(aba, problemas);
    linhas.push(...r.linhas);
    relatorios.push(r.relatorio);
    if (!versao) versao = r.versao;
    if (!vigencia) vigencia = r.vigencia;
    if (r.versao && r.versao !== versao) {
      problemas.push({ aba: aba.nome, celula: '', valor: r.versao, motivo: `versão diferente da primeira aba (${versao})` });
    }
  }
  return {
    linhas,
    relatorio: { versao, vigencia, abas: relatorios, problemas, totalLinhas: linhas.length },
  };
}

function lerAba(
  aba: Aba,
  problemas: ProblemaST[],
): { linhas: LinhaST[]; relatorio: RelatorioAba; versao: string; vigencia: string } {
  const notas: string[] = [];
  const problema = (celula: string, valor: unknown, motivo: string): void => {
    problemas.push({ aba: aba.nome, celula, valor: String(valor ?? ''), motivo });
  };
  const relatorio: RelatorioAba = {
    aba: aba.nome,
    linhaCabecalho: 0,
    linhasProduto: 0,
    linhasNcm: 0,
    linhasSemNcm: 0,
    notas,
  };

  let versao = '';
  let vigencia = '';
  let anexo = '';
  let segmentoOficial = '';
  let iCab = -1;
  for (let i = 0; i < aba.linhas.length && iCab < 0; i++) {
    const textos = aba.linhas[i].filter((v) => v !== undefined).map((v) => String(v).trim());
    for (const t of textos) {
      const v = /^Vers[ãa]o:\s*(\S+)/i.exec(t);
      if (v) versao = v[1];
      const d = /produ[çc][ãa]o de efeitos a partir de\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t);
      if (d) vigencia = d[1];
      const a = /^ANEXO\s+([IVXLC]+)\s*[–-]\s*SEGMENTO:\s*(.+)$/i.exec(t);
      if (a) {
        anexo = a[1];
        segmentoOficial = a[2].replace(/\s+/g, ' ').trim();
      }
    }
    const normal = textos.map((t) => semAcento(t).toLowerCase());
    if (normal.includes('item') && normal.includes('cest')) iCab = i;
  }
  if (iCab < 0) {
    problema('', '', 'linha de cabeçalho (ITEM e CEST) não encontrada; aba ignorada');
    return { linhas: [], relatorio, versao, vigencia };
  }
  relatorio.linhaCabecalho = iCab + 1;
  if (!anexo) problema('', '', 'título "ANEXO ... – SEGMENTO: ..." não encontrado');

  // Cabeçalho em duas linhas (Medicamento): a de baixo traz só as alíquotas.
  const sub = aba.linhas[iCab + 1] ?? [];
  const temSubcabecalho =
    sub.some((v) => v !== undefined) &&
    sub.every((v) => v === undefined || aliquotaDoTitulo(tituloSub(v)) !== undefined);
  const colunas = acharColunas(aba, iCab, temSubcabecalho ? sub : [], notas, problema);
  if (!colunas) return { linhas: [], relatorio, versao, vigencia };

  const linhas: LinhaST[] = [];
  for (let i = iCab + (temSubcabecalho ? 2 : 1); i < aba.linhas.length; i++) {
    const l = aba.linhas[i];
    if (!l.some((v) => v !== undefined)) continue;
    const ref = (c: number | undefined): string => (c === undefined ? String(i + 1) : `${letraColuna(c)}${i + 1}`);
    const cest = texto(l[colunas.cest]);
    if (!RE_CEST.test(cest)) {
      const conteudo = l.filter((v) => v !== undefined).map(String).join(' | ');
      problema(ref(colunas.cest), conteudo.slice(0, 160), cest ? 'CEST fora do formato NN.NNN.NN' : 'linha sem CEST');
      continue;
    }
    relatorio.linhasProduto++;

    const jogos = new Map<string, MvaPorAliquota>();
    for (const m of colunas.mva) {
      const porAliquota = jogos.get(m.jogo) ?? vazio();
      jogos.set(m.jogo, porAliquota);
      const valor = numeroMva(l[m.coluna], (motivo) => problema(ref(m.coluna), l[m.coluna], motivo));
      if (m.aliquota === 'unica') for (const a of ALIQUOTAS_MVA) porAliquota[a] = valor;
      else porAliquota[m.aliquota] = valor;
    }
    const jogosMva = [...jogos].map(([rotulo, porAliquota]) => ({ rotulo, porAliquota }));

    const base = {
      segmento: aba.nome,
      segmentoOficial,
      anexo,
      item: texto(l[colunas.item]),
      cest,
      descricao: texto(l[colunas.descricao]).replace(/\s+/g, ' '),
      mvaPorAliquota: jogosMva[0]?.porAliquota ?? vazio(),
      jogosMva,
      aliquotaInterna: aliquotaInterna(l[colunas.aliquotaInterna], (motivo) =>
        problema(ref(colunas.aliquotaInterna), l[colunas.aliquotaInterna], motivo),
      ),
      inicioValidade: dataTexto(l[colunas.inicioValidade]),
      versao,
      vigencia,
      linhaPlanilha: i + 1,
    };

    const celulaNcm = colunas.ncm === undefined ? undefined : l[colunas.ncm];
    const ncms = ncmsDaCelula(celulaNcm, (motivo, valor) => problema(ref(colunas.ncm), valor, motivo));
    if (ncms.length === 0) {
      relatorio.linhasSemNcm++;
      if (colunas.ncm !== undefined && celulaNcm !== undefined) continue; // já reportado
      if (colunas.ncm !== undefined) problema(ref(colunas.ncm), '', 'NCM vazio');
      continue;
    }
    for (const ncm of ncms) {
      linhas.push({ ...base, ncm, ncmOriginal: texto(celulaNcm) });
      relatorio.linhasNcm++;
    }
  }
  if (colunas.ncm === undefined) {
    notas.push(`aba sem coluna NCM: ${relatorio.linhasProduto} linhas de produto ficam fora da busca por NCM`);
  }
  return { linhas, relatorio, versao, vigencia };
}

function acharColunas(
  aba: Aba,
  iCab: number,
  sub: (ValorCelula | undefined)[],
  notas: string[],
  problema: (celula: string, valor: unknown, motivo: string) => void,
): Colunas | undefined {
  const cab = aba.linhas[iCab];
  const titulos: string[] = [];
  for (let c = 0; c < Math.max(cab.length, sub.length); c++) titulos[c] = texto(cab[c]).replace(/\s+/g, ' ');

  const achar = (re: RegExp, excluir?: RegExp): number | undefined => {
    const c = titulos.findIndex((t) => re.test(semAcento(t)) && !(excluir && excluir.test(semAcento(t))));
    return c < 0 ? undefined : c;
  };
  const cest = achar(/^cest$/i);
  if (cest === undefined) return undefined;
  const colunas: Colunas = {
    item: achar(/^item$/i),
    cest,
    ncm: achar(/ncm/i),
    descricao: achar(/^descri/i),
    inicioValidade: achar(/vigencia|inicio de validade/i),
    aliquotaInterna: achar(/^aliq(uota|\.)?\s*interna/i),
    mva: [],
  };
  if (colunas.aliquotaInterna === undefined) {
    colunas.aliquotaInterna = achar(/especifica\S*\s+aliq(uota|\.)?\s*interna/i);
    if (colunas.aliquotaInterna !== undefined) {
      notas.push(`alíquota interna lida da coluna "${titulos[colunas.aliquotaInterna]}" (não há outra)`);
    }
  }

  if (colunas.ncm === undefined) {
    // HPPC: a coluna do NCM está sem título. Deduz pela cara dos dados.
    for (let c = 0; c < titulos.length; c++) {
      if (titulos[c] || c === cest) continue;
      const valores = aba.linhas.slice(iCab + 1).map((l) => l[c]).filter((v) => v !== undefined);
      const parecem = valores.filter((v) => /^[\d.\s]+$/.test(String(v)) && !RE_CEST.test(String(v)));
      if (valores.length > 0 && parecem.length / valores.length >= 0.8) {
        colunas.ncm = c;
        notas.push(`coluna ${letraColuna(c)} sem título tratada como NCM (${parecem.length} de ${valores.length} células com cara de NCM)`);
        break;
      }
    }
  }

  let jogoAnterior = 'MVA-ST';
  for (let c = 0; c < titulos.length; c++) {
    const t = titulos[c];
    const subTitulo = tituloSub(sub[c]);
    if (t && /interna|especifica|legisla|vigencia|validade|pfc|pmpf/i.test(semAcento(t))) continue;
    const ehMva = /mva|aliquota de|\d\s*%/i.test(semAcento(t)) || (!t && subTitulo && c > cest);
    if (!ehMva) continue;
    const rotulo = t ? rotuloJogo(t) : jogoAnterior;
    jogoAnterior = rotulo;
    const aliquota = aliquotaDoTitulo(subTitulo || t);
    if (aliquota === undefined) {
      if (/mva/i.test(t)) {
        colunas.mva.push({ coluna: c, jogo: rotulo, aliquota: 'unica' });
        notas.push(`coluna ${letraColuna(c)} "${t}" sem alíquota no título: a MVA vale para 4, 7, 12 e 19`);
      } else {
        problema(`${letraColuna(c)}${iCab + 1}`, t, 'título de coluna parece MVA mas a alíquota não foi entendida');
      }
      continue;
    }
    const original = /(\d+(?:\s*a\s*\d+)?)\s*%/.exec(subTitulo || t)?.[1];
    if (original && original.replace(/\s/g, '') !== aliquota) {
      notas.push(`coluna ${letraColuna(c)} "${subTitulo || t}" lida como MVA de ${aliquota}% (operação interna)`);
    }
    colunas.mva.push({ coluna: c, jogo: rotulo, aliquota });
  }
  if (colunas.mva.length === 0) notas.push('aba sem colunas de MVA');
  return colunas;
}

/** "MVA-ST 1 Alíquota de 4%" -> "MVA-ST 1"; "Alíquota de 4%" -> "MVA-ST". */
function rotuloJogo(titulo: string): string {
  const r = titulo
    .replace(/al[íi]quota de.*$/i, '')
    .replace(/\d+(\s*a\s*\d+)?\s*%.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return r || 'MVA-ST';
}

/** Alíquota interestadual do título da coluna; 18, 19 e "18 a 27" contam como a interna (19). */
function aliquotaDoTitulo(titulo: string): AliquotaMva | undefined {
  const m = /(\d+(?:[.,]\d+)?)(?:\s*a\s*\d+)?\s*%/.exec(titulo);
  if (!m) return undefined;
  const n = Math.round(Number(m[1].replace(',', '.')));
  if (n === 4 || n === 7 || n === 12) return String(n) as AliquotaMva;
  if (n >= 17 && n <= 27) return '19';
  return undefined;
}

function numeroMva(v: ValorCelula | undefined, problema: (motivo: string) => void): number | null {
  if (v === undefined) return null;
  let n: number;
  if (typeof v === 'number') {
    n = v;
  } else {
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
  if (n > LIMITE_FRACAO) {
    problema(`MVA ${n} lida como percentual (${n}% = ${arredondar(n / 100)})`);
    return arredondar(n / 100);
  }
  return n;
}

function aliquotaInterna(v: ValorCelula | undefined, problema: (motivo: string) => void): AliquotaInterna | null {
  if (v === undefined) return null;
  if (typeof v === 'number') {
    const pct = v < 1 ? arredondar(v * 100) : v;
    return { texto: `${String(pct).replace('.', ',')}%`, numero: pct };
  }
  const partes = [...v.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(',', '.')));
  if (partes.length === 0) {
    problema('alíquota interna sem percentual');
    return { texto: v, numero: null };
  }
  return { texto: v.trim(), numero: arredondar(partes.reduce((a, b) => a + b, 0)) };
}

/** Separa os NCMs de uma célula ("3208        3209      3210.00") em só dígitos. */
export function ncmsDaCelula(
  v: ValorCelula | undefined,
  problema: (motivo: string, valor: string) => void = () => {},
): string[] {
  if (v === undefined) return [];
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) {
      problema('NCM gravado como número com decimais: zeros à direita podem ter se perdido', String(v));
    }
    v = String(v);
  }
  const ncms: string[] = [];
  for (const parte of v.split(/[\s,;/]+|\be\b/i)) {
    if (!parte) continue;
    const digitos = parte.replace(/\./g, '');
    if (/^\d{4,8}$/.test(digitos)) {
      if (!ncms.includes(digitos)) ncms.push(digitos);
    } else {
      problema(`trecho "${parte}" não é um NCM (4 a 8 dígitos)`, v);
    }
  }
  return ncms;
}

export interface CandidatoST {
  linha: LinhaST;
  /** Quantos dígitos do NCM bateram (o tamanho do prefixo da tabela). */
  digitos: number;
  /** Quando o CEST foi informado: se é o mesmo da linha. */
  cestConfere: boolean | null;
}

export interface ResultadoBuscaST {
  ncm: string;
  cest: string | null;
  /** Todos os candidatos: CEST igual primeiro (se informado), depois prefixo mais longo. */
  candidatos: CandidatoST[];
  /** Só preenchido quando há exatamente um candidato; com mais de um, uma pessoa escolhe. */
  unico: LinhaST | null;
}

/**
 * Candidatos de ST para um NCM de 8 dígitos (pontos são ignorados). Devolve
 * todas as linhas cujo NCM é prefixo do informado; o CEST, se vier, só
 * ordena e marca, não descarta.
 */
export function buscarST(tabela: TabelaST | LinhaST[], ncm: string, cest?: string): ResultadoBuscaST {
  const linhas = Array.isArray(tabela) ? tabela : tabela.linhas;
  const alvo = ncm.replace(/\D/g, '');
  if (alvo.length !== 8) throw new Error(`NCM deve ter 8 dígitos: "${ncm}"`);
  const cestAlvo = cest?.trim() ? cest.trim() : null;
  const candidatos: CandidatoST[] = linhas
    .filter((l) => alvo.startsWith(l.ncm))
    .map((l) => ({ linha: l, digitos: l.ncm.length, cestConfere: cestAlvo === null ? null : l.cest === cestAlvo }));
  candidatos.sort(
    (a, b) =>
      Number(b.cestConfere === true) - Number(a.cestConfere === true) ||
      b.digitos - a.digitos ||
      a.linha.segmento.localeCompare(b.linha.segmento, 'pt-BR') ||
      a.linha.linhaPlanilha - b.linha.linhaPlanilha,
  );
  return {
    ncm: alvo,
    cest: cestAlvo,
    candidatos,
    unico: candidatos.length === 1 ? candidatos[0].linha : null,
  };
}

function vazio(): MvaPorAliquota {
  return { '4': null, '7': null, '12': null, '19': null };
}

function texto(v: ValorCelula | undefined): string {
  return v === undefined ? '' : String(v).trim();
}

/** Data serial do Excel (42370) vira dd/mm/aaaa; texto fica como está. */
function dataTexto(v: ValorCelula | undefined): string | null {
  if (v === undefined) return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
  }
  return String(v).trim();
}

function arredondar(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Célula do subcabeçalho: 0.07 vira "7%"; texto fica como está. */
function tituloSub(v: ValorCelula | undefined): string {
  if (v === undefined) return '';
  return typeof v === 'number' ? `${arredondar(v * 100)}%` : String(v);
}
