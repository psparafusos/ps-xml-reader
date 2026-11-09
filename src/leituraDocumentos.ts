// Leitura dos documentos de referência do ponto de vista de quem confere: o
// que ficou de fora de propósito (abas sem NCM, exceções "Ex", notas da
// TIPI, cabeçalhos) separado dos problemas de leitura de verdade (célula que
// não deu para converter), os segmentos da planilha de ST que não foram
// lidos, o reconhecimento de arquivo errado e o semáforo (verde, amarelo,
// vermelho, sempre com texto). Lógica pura, sem DOM e sem Electron: o
// processo principal grava o resultado em <tipo>-leitura.json e a tela lê.
//
// Usa só os tipos e relatórios de src/fiscal (sem mudar nada lá).

import type { RelatorioCombustiveis } from './fiscal/combustiveis';
import {
  MENSAGEM_SEM_APENDICE,
  type InfoDocumento,
  type TipoDocumento,
} from './fiscal/documentos';
import type { ResultadoVerificacao } from './fiscal/online';
import type { RelatorioST } from './fiscal/st';
import type { RelatorioTipi } from './fiscal/tipi';
import type { Aba } from './fiscal/xlsx';

export const VERSAO_LEITURA = 1;
/** Problemas guardados com o detalhe; acima disto, só a contagem. */
export const LIMITE_PROBLEMAS = 300;

export interface ProblemaLeitura {
  /** Aba (ou segmento) da planilha; vazio no texto da TIPI. */
  aba: string;
  /** Célula ("D138") ou linha do texto ("linha 812"). */
  celula: string;
  valor: string;
  motivo: string;
}

export interface Ignorado {
  motivo: string;
  total: number;
  /** Onde: abas ("Água mineral") ou exemplos curtos ("linha 812"). */
  onde: string[];
}

/** Arquivo <tipo>-leitura.json, ao lado dos metadados do documento. */
export interface LeituraDocumento {
  versao: typeof VERSAO_LEITURA;
  tipo: TipoDocumento;
  arquivo: string;
  /** O mesmo importadoEm dos metadados: diz a qual importação pertence. */
  importadoEm: string;
  /** Abas de segmento da planilha de ST que não foram lidas. */
  segmentosIncompletos: string[];
  problemas: ProblemaLeitura[];
  totalProblemas: number;
  ignorados: Ignorado[];
  observacoes: string[];
}

// ---------- planilha de ST ----------

/** Linhas que a planilha traz sem NCM ou sem CEST (combos, totais): ficam fora da busca de propósito. */
const ST_IGNORADO: [RegExp, string][] = [
  [/^NCM vazio$/, 'linhas de produto sem NCM'],
  [/^linha sem CEST$/, 'linhas sem CEST (combos, títulos, observações)'],
];
const ST_CONVERSAO = /lida como percentual/;
const ST_ABA_IGNORADA = /aba ignorada/;

/** Abas de segmento sem cabeçalho ITEM e CEST, ou com cabeçalho e nenhuma linha lida. */
export function segmentosIncompletosST(r: RelatorioST): string[] {
  return r.abas
    .filter((a) => a.linhaCabecalho === 0 || a.linhasProduto === 0)
    .map((a) => a.aba);
}

export function leituraST(
  r: RelatorioST,
  arquivo: string,
  importadoEm: string,
): LeituraDocumento {
  const segmentosIncompletos = segmentosIncompletosST(r);
  const ignorados = new Map<string, Ignorado>();
  const ignorar = (motivo: string, onde: string) => {
    const g = ignorados.get(motivo) ?? { motivo, total: 0, onde: [] };
    ignorados.set(motivo, g);
    g.total++;
    if (!g.onde.includes(onde) && g.onde.length < 12) g.onde.push(onde);
  };
  const problemas: ProblemaLeitura[] = [];
  let conversoes = 0;
  for (const p of r.problemas) {
    if (ST_ABA_IGNORADA.test(p.motivo)) continue; // vai em segmentosIncompletos
    if (ST_CONVERSAO.test(p.motivo)) {
      conversoes++;
      continue;
    }
    const ign = ST_IGNORADO.find(([re]) => re.test(p.motivo));
    if (ign) ignorar(ign[1], p.aba);
    else problemas.push({ ...p });
  }
  const observacoes: string[] = [];
  for (const a of r.abas)
    for (const n of a.notas) {
      if (n.startsWith('aba sem coluna NCM'))
        ignorar('abas sem coluna NCM (ficam fora da busca por NCM)', a.aba);
      else if (n.startsWith('aba sem colunas de MVA'))
        ignorar('abas sem colunas de MVA', a.aba);
      else observacoes.push(`${a.aba}: ${n}.`);
    }
  if (conversoes > 0)
    observacoes.unshift(
      `${conversoes} ${conversoes === 1 ? 'MVA escrita em percentual e convertida' : 'MVAs escritas em percentual e convertidas'}.`,
    );
  return {
    versao: VERSAO_LEITURA,
    tipo: 'st',
    arquivo,
    importadoEm,
    segmentosIncompletos,
    problemas: problemas.slice(0, LIMITE_PROBLEMAS),
    totalProblemas: problemas.length,
    ignorados: [...ignorados.values()],
    observacoes,
  };
}

