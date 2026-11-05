// Documentos de referência (planilha de ST de Sergipe e TIPI) do ponto de
// vista de quem os carrega: o que foi lido, de onde, quando, e o que ficou
// sem entender. Lógica pura, sem Node e sem Electron: serve ao processo
// principal (fiscal/base.ts grava e lê) e à tela (área de documentos e
// rodapé do painel de conferência).

import type { TabelaCombustiveis } from './combustiveis';
import type { RelatorioST, TabelaST } from './st';
import type { RelatorioTipi, TabelaTipi } from './tipi';

export type TipoDocumento = 'st' | 'tipi' | 'combustiveis';
/** Documentos com verificação online (página oficial conhecida). */
export type TipoOnline = Exclude<TipoDocumento, 'combustiveis'>;

export const NOME_DOCUMENTO: Record<TipoDocumento, string> = {
  st: 'Planilha de ST de Sergipe',
  tipi: 'TIPI',
  combustiveis: 'Combustíveis e lubrificantes (Apêndice XIV)',
};

/** Arquivo sem o Apêndice XIV (planilha de combustíveis). */
export const MENSAGEM_SEM_APENDICE =
  'Este arquivo não parece a planilha de combustíveis: não tem o Apêndice XIV (lubrificantes).';

/** Algo do arquivo que o leitor não entendeu e deixou de fora. */
export interface PontoNaoEntendido {
  /** Aba da planilha; vazio no texto da TIPI. */
  aba: string;
  /** Célula ("D138") ou linha do texto ("linha 812"). */
  celula: string;
  valor: string;
  motivo: string;
}

export interface Quantidade {
  rotulo: string;
  valor: number;
}

/** O que o servidor disse do arquivo, quando ele foi baixado pelo app. */
export interface ServidorDocumento {
  url: string;
  /** Last-Modified (ISO), quando o servidor informa. */
  data: string | null;
  /** Tamanho em bytes no servidor. */
  tamanho: number | null;
  /** Versão anunciada na página (planilha de ST). */
  versao: string | null;
  baixadoEm: string;
}

export interface InfoDocumento {
  formato: number;
  tipo: TipoDocumento;
  /** Nome do arquivo importado. */
  arquivo: string;
  tipoArquivo: 'xlsx' | 'txt';
  tamanhoArquivo: number;
  /** ISO 8601. */
  importadoEm: string;
  /** ST: "0019"; TIPI: o ano ("2022"). Vazio quando o arquivo não diz. */
  versao: string;
  /** ST: início da vigência ("01/07/2023"); TIPI: último ato de atualização. */
  vigencia: string;
  quantidades: Quantidade[];
  /** Exemplos do que não foi entendido (no máximo LIMITE_PONTOS). */
  naoEntendidos: PontoNaoEntendido[];
  totalNaoEntendidos: number;
  /** Como a leitura foi feita (conversões, colunas deduzidas): informação. */
  observacoes: string[];
  servidor: ServidorDocumento | null;
}

export type SituacaoDocumento = 'faltando' | 'carregado' | 'com-pontos';

export const LIMITE_PONTOS = 200;

/** Formato não reconhecido: o documento anterior fica como estava. */
export class ErroFormato extends Error {}

export function situacaoDocumento(
  info: InfoDocumento | null,
): SituacaoDocumento {
  if (!info) return 'faltando';
  return info.totalNaoEntendidos > 0 ? 'com-pontos' : 'carregado';
}

/** Rodapé do painel: "Base: ST ✓ · TIPI ✓", "Base: ST faltando · TIPI ✓". */
export function textoRodapeBase(
  st: InfoDocumento | null,
  tipi: InfoDocumento | null,
): string {
  const parte = (rotulo: string, info: InfoDocumento | null) =>
    info ? `${rotulo} ✓` : `${rotulo} faltando`;
  return `Base: ${parte('ST', st)} · ${parte('TIPI', tipi)}`;
}

type Resumo = Pick<
  InfoDocumento,
  | 'versao'
  | 'vigencia'
  | 'quantidades'
  | 'naoEntendidos'
  | 'totalNaoEntendidos'
  | 'observacoes'
>;

const RE_CONVERSAO_MVA = /lida como percentual/;

