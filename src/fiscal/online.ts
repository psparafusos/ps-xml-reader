// Verificação online dos documentos de referência: só quando a pessoa liga
// e pede (área de documentos). Lógica sem Electron: recebe a função de busca
// (no app, net.fetch do processo principal), para os testes rodarem sem
// rede. Uma requisição por documento, com tempo limite, sem repetir.
//
// - Planilha de ST: a página do CONFAZ de Sergipe lista "Versão 00XX" com o
//   link do .xlsx. Compara pelo NÚMERO da versão (a 0018 e a 0019 têm a
//   mesma vigência).
// - TIPI: pede só o primeiro byte do tipi.xlsx (Range), para ler o tamanho
//   (Content-Range) e a data (Last-Modified, quando vem) sem baixar tudo. O
//   servidor da Receita recusa HEAD, por isso o GET parcial.

import type { InfoDocumento, TipoOnline } from './documentos';

export const PAGINA_ST =
  'https://www.confaz.fazenda.gov.br/legislacao/portal-nacional-da-substituicao-tributaria/sergipe-1';
export const PAGINA_TIPI =
  'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/tipi-tabela-de-incidencia-do-imposto-sobre-produtos-industrializados';
export const ARQUIVO_TIPI =
  'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx';
export const PAGINA: Record<TipoOnline, string> = {
  st: PAGINA_ST,
  tipi: PAGINA_TIPI,
};

export const TEMPO_LIMITE_MS = 15_000;

export type Buscar = (url: string, init: RequestInit) => Promise<Response>;

export type EstadoVerificacao =
  | 'atualizado'
  | 'nova'
  | 'sem-conexao'
  | 'nao-verificou';

export interface Disponivel {
  url: string;
  /** Versão anunciada (ST: "0020"). */
  versao: string | null;
  /** Vigência anunciada na página (ST: "01.07.2023"). */
  vigencia: string | null;
  data: string | null;
  tamanho: number | null;
}

export interface ResultadoVerificacao {
  tipo: TipoOnline;
  estado: EstadoVerificacao;
  /** Frase para a pessoa. */
  detalhe: string;
  /** Para "Abrir no navegador". */
  pagina: string;
  /** Com estado "nova": o que dá para baixar e importar. */
  disponivel: Disponivel | null;
  /** ISO 8601. */
  verificadoEm: string;
}

export interface VersaoPagina {
  numero: number;
  /** Como está na página ("0019"). */
  texto: string;
  url: string;
  vigencia: string | null;
}

/** Versões da planilha listadas na página do CONFAZ, com o link de cada uma. */
export function versoesConfaz(html: string, base = PAGINA_ST): VersaoPagina[] {
  const versoes: VersaoPagina[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const texto = m[2].replace(/<[^>]*>/g, ' ');
    const v = /Vers[ãa]o\s+(\d{1,5})/i.exec(texto);
    const href = /\bhref\s*=\s*"([^"]+)"/i.exec(m[1])?.[1];
    if (!v || !href || !/\.xlsx(?:$|[?#])/i.test(href)) continue;
    let url: string;
    try {
      url = new URL(href.replace(/&amp;/g, '&'), base).href;
    } catch {
      continue;
    }
    // A vigência vem logo depois do link, no mesmo parágrafo.
    const depois = html.slice(m.index + m[0].length).split(/<a\b|<\/p>/i)[0];
    const vig =
      /Vig[êe]ncia\s+a\s+partir\s+de\s+(\d{2}[./]\d{2}[./]\d{4})/i.exec(
        depois.replace(/<[^>]*>/g, ' '),
      );
    versoes.push({
      numero: Number(v[1]),
      texto: v[1],
      url,
      vigencia: vig?.[1] ?? null,
    });
  }
  return versoes;
}

/** Só baixa de onde a verificação aponta: o CONFAZ (ST) ou o gov.br (TIPI). */
export function urlPermitida(tipo: TipoOnline, url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return tipo === 'st'
      ? u.hostname === 'www.confaz.fazenda.gov.br'
      : u.hostname === 'www.gov.br';
  } catch {
    return false;
  }
}