// ---------- TIPI ----------

/** O que o leitor da TIPI deixa de fora e é problema de verdade. */
const TIPI_PROBLEMA = new Set(['código não reconhecido']);

export function leituraTipi(
  r: RelatorioTipi,
  arquivo: string,
  importadoEm: string,
): LeituraDocumento {
  const problemas: ProblemaLeitura[] = r.semAliquota.map((codigo) => ({
    aba: '',
    celula: codigo,
    valor: '',
    motivo: 'NCM sem alíquota',
  }));
  let total = problemas.length;
  const ignorados: Ignorado[] = [];
  for (const g of r.ignoradas) {
    const onde = g.exemplos.map((e) => e.celula ?? `linha ${e.linha}`);
    if (TIPI_PROBLEMA.has(g.motivo)) {
      total += g.total;
      for (const e of g.exemplos)
        problemas.push({
          aba: '',
          celula: e.celula ?? `linha ${e.linha}`,
          valor: e.texto,
          motivo: g.motivo,
        });
    } else ignorados.push({ motivo: g.motivo, total: g.total, onde });
  }
  return {
    versao: VERSAO_LEITURA,
    tipo: 'tipi',
    arquivo,
    importadoEm,
    segmentosIncompletos: [],
    problemas: problemas.slice(0, LIMITE_PROBLEMAS),
    totalProblemas: total,
    ignorados,
    observacoes: [],
  };
}

// ---------- combustíveis (Apêndice XIV) ----------

export function leituraCombustiveis(
  r: RelatorioCombustiveis,
  arquivo: string,
  importadoEm: string,
): LeituraDocumento {
  const ignorados: Ignorado[] = [];
  if (r.abasIgnoradas.length > 0)
    ignorados.push({
      motivo: 'abas que não são do Apêndice XIV',
      total: r.abasIgnoradas.length,
      onde: r.abasIgnoradas.slice(0, 12),
    });
  if (r.outrosApendices.length > 0)
    ignorados.push({
      motivo: 'outros apêndices da planilha (combustíveis)',
      total: r.outrosApendices.length,
      onde: r.outrosApendices.slice(0, 13),
    });
  return {
    versao: VERSAO_LEITURA,
    tipo: 'combustiveis',
    arquivo,
    importadoEm,
    segmentosIncompletos: [],
    problemas: r.problemas.slice(0, LIMITE_PROBLEMAS).map((p) => ({ ...p })),
    totalProblemas: r.problemas.length,
    ignorados,
    observacoes: [
      `Lido o Apêndice XIV da aba "${r.aba}" (título na linha ${r.linhaApendice}, valores na linha ${r.linhaValores}).`,
      ...(r.lido ?? []).map((l) => `${l}.`),
      ...r.notas.map((n) => `${r.aba}: ${n}.`),
    ],
  };
}

/** Problemas agrupados por aba (segmento), na ordem em que aparecem. */
export function problemasPorAba(
  problemas: ProblemaLeitura[],
): [string, ProblemaLeitura[]][] {
  const grupos = new Map<string, ProblemaLeitura[]>();
  for (const p of problemas) {
    const lista = grupos.get(p.aba) ?? [];
    grupos.set(p.aba, lista);
    lista.push(p);
  }
  return [...grupos];
}

/** Valida o arquivo lido do disco; null se não serve (ou é de outra importação). */
export function lerLeitura(
  v: unknown,
  info: InfoDocumento | null,
): LeituraDocumento | null {
  if (!info || typeof v !== 'object' || v === null) return null;
  const l = v as Partial<LeituraDocumento>;
  if (
    l.versao !== VERSAO_LEITURA ||
    l.tipo !== info.tipo ||
    l.importadoEm !== info.importadoEm ||
    !Array.isArray(l.segmentosIncompletos) ||
    !Array.isArray(l.problemas) ||
    !Array.isArray(l.ignorados) ||
    !Array.isArray(l.observacoes) ||
    typeof l.totalProblemas !== 'number'
  )
    return null;
  return l as LeituraDocumento;
}