/** Valida e resume a planilha de ST lida. Lança ErroFormato se nada foi entendido. */
export function resumoST(t: TabelaST): Resumo {
  const r: RelatorioST = t.relatorio;
  const lidas = r.abas.filter((a) => a.linhaCabecalho > 0);
  if (t.linhas.length === 0)
    throw new ErroFormato(
      lidas.length === 0
        ? 'Nenhuma aba com o cabeçalho ITEM e CEST: não parece a planilha de ST do Portal Nacional da Substituição Tributária.'
        : 'A planilha tem o cabeçalho, mas nenhuma linha de produto com NCM foi lida.',
    );
  const conversoes = r.problemas.filter((p) => RE_CONVERSAO_MVA.test(p.motivo));
  const pontos = r.problemas.filter((p) => !RE_CONVERSAO_MVA.test(p.motivo));
  const observacoes: string[] = [];
  if (conversoes.length > 0) {
    const ex = conversoes[0];
    observacoes.push(
      `${conversoes.length} ${conversoes.length === 1 ? 'MVA escrita' : 'MVAs escritas'} em percentual e convertidas (por exemplo ${ex.aba} ${ex.celula}: ${ex.valor.replace('.', ',')}%).`,
    );
  }
  for (const a of r.abas)
    for (const n of a.notas) observacoes.push(`${a.aba}: ${n}.`);
  return {
    versao: r.versao,
    vigencia: r.vigencia,
    quantidades: [
      { rotulo: 'abas lidas', valor: lidas.length },
      {
        rotulo: 'linhas de produto',
        valor: r.abas.reduce((s, a) => s + a.linhasProduto, 0),
      },
      { rotulo: 'NCMs na busca', valor: t.linhas.length },
    ],
    naoEntendidos: pontos.slice(0, LIMITE_PONTOS).map((p) => ({
      aba: p.aba,
      celula: p.celula,
      valor: p.valor,
      motivo: p.motivo,
    })),
    totalNaoEntendidos: pontos.length,
    observacoes,
  };
}

/** Valores de MVA lidos do Apêndice XIV (internas e interestaduais dos dois grupos). */
export function mvasLidasCombustiveis(t: TabelaCombustiveis): number {
  let n = 0;
  for (const g of [t.derivado, t.naoDerivado]) {
    if (g.interna !== null) n++;
    if (g.interestadual !== null) n++;
    for (const v of Object.values(g.porAliquota ?? {})) if (v !== null) n++;
  }
  return n;
}

/** Valida e resume o Apêndice XIV lido. Lança ErroFormato se nenhuma MVA foi lida. */
export function resumoCombustiveis(t: TabelaCombustiveis): Resumo {
  const r = t.relatorio;
  const mvas = mvasLidasCombustiveis(t);
  if (mvas === 0)
    throw new ErroFormato(
      `O Apêndice XIV da aba "${r.aba}" não tem nenhuma MVA: não parece a planilha de combustíveis.`,
    );
  return {
    versao: t.cabecalho.versao,
    vigencia: t.cabecalho.vigencia,
    quantidades: [{ rotulo: 'MVAs do Apêndice XIV', valor: mvas }],
    naoEntendidos: r.problemas.slice(0, LIMITE_PONTOS).map((p) => ({ ...p })),
    totalNaoEntendidos: r.problemas.length,
    observacoes: [
      `UF destinatária: ${t.cabecalho.uf}.`,
      ...r.notas.map((n) => `${r.aba}: ${n}.`),
    ],
  };
}

/** Linhas que o leitor da TIPI deixa de fora de propósito (notas, Ex, cabeçalhos). */
const IGNORADAS_ESPERADAS = new Set([
  'título e notas de capítulo ou seção',
  'cabeçalho ou rodapé de página',
  'exceção tarifária (Ex) e sua continuação',
  'exceção tarifária (Ex)',
  'título de subcapítulo',
]);

/** Valida e resume a TIPI lida. Lança ErroFormato se nenhum NCM foi lido. */
export function resumoTipi(t: TabelaTipi, tipoArquivo: 'xlsx' | 'txt'): Resumo {
  const r: RelatorioTipi = t.relatorio;
  if (r.totalNcm === 0)
    throw new ErroFormato(
      'Nenhum NCM foi lido: não parece a TIPI (tipi.xlsx ou o texto extraído do PDF).',
    );
  const pontos: PontoNaoEntendido[] = r.semAliquota.map((codigo) => ({
    aba: '',
    celula: codigo,
    valor: '',
    motivo: 'NCM sem alíquota',
  }));
  let total = pontos.length;
  const observacoes: string[] = [];
  for (const g of r.ignoradas) {
    if (IGNORADAS_ESPERADAS.has(g.motivo)) {
      observacoes.push(`${g.total} linhas ignoradas: ${g.motivo}.`);
      continue;
    }
    total += g.total;
    for (const e of g.exemplos)
      pontos.push({
        aba: '',
        celula: e.celula ?? `linha ${e.linha}`,
        valor: e.texto,
        motivo:
          g.total > g.exemplos.length
            ? `${g.motivo} (${g.total} ao todo; exemplos)`
            : g.motivo,
      });
  }
  return {
    versao: r.versao ?? '',
    vigencia: r.atualizacao ?? '',
    quantidades: [
      { rotulo: 'NCMs', valor: r.totalNcm },
      {
        rotulo:
          tipoArquivo === 'xlsx' ? 'linhas da planilha' : 'linhas do texto',
        valor: r.totalLinhas,
      },
    ],
    naoEntendidos: pontos.slice(0, LIMITE_PONTOS),
    totalNaoEntendidos: total,
    observacoes,
  };
}