/** Tamanho total e data do arquivo pelos cabeçalhos de uma resposta parcial (ou inteira). */
export function lerCabecalhos(h: Headers): {
  tamanho: number | null;
  data: string | null;
} {
  const faixa = /\/(\d+)\s*$/.exec(h.get('content-range') ?? '');
  const comprimento = h.get('content-length');
  const tamanho = faixa
    ? Number(faixa[1])
    : comprimento && !h.get('content-range')
      ? Number(comprimento)
      : null;
  const lm = h.get('last-modified');
  const t = lm ? Date.parse(lm) : NaN;
  return {
    tamanho: tamanho !== null && Number.isFinite(tamanho) ? tamanho : null,
    data: Number.isNaN(t) ? null : new Date(t).toISOString(),
  };
}

/** Falha de rede (sem internet, DNS, tempo esgotado) e não resposta inesperada. */
function ehSemConexao(erro: unknown): boolean {
  if (!(erro instanceof Error)) return false;
  return (
    erro.name === 'TimeoutError' ||
    erro.name === 'AbortError' ||
    erro instanceof TypeError
  );
}

const resultado = (
  tipo: TipoOnline,
  estado: EstadoVerificacao,
  detalhe: string,
  agora: Date,
  disponivel: Disponivel | null = null,
): ResultadoVerificacao => ({
  tipo,
  estado,
  detalhe,
  pagina: PAGINA[tipo],
  disponivel,
  verificadoEm: agora.toISOString(),
});

export async function verificarST(
  info: InfoDocumento | null,
  buscar: Buscar,
  agora: Date = new Date(),
  tempoLimite = TEMPO_LIMITE_MS,
): Promise<ResultadoVerificacao> {
  let html: string;
  try {
    const r = await buscar(PAGINA_ST, {
      signal: AbortSignal.timeout(tempoLimite),
    });
    if (!r.ok)
      return resultado(
        'st',
        'nao-verificou',
        `Não consegui verificar a planilha de ST: a página do CONFAZ respondeu ${r.status}.`,
        agora,
      );
    html = await r.text();
  } catch (erro) {
    return ehSemConexao(erro)
      ? resultado(
          'st',
          'sem-conexao',
          'Sem conexão com a página do CONFAZ.',
          agora,
        )
      : resultado(
          'st',
          'nao-verificou',
          'Não consegui verificar a planilha de ST.',
          agora,
        );
  }
  const versoes = versoesConfaz(html);
  if (versoes.length === 0)
    return resultado(
      'st',
      'nao-verificou',
      'Não consegui verificar a planilha de ST: a página do CONFAZ não lista nenhuma "Versão" com planilha.',
      agora,
    );
  const maior = versoes.reduce((a, b) => (b.numero > a.numero ? b : a));
  const disponivel: Disponivel = {
    url: maior.url,
    versao: maior.texto,
    vigencia: maior.vigencia,
    data: null,
    tamanho: null,
  };
  const vigencia = maior.vigencia
    ? `, vigência a partir de ${maior.vigencia}`
    : '';
  const atual = info ? Number(info.versao) : NaN;
  if (!info)
    return resultado(
      'st',
      'nova',
      `Disponível no CONFAZ: versão ${maior.texto}${vigencia}.`,
      agora,
      disponivel,
    );
  if (Number.isNaN(atual))
    return resultado(
      'st',
      'nao-verificou',
      `Não consegui comparar: a planilha carregada não informa a versão. No CONFAZ: versão ${maior.texto}.`,
      agora,
      disponivel,
    );
  if (maior.numero > atual)
    return resultado(
      'st',
      'nova',
      `Versão nova disponível: ${maior.texto}${vigencia} (carregada: ${info.versao}).`,
      agora,
      disponivel,
    );
  return resultado(
    'st',
    'atualizado',
    `Atualizado: a versão ${info.versao} é a mais recente no CONFAZ.`,
    agora,
  );
}