// ---------- situação: rótulo e semáforo ----------

export type CorSemaforo = 'verde' | 'amarela' | 'vermelha';

export interface Sinal {
  cor: CorSemaforo;
  /** Texto curto que vai ao lado da cor (nunca só a cor). */
  texto: string;
}

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

/** Rótulo do cartão: "Carregado" (verde) ou "Carregado com N problemas" (amarelo). */
export function rotuloDocumento(
  info: InfoDocumento | null,
  leitura: LeituraDocumento | null,
  incompativel = false,
): Sinal {
  if (!info)
    return incompativel
      ? { cor: 'vermelha', texto: 'Arquivo incompatível' }
      : { cor: 'vermelha', texto: 'Faltando' };
  const partes: string[] = [];
  if (leitura && leitura.totalProblemas > 0)
    partes.push(plural(leitura.totalProblemas, 'problema', 'problemas'));
  if (leitura && leitura.segmentosIncompletos.length > 0)
    partes.push(
      plural(
        leitura.segmentosIncompletos.length,
        'segmento incompleto',
        'segmentos incompletos',
      ),
    );
  return partes.length === 0
    ? { cor: 'verde', texto: 'Carregado' }
    : { cor: 'amarela', texto: `Carregado com ${partes.join(' e ')}` };
}

/** Semáforo curto do documento (cartão e rodapé do painel). */
export function semaforoDocumento(
  info: InfoDocumento | null,
  leitura: LeituraDocumento | null,
  verificacao: ResultadoVerificacao | null,
  incompativel = false,
): Sinal {
  if (!info)
    return { cor: 'vermelha', texto: incompativel ? 'incompatível' : 'falta' };
  if (leitura && leitura.totalProblemas > 0)
    return {
      cor: 'amarela',
      texto: plural(leitura.totalProblemas, 'problema', 'problemas'),
    };
  if (leitura && leitura.segmentosIncompletos.length > 0)
    return { cor: 'amarela', texto: 'incompleta' };
  if (verificacao?.estado === 'nova')
    return { cor: 'amarela', texto: 'versão nova' };
  return { cor: 'verde', texto: 'ok' };
}

// ---------- reconhecimento de arquivo errado ----------

export type Reconhecido =
  | 'st'
  | 'tipi'
  | 'combustiveis'
  | 'nfe'
  | 'psxml'
  | 'pdf'
  | 'planilha'
  | 'texto';

const normal = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const RE_COMBUSTIVEIS = /cotepe|pmpf|preco medio ponderado|combustive/;
const RE_TIPI =
  /tabela de incidencia do imposto sobre produtos industrializados|\(tipi\)/;

/**
 * O que o arquivo parece ser. `abas`: as abas lidas, quando é .xlsx; senão,
 * o texto do arquivo (só o começo importa).
 */
export function reconhecerArquivo(
  bytes: Uint8Array,
  abas: Aba[] | null,
): Reconhecido {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44) return 'pdf'; // %PD
  if (abas) {
    let combustiveis = false;
    let tipi = false;
    if (abas.some((a) => /ap[eê]ndice\s*xiv(?![a-z])/i.test(normal(a.nome))))
      return 'combustiveis';
    for (const a of abas)
      for (const l of a.linhas.slice(0, 40)) {
        const t = l
          .filter((v) => v !== undefined)
          .map((v) => normal(String(v).trim()));
        if (t.includes('item') && t.includes('cest')) return 'st';
        if (
          t.some((v) => v === 'ncm') &&
          t.some((v) => v.startsWith('descri')) &&
          t.some((v) => v.startsWith('aliquota'))
        )
          tipi = true;
        const junto = t.join(' ');
        if (RE_TIPI.test(junto)) tipi = true;
        if (RE_COMBUSTIVEIS.test(junto)) combustiveis = true;
      }
    if (tipi) return 'tipi';
    if (combustiveis) return 'combustiveis';
    return 'planilha';
  }
  const texto = normal(new TextDecoder().decode(bytes.subarray(0, 200_000)));
  if (texto.includes('pscopiaeditada')) return 'psxml';
  if (/<nfeproc|<nfe[\s>]/.test(texto)) return 'nfe';
  if (RE_TIPI.test(texto)) return 'tipi';
  if ((texto.match(/^\d{4}\.\d{2}\.\d{2}\s/gm) ?? []).length >= 20)
    return 'tipi';
  if (RE_COMBUSTIVEIS.test(texto)) return 'combustiveis';
  return 'texto';
}

