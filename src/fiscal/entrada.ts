// Ferramenta "ST, MVA e CFOP": junta a análise de cada item (fiscal/analise.ts)
// com o que a pessoa decide (finalidade, a linha da planilha ou "sem ST") e
// com as decisões lembradas, e diz o CFOP de entrada e a MVA de cada item.
// Lógica pura, sem DOM e sem Electron.
//
// CFOP pela tabela da loja (1 = fornecedor de Sergipe, 2 = de fora):
//   revenda          sem ST 1102/2102, com ST 1403/2403
//   uso e consumo    sem ST 1556/2556, com ST 1407/2407
//   bonificação      1910/2910
//   ativo imobilizado 1551/2551
//   outras entradas  1949/2949
// A MVA só é calculada para revenda; nas outras finalidades com ST, fica
// "confirmar com a contabilidade".
//
// Decisões lembradas: por raiz do CNPJ do fornecedor (8 dígitos) + código do
// produto. Valem na próxima nota do mesmo produto se o NCM for o mesmo (e,
// para a linha escolhida, se ela ainda estiver entre os candidatos).

import type { AnaliseItem, CandidatoAnalise, MvaJogo } from './analise';

/** Motivo do item que pode ser lubrificante do Apêndice XIV (fiscal/analise.ts). */
export const MOTIVO_APENDICE_XIV =
  'Pode ser lubrificante do Apêndice XIV (sem NCM na planilha); confirme';

/**
 * Autopeças com MVA-ST 1 e MVA-ST 2 (índice de fidelização): a 1 é a padrão.
 * É o único segmento da planilha de Sergipe com a MVA-ST 2, e a loja não tem
 * índice de fidelização. Fica aqui (e não em analise.ts) porque a tela usa:
 * analise.ts puxa o leitor de .xlsx, que só roda no processo principal.
 */