export async function verificarTipi(
  info: InfoDocumento | null,
  buscar: Buscar,
  agora: Date = new Date(),
  tempoLimite = TEMPO_LIMITE_MS,
): Promise<ResultadoVerificacao> {
  const falhou = (detalhe = 'Não consegui verificar a TIPI.') =>
    resultado('tipi', 'nao-verificou', detalhe, agora);
  let servidor: { tamanho: number | null; data: string | null };
  try {
    const r = await buscar(ARQUIVO_TIPI, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(tempoLimite),
    });
    // Só os cabeçalhos interessam: descarta o corpo sem ler.
    void r.body?.cancel().catch(() => undefined);
    if (!r.ok)
      return falhou(
        `Não consegui verificar a TIPI: o site da Receita respondeu ${r.status}.`,
      );
    servidor = lerCabecalhos(r.headers);
  } catch (erro) {
    return ehSemConexao(erro)
      ? resultado(
          'tipi',
          'sem-conexao',
          'Sem conexão com o site da Receita.',
          agora,
        )
      : falhou();
  }
  if (servidor.tamanho === null && servidor.data === null) return falhou();
  const disponivel: Disponivel = {
    url: ARQUIVO_TIPI,
    versao: null,
    vigencia: null,
    ...servidor,
  };
  if (!info)
    return resultado(
      'tipi',
      'nova',
      'Disponível no site da Receita: tipi.xlsx.',
      agora,
      disponivel,
    );
  // Guardado na importação: o que o servidor disse (arquivo baixado pelo
  // app) ou, no tipi.xlsx escolhido no computador, o tamanho do arquivo.
  const tamanhoGuardado =
    info.servidor?.tamanho ??
    (info.tipoArquivo === 'xlsx' ? info.tamanhoArquivo : null);
  const dataGuardada = info.servidor?.data ?? null;
  const comparaData = servidor.data !== null && dataGuardada !== null;
  const comparaTamanho = servidor.tamanho !== null && tamanhoGuardado !== null;
  if (!comparaData && !comparaTamanho)
    return falhou(
      info.tipoArquivo === 'txt'
        ? 'Não consegui verificar a TIPI: a carregada veio do texto do PDF, sem data nem tamanho do arquivo do site para comparar.'
        : undefined,
    );
  const mudou =
    (comparaData && servidor.data !== dataGuardada) ||
    (comparaTamanho && servidor.tamanho !== tamanhoGuardado);
  return mudou
    ? resultado(
        'tipi',
        'nova',
        'Versão nova disponível: o tipi.xlsx do site da Receita mudou desde a importação.',
        agora,
        disponivel,
      )
    : resultado(
        'tipi',
        'atualizado',
        'Atualizado: o tipi.xlsx do site da Receita é o mesmo da importação.',
        agora,
      );
}

// ---------- download (botão Atualizar) ----------

/** Tempo para baixar a planilha (a de ST tem ~1 MB; a TIPI, ~700 KB). */
export const TEMPO_DOWNLOAD_MS = 120_000;
export const LIMITE_DOWNLOAD = 30 * 1024 * 1024;

export interface ArquivoBaixado {
  dados: Uint8Array;
  /** Nome do arquivo no endereço ("portal-st-se-v0020.xlsx"). */
  nome: string;
  /** Last-Modified (ISO), quando o servidor informa. */
  data: string | null;
}

/** Recebido até agora e o total (null quando o servidor não diz). */
export type AoProgresso = (recebido: number, total: number | null) => void;

/**
 * Baixa o arquivo de uma versão anunciada. Só https e só do CONFAZ (ST) ou
 * do gov.br (TIPI), como a verificação. Lança Error com o motivo em
 * português ("o servidor respondeu 404", "arquivo grande demais").
 */
export async function baixarArquivo(
  tipo: TipoOnline,
  url: string,
  buscar: Buscar,
  aoProgresso: AoProgresso = () => undefined,
  tempoLimite = TEMPO_DOWNLOAD_MS,
  limite = LIMITE_DOWNLOAD,
): Promise<ArquivoBaixado> {
  if (!urlPermitida(tipo, url))
    throw new Error('endereço fora do site oficial');
  const resp = await buscar(url, {
    signal: AbortSignal.timeout(tempoLimite),
  });
  if (!resp.ok) throw new Error(`o servidor respondeu ${resp.status}`);
  const declarado = Number(resp.headers.get('content-length'));
  const total = Number.isFinite(declarado) && declarado > 0 ? declarado : null;
  if (total !== null && total > limite)
    throw new Error('arquivo grande demais');
  const partes: Uint8Array[] = [];
  let recebido = 0;
  aoProgresso(0, total);
  if (resp.body) {
    const leitor = resp.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      recebido += value.length;
      if (recebido > limite) {
        void leitor.cancel().catch(() => undefined);
        throw new Error('arquivo grande demais');
      }
      partes.push(value);
      aoProgresso(recebido, total);
    }
  }
  const dados = new Uint8Array(recebido);
  let pos = 0;
  for (const p of partes) {
    dados.set(p, pos);
    pos += p.length;
  }
  const lm = Date.parse(resp.headers.get('last-modified') ?? '');
  let nome = '';
  try {
    nome = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    nome = '';
  }
  return {
    dados,
    nome: nome || `${tipo}.xlsx`,
    data: Number.isNaN(lm) ? null : new Date(lm).toISOString(),
  };
}