const NOME_RECONHECIDO: Record<Reconhecido, string> = {
  st: 'a planilha de ST de Sergipe',
  tipi: 'a TIPI',
  combustiveis: 'a planilha de combustíveis (Ato COTEPE)',
  nfe: 'um XML de NF-e',
  psxml: 'uma cópia editada (.psxml)',
  pdf: 'um PDF',
  planilha: 'uma planilha de outro assunto',
  texto: 'um texto de outro assunto',
};

const ONDE_BAIXAR: Record<TipoDocumento, string> = {
  st: 'Baixe o .xlsx mais recente na página de Sergipe do Portal Nacional da Substituição Tributária (CONFAZ) e use Carregar no cartão da planilha de ST.',
  tipi: 'Baixe o tipi.xlsx na página da TIPI no site da Receita Federal (ou use o texto extraído do PDF) e use Carregar no cartão da TIPI.',
  combustiveis:
    'Baixe a planilha de combustíveis e lubrificantes (Ato COTEPE/ICMS 61/19) na página de MVA de combustíveis do CONFAZ e use Carregar no cartão de combustíveis e lubrificantes.',
};

/** Arquivo que não é o esperado: o que ele parece e o que fazer. */
export function mensagemArquivoErrado(
  esperado: TipoDocumento,
  r: Reconhecido,
): { mensagem: string; oQueFazer: string } {
  if (esperado === 'combustiveis')
    return {
      mensagem:
        r === 'combustiveis' || r === 'planilha' || r === 'texto'
          ? MENSAGEM_SEM_APENDICE
          : `Este arquivo parece ${NOME_RECONHECIDO[r]}: não parece a planilha de combustíveis (falta a aba do Apêndice XIV).`,
      oQueFazer: ONDE_BAIXAR.combustiveis,
    };
  const nomeEsperado = esperado === 'st' ? 'a de ST de Sergipe' : 'a TIPI';
  if (r === 'st' && esperado === 'tipi')
    return {
      mensagem: 'Este arquivo parece a planilha de ST de Sergipe, não a TIPI.',
      oQueFazer: 'Carregue no cartão da planilha de ST.',
    };
  if (r === 'tipi' && esperado === 'st')
    return {
      mensagem: 'Este arquivo parece a TIPI, não a planilha de ST de Sergipe.',
      oQueFazer: 'Carregue no cartão da TIPI.',
    };
  if (r === 'pdf' && esperado === 'tipi')
    return {
      mensagem: 'Este arquivo é um PDF: o app não lê o PDF da TIPI direto.',
      oQueFazer: ONDE_BAIXAR.tipi,
    };
  if (r === esperado)
    return {
      mensagem: `Este arquivo parece ${NOME_RECONHECIDO[r]}, mas não foi possível ler nenhuma linha dele (o leiaute pode ter mudado).`,
      oQueFazer: `${ONDE_BAIXAR[esperado]} Se o erro continuar com o arquivo oficial, avise para ajustar a leitura.`,
    };
  return {
    mensagem: `Este arquivo parece ${NOME_RECONHECIDO[r]}, não ${nomeEsperado}.`,
    oQueFazer: ONDE_BAIXAR[esperado],
  };
}

/**
 * Selo único do cartão: bolinha e texto ("Carregado", "3 problemas de
 * leitura", "Faltando", "Versão nova disponível"), na cor do semáforo.
 */
export function seloDocumento(
  info: InfoDocumento | null,
  leitura: LeituraDocumento | null,
  verificacao: ResultadoVerificacao | null,
  incompativel = false,
): Sinal {
  if (!info)
    return {
      cor: 'vermelha',
      texto: incompativel ? 'Arquivo incompatível' : 'Faltando',
    };
  const partes: string[] = [];
  if (leitura && leitura.totalProblemas > 0)
    partes.push(
      plural(
        leitura.totalProblemas,
        'problema de leitura',
        'problemas de leitura',
      ),
    );
  if (leitura && leitura.segmentosIncompletos.length > 0)
    partes.push(
      plural(
        leitura.segmentosIncompletos.length,
        'segmento incompleto',
        'segmentos incompletos',
      ),
    );
  if (partes.length > 0) return { cor: 'amarela', texto: partes.join(' e ') };
  if (verificacao?.estado === 'nova')
    return { cor: 'amarela', texto: 'Versão nova disponível' };
  return { cor: 'verde', texto: 'Carregado' };
}