export function jogosAutopecas(
  c: Pick<CandidatoAnalise, 'segmento' | 'segmentoOficial' | 'mvas'>,
): { padrao: MvaJogo; alternativa: MvaJogo } | null {
  const seg = `${c.segmento} ${c.segmentoOficial}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!/autope/.test(seg)) return null;
  if (c.mvas.length !== 2) return null;
  const padrao = c.mvas.find((m) => /^MVA-ST\s*1$/i.test(m.rotulo));
  const alternativa = c.mvas.find((m) => /^MVA-ST\s*2$/i.test(m.rotulo));
  return padrao && alternativa ? { padrao, alternativa } : null;
}

/** Opção do Apêndice XIV (fiscal/combustiveis.ts lê os dois grupos). */
export type TipoLubrificante = 'derivado' | 'nao-derivado';
export const ROTULO_LUBRIFICANTE: Record<TipoLubrificante, string> = {
  derivado: 'derivado de petróleo',
  'nao-derivado': 'não derivado de petróleo',
};

/**
 * Ressalva do Apêndice XIV, junto do motivo de quem escolheu "Sim": pergunta
 * em aberto com a contabilidade (o apêndice é de operações de distribuidoras).
 */
export const RESSALVA_APENDICE_XIV =
  'Apêndice XIV trata de operações de distribuidoras; confirmar com a contabilidade';

export const FINALIDADES = [
  'revenda',
  'uso-consumo',
  'bonificacao',
  'ativo',
  'outras',
] as const;
export type Finalidade = (typeof FINALIDADES)[number];

export const ROTULO_FINALIDADE: Record<Finalidade, string> = {
  revenda: 'Revenda',
  'uso-consumo': 'Uso e consumo',
  bonificacao: 'Bonificação',
  ativo: 'Ativo imobilizado',
  outras: 'Outras entradas',
};

export const FINALIDADE_PADRAO: Finalidade = 'revenda';

/** Sufixo do CFOP por finalidade: [sem ST, com ST]. */
const CFOP_FINALIDADE: Record<Finalidade, [string, string]> = {
  revenda: ['102', '403'],
  'uso-consumo': ['556', '407'],
  bonificacao: ['910', '910'],
  ativo: ['551', '551'],
  outras: ['949', '949'],
};

/** CFOP de entrada. `deSergipe`: fornecedor de SE (1xxx); senão, de fora (2xxx). */
export function cfopEntrada(
  finalidade: Finalidade,
  deSergipe: boolean,
  comST: boolean,
): string {
  return (deSergipe ? '1' : '2') + CFOP_FINALIDADE[finalidade][comST ? 1 : 0];
}

/** O que a pessoa escolheu para a ST de um item. */
export type EscolhaST =
  | { tipo: 'candidato'; segmento: string; linhaPlanilha: number; cest: string }
  /** Lubrificante do Apêndice XIV: derivado ou não derivado de petróleo. */
  | { tipo: 'apendice-xiv'; lubrificante: TipoLubrificante }
  | { tipo: 'sem-st' }
  /**
   * CFOP informado pela pessoa ("Outro"), com a MVA em fração (opcional) e
   * o motivo. Vale como está: não passa pela planilha.
   */
  | { tipo: 'manual'; cfop: string; mva: number | null; motivo: string };

export interface Decisao {
  escolha: EscolhaST | null;
  finalidade: Finalidade;
}

/** Decisão guardada no arquivo de decisões lembradas. */
export interface DecisaoLembrada extends Decisao {
  /** Raiz do CNPJ do fornecedor (8 dígitos). */
  raizCnpj: string;
  fornecedor: string;
  cProd: string;
  xProd: string;
  /** NCM do item quando a decisão foi tomada: só vale para o mesmo NCM. */
  ncm: string;
  /** ISO 8601. */
  atualizadaEm: string;
  /** Escolhida pela sugestão do histórico ("Usar"); ausente: escolha direta. */
  origem?: 'histórico';
}

export const raizCnpj = (cnpj: string) => cnpj.replace(/\D/g, '').slice(0, 8);

export function chaveDecisao(cnpj: string, cProd: string): string {
  return `${raizCnpj(cnpj)}|${cProd.trim()}`;
}

export type StResolvida = 'sim' | 'nao' | 'confirmar';

export interface ItemResolvido {
  nItem: string;
  ncm: string;
  st: StResolvida;
  /** Linha da planilha em uso (escolhida ou única). */
  candidato: CandidatoAnalise | null;
  segmento: string | null;
  cest: string | null;
  finalidade: Finalidade;
  /** MVA em fração, só na revenda com ST e uma MVA definida. */
  mva: number | null;
  /** Texto da coluna MVA ("56,94%", "-", "confirmar com a contabilidade"). */
  mvaTexto: string;
  cfop: string | null;
  /** Motivo principal, curto. */
  motivo: string;
  /** Todos os motivos e pendências, para o detalhe. */
  detalhes: string[];
  /** Informação da TIPI (não é erro). */
  observacoesTipi: string[];
  /** A pessoa precisa decidir algo (ST, MVA ou CFOP em aberto). */
  precisaDeMim: boolean;
  /** Veio de uma decisão lembrada. */
  lembrado: boolean;
  /** CFOP (e MVA) informados pela pessoa na opção "Outro". */
  manual?: boolean;
}

const fmtPct = (v: number) =>
  `${(Math.round(v * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

const mesmoCandidato = (c: CandidatoAnalise, e: EscolhaST) =>
  e.tipo === 'candidato' &&
  c.segmento === e.segmento &&
  c.linhaPlanilha === e.linhaPlanilha;

const mesmaLinhaApendice = (c: CandidatoAnalise, e: EscolhaST) =>
  e.tipo === 'apendice-xiv' && c.lubrificante === e.lubrificante;

/** A decisão ainda serve para esta análise? (mesmo NCM e, se for linha, ela ainda existe). */
export function decisaoAplicavel(
  a: AnaliseItem,
  d: Pick<DecisaoLembrada, 'ncm' | 'escolha'>,
): boolean {
  if (d.ncm !== a.ncm) return false;
  if (d.escolha?.tipo === 'candidato')
    return a.candidatos.some((c) => mesmoCandidato(c, d.escolha!));
  if (d.escolha?.tipo === 'apendice-xiv')
    return (a.apendiceXIV ?? []).some((c) => mesmaLinhaApendice(c, d.escolha!));
  return true;
}

/**
 * Motivo de quem escolheu "Sim" no Apêndice XIV: "Apêndice XIV, derivado de
 * petróleo, MVA 106,67% (interestadual)", com a ressalva da contabilidade.
 */
export function motivoApendiceXIV(c: CandidatoAnalise): string {
  const tipo = c.lubrificante ? ROTULO_LUBRIFICANTE[c.lubrificante] : '';
  const valor = c.mvas[0]?.valor ?? null;
  const mva = valor === null ? 'MVA a confirmar' : `MVA ${fmtPct(valor)}`;
  return `Apêndice XIV, ${tipo}, ${mva} (${c.colunaApendice ?? '-'}). ${RESSALVA_APENDICE_XIV}`;
}

/** Mensagens da análise que são da TIPI: viram observação, não pendência. */
const RE_TIPI = /TIPI/;

export function resolverItem(
  a: AnaliseItem,
  ufEmitente: string,
  decisao: Decisao,
  lembrado = false,
): ItemResolvido {
  const uf = ufEmitente.trim().toUpperCase();
  const finalidade = decisao.finalidade;
  const pendencias = a.pendencias.filter((p) => !RE_TIPI.test(p));
  const observacoesTipi: string[] = [];
  if (a.tipi.existe === false) observacoesTipi.push('NCM não existe na TIPI');
  if (a.tipi.aviso)
    observacoesTipi.push('IPI diferente da TIPI: conferir exceções');

  let st: StResolvida;
  let candidato: CandidatoAnalise | null = null;
  let motivo: string;
  const escolha = decisao.escolha;
  const escolhido =
    escolha?.tipo === 'candidato'
      ? (a.candidatos.find((c) => mesmoCandidato(c, escolha)) ?? null)
      : escolha?.tipo === 'apendice-xiv'
        ? ((a.apendiceXIV ?? []).find((c) => mesmaLinhaApendice(c, escolha)) ??
          null)
        : null;

  if (escolha?.tipo === 'manual') {
    // CFOP do grupo x.400 é entrada com ST; os outros, sem ST.
    const comST = escolha.cfop[1] === '4';
    return {
      nItem: a.nItem,
      ncm: a.ncm,
      st: comST ? 'sim' : 'nao',
      candidato: null,
      segmento: null,
      cest: null,
      finalidade,
      mva: escolha.mva,
      mvaTexto: escolha.mva === null ? '-' : fmtPct(escolha.mva),
      cfop: escolha.cfop,
      motivo: `CFOP manual: ${escolha.motivo}`,
      detalhes: [...new Set([...a.motivos, ...pendencias])],
      observacoesTipi,
      precisaDeMim: false,
      lembrado,
      manual: true,
    };
  }

  if (escolha?.tipo === 'sem-st') {
    st = 'nao';
    motivo = 'marcado "sem ST"';
  } else if (escolhido) {
    st = 'sim';
    candidato = escolhido;
    motivo =
      escolha?.tipo === 'apendice-xiv'
        ? motivoApendiceXIV(escolhido)
        : `linha escolhida: ${escolhido.segmento}, CEST ${escolhido.cest}`;
  } else if (a.stSergipe === 'nao') {
    st = 'nao';
    motivo = 'NCM fora da planilha de ST de Sergipe';
  } else if (a.candidatos.length === 1 && a.cfopSugerido !== null) {
    // Só um candidato e a ST decidida (a dúvida, se houver, é só da MVA).
    st = 'sim';
    candidato = a.candidatos[0];
    motivo = `${candidato.segmento}, CEST ${candidato.cest}`;
  } else {
    st = 'confirmar';
    motivo =
      a.candidatos.length > 1
        ? `${a.candidatos.length} linhas da planilha servem: escolher uma`
        : a.apendiceXIV
          ? MOTIVO_APENDICE_XIV
          : (pendencias[0] ?? 'conferir a linha da planilha');
  }

  // MVA: só da linha em uso, e só na revenda.
  let mva: number | null = null;
  let mvaTexto = '-';
  let mvaPendente = false;
  if (st === 'sim' && candidato) {
    if (finalidade !== 'revenda') {
      mvaTexto = 'confirmar com a contabilidade';
    } else if (candidato.lubrificante) {
      // Apêndice XIV: a coluna já foi escolhida pela análise (interna ou
      // interestadual, e a alíquota quando dividida).
      mva = candidato.mvas[0]?.valor ?? null;
      if (mva === null) {
        mvaTexto = `confirmar (${candidato.colunaApendice ?? 'coluna sem MVA'})`;
        mvaPendente = true;
      } else mvaTexto = fmtPct(mva);
    } else if (a.colunaMva === null) {
      mvaTexto = 'confirmar (alíquota da nota não é 4, 7 ou 12)';
      mvaPendente = true;
    } else {
      const valores = candidato.mvas.filter((m) => m.valor !== null);
      if (valores.length === 1 && candidato.mvas.length === 1) {
        mva = valores[0].valor;
        mvaTexto = fmtPct(mva!);
      } else if (candidato.mvas.length > 1) {
        mvaTexto = `confirmar: ${candidato.mvas
          .map((m) => `${m.rotulo} ${m.valor === null ? '-' : fmtPct(m.valor)}`)
          .join('; ')}`;
        mvaPendente = true;
      } else {
        mvaTexto = `confirmar (linha sem MVA na coluna ${a.colunaMva}%)`;
        mvaPendente = true;
      }
    }
  }

  const cfop =
    st === 'confirmar' || !uf
      ? null
      : cfopEntrada(finalidade, uf === 'SE', st === 'sim');

  return {
    nItem: a.nItem,
    ncm: a.ncm,
    st,
    candidato,
    segmento: candidato?.segmento ?? a.segmento,
    cest: candidato?.cest || null,
    finalidade,
    mva,
    mvaTexto,
    cfop,
    motivo,
    detalhes: [...new Set([...a.motivos, ...pendencias])],
    observacoesTipi,
    precisaDeMim: st === 'confirmar' || cfop === null || mvaPendente,
    lembrado,
  };
}

/** Valida o arquivo de decisões lembradas; o que não serve fica de fora. */
export function lerDecisoes(v: unknown): Record<string, DecisaoLembrada> {
  const r: Record<string, DecisaoLembrada> = {};
  if (typeof v !== 'object' || v === null) return r;
  const lista = (v as { decisoes?: unknown }).decisoes;
  if (typeof lista !== 'object' || lista === null) return r;
  for (const [chave, d] of Object.entries(lista)) {
    if (decisaoValida(d) && chave === chaveDecisao(d.raizCnpj, d.cProd))
      r[chave] = d;
  }
  return r;
}

export function decisaoValida(d: unknown): d is DecisaoLembrada {
  if (typeof d !== 'object' || d === null) return false;
  const x = d as Partial<DecisaoLembrada>;
  const texto = (s: unknown) => typeof s === 'string';
  const e = x.escolha as
    | {
        tipo?: string;
        segmento?: unknown;
        cest?: unknown;
        linhaPlanilha?: unknown;
        cfop?: unknown;
        mva?: unknown;
        motivo?: unknown;
      }
    | null
    | undefined;
  const escolhaOk =
    e === null ||
    (typeof e === 'object' &&
      e !== undefined &&
      (e.tipo === 'sem-st' ||
        (e.tipo === 'manual' &&
          cfopManualValido(e.cfop) &&
          texto(e.motivo) &&
          (e.motivo as string).trim() !== '' &&
          (e.mva === null ||
            (typeof e.mva === 'number' && Number.isFinite(e.mva)))) ||
        (e.tipo === 'apendice-xiv' &&
          ((e as { lubrificante?: unknown }).lubrificante === 'derivado' ||
            (e as { lubrificante?: unknown }).lubrificante ===
              'nao-derivado')) ||
        (e.tipo === 'candidato' &&
          texto(e.segmento) &&
          texto(e.cest) &&
          Number.isInteger(e.linhaPlanilha))));
  return (
    escolhaOk &&
    FINALIDADES.includes(x.finalidade as Finalidade) &&
    /^\d{8}$/.test(x.raizCnpj ?? '') &&
    texto(x.cProd) &&
    x.cProd!.trim() !== '' &&
    texto(x.fornecedor) &&
    texto(x.xProd) &&
    texto(x.ncm) &&
    texto(x.atualizadaEm)
  );
}

// ---------- CFOP manual ("Outro") ----------

/** CFOP de entrada: 4 dígitos, o primeiro 1 (SE), 2 (outro estado) ou 3 (exterior). */
export function cfopManualValido(v: unknown): v is string {
  return typeof v === 'string' && /^[123]\d{3}$/.test(v);
}

/**
 * Lê os campos da opção "Outro". CFOP com ou sem ponto ("2.102"); MVA em
 * percentual ("56,94", "56,94%"), vazia = sem MVA; motivo obrigatório.
 */
export function lerCfopManual(campos: {
  cfop: string;
  mva: string;
  motivo: string;
}):
  | { ok: true; escolha: Extract<EscolhaST, { tipo: 'manual' }> }
  | { ok: false; campo: 'cfop' | 'mva' | 'motivo'; erro: string } {
  const cfop = campos.cfop.replace(/[.\s]/g, '');
  if (!/^\d{4}$/.test(cfop))
    return { ok: false, campo: 'cfop', erro: 'O CFOP tem 4 dígitos.' };
  if (!cfopManualValido(cfop))
    return {
      ok: false,
      campo: 'cfop',
      erro: 'CFOP de entrada começa com 1, 2 ou 3.',
    };
  const mvaTexto = campos.mva.trim().replace(/%$/, '').trim();
  let mva: number | null = null;
  if (mvaTexto) {
    const decimal = mvaTexto.replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(decimal))
      return {
        ok: false,
        campo: 'mva',
        erro: 'MVA em percentual, como 56,94 (ou deixe vazio).',
      };
    mva = Math.round(Number(decimal) * 100) / 10000;
  }
  const motivo = campos.motivo.trim();
  if (!motivo)
    return {
      ok: false,
      campo: 'motivo',
      erro: 'Diga o motivo do CFOP manual.',
    };
  return { ok: true, escolha: { tipo: 'manual', cfop, mva, motivo } };
}

// ---------- Aplicar: o que vai para as anotações ----------

/** Anotações por coluna e nItem (src/nfe/tipos.ts). */
type Anotacoes = Map<string, Map<string, string>>;

export interface Gravacao {
  coluna: string;
  nItem: string;
  valor: string;
  /** Texto que já estava na célula (vazio: nenhum). */
  atual: string;
}

export interface PlanoAplicar {
  /** Células que mudam (as já iguais ficam de fora). */
  gravacoes: Gravacao[];
  /** Itens sem CFOP definido (precisam de decisão): não gravam nada. */
  semCfop: string[];
}

/** Texto da MVA para a anotação: "56,94%". */
export const textoMva = (v: number) => fmtPct(v);

export function planoAplicar(
  itens: ItemResolvido[],
  anotacoes: Anotacoes,
  colunaCfop: string,
  colunaMva: string | null,
): PlanoAplicar {
  const gravacoes: Gravacao[] = [];
  const semCfop: string[] = [];
  const gravar = (coluna: string, nItem: string, valor: string) => {
    const atual = anotacoes.get(coluna)?.get(nItem) ?? '';
    if (atual.trim() !== valor) gravacoes.push({ coluna, nItem, valor, atual });
  };
  for (const i of itens) {
    if (i.cfop === null) {
      semCfop.push(i.nItem);
      continue;
    }
    gravar(colunaCfop, i.nItem, i.cfop);
    if (colunaMva && i.mva !== null)
      gravar(colunaMva, i.nItem, textoMva(i.mva));
  }
  return { gravacoes, semCfop };
}

/** Grava o plano; sem `substituir`, célula já preenchida fica como estava. Devolve quantas mudaram. */
export function executarPlano(
  plano: PlanoAplicar,
  anotacoes: Anotacoes,
  substituir: boolean,
): number {
  let n = 0;
  for (const g of plano.gravacoes) {
    if (g.atual.trim() && !substituir) continue;
    let daColuna = anotacoes.get(g.coluna);
    if (!daColuna) anotacoes.set(g.coluna, (daColuna = new Map()));
    daColuna.set(g.nItem, g.valor);
    n++;
  }
  return n;
}
