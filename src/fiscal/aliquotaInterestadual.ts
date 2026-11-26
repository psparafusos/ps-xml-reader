// Alíquota interestadual de ICMS esperada para um item, pela UF do emitente,
// pela UF do destinatário e pela origem da mercadoria (campo orig do ICMS).
// Lógica pura, sem DOM e sem Electron: a análise da ferramenta "ST, MVA e
// CFOP" e a Conferência usam. O app avisa quando a nota traz outra
// alíquota; não decide nada com isso.
//
// Regras:
// - Mesma UF: operação interna, a alíquota interestadual não se aplica.
// - Origem 1, 2, 3 ou 8: 4%. Resolução do Senado Federal nº 13/2012, art. 1º;
//   as origens 6 e 7 (importado sem similar nacional, lista da CAMEX) ficam
//   fora dos 4% pelo art. 1º, § 4º, I.
//   https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/Congresso/RSF-13-2012.htm
// - Emitente no Sul ou no Sudeste, menos o ES (SP, RJ, MG, PR, SC ou RS), e
//   destinatário no Norte, no Nordeste, no Centro-Oeste ou no ES: 7%.
//   Resolução do Senado Federal nº 22/1989, art. 1º, parágrafo único.
// - Demais casos: 12%. Resolução do Senado Federal nº 22/1989, art. 1º.
//   https://www2.camara.leg.br/legin/fed/ressen/1989/resolucao-22-19-maio-1989-481183-publicacaooriginal-1-pl.html

const UFS = new Set(
  'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(
    ' ',
  ),
);

/** Emitentes da regra dos 7% (Sul e Sudeste, sem o ES). */
const UFS_EMITENTE_7 = new Set(['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']);

/** Destinos da regra dos 7%: Norte, Nordeste, Centro-Oeste e ES. */
const UFS_DESTINO_7 = new Set(
  [
    'AC AM AP PA RO RR TO', // Norte
    'AL BA CE MA PB PE PI RN SE', // Nordeste
    'DF GO MS MT', // Centro-Oeste
    'ES',
  ]
    .join(' ')
    .split(' '),
);

/** Origens dos 4% (Resolução do Senado 13/2012). */
export const ORIGENS_4 = new Set(['1', '2', '3', '8']);
/** Origens que não entram nos 4%. As 6 e 7 são importados sem similar nacional. */
export const ORIGENS_FORA_DOS_4 = new Set(['0', '4', '5', '6', '7']);

export type AliquotaInterestadual = 4 | 7 | 12;

export type AliquotaEsperada =
  | { operacao: 'interna' }
  | {
      operacao: 'interestadual';
      aliquota: AliquotaInterestadual;
      /** Por que essa alíquota: "origem 1: 4%", "SP para o ES: 7%". */
      motivo: string;
    };

const uf = (s: string | undefined) => s?.trim().toUpperCase() ?? '';

/**
 * Alíquota interestadual esperada. null quando não dá para saber: UF ausente
 * ou fora da lista (exterior), ou origem vazia ou desconhecida numa operação
 * entre estados.
 */
export function aliquotaInterestadualEsperada(
  ufEmitente: string | undefined,
  ufDestinatario: string | undefined,
  orig: string | undefined,
): AliquotaEsperada | null {
  const de = uf(ufEmitente);
  const para = uf(ufDestinatario);
  if (!UFS.has(de) || !UFS.has(para)) return null;
  if (de === para) return { operacao: 'interna' };
  const origem = orig?.trim() ?? '';
  if (ORIGENS_4.has(origem))
    return {
      operacao: 'interestadual',
      aliquota: 4,
      motivo: `origem ${origem}: 4% (Resolução do Senado 13/2012)`,
    };
  if (!ORIGENS_FORA_DOS_4.has(origem)) return null;
  if (UFS_EMITENTE_7.has(de) && UFS_DESTINO_7.has(para))
    return {
      operacao: 'interestadual',
      aliquota: 7,
      motivo: `de ${de} para ${para}: 7% (Resolução do Senado 22/1989)`,
    };
  return {
    operacao: 'interestadual',
    aliquota: 12,
    motivo: `de ${de} para ${para}: 12% (Resolução do Senado 22/1989)`,
  };
}

/** Campos do item que o aviso usa, como no XML (vazio = ausente). */
export interface ItemAliquota {
  orig?: string;
  CSOSN?: string;
  pICMS?: string;
}

/** pICMS em número (até 4 casas); vazio ou inválido: null. */
function numero(v: string | undefined): number | null {
  const t = v?.trim().replace(',', '.') ?? '';
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : null;
}

const pct = (n: number) => `${String(n).replace('.', ',')}%`;

/**
 * Aviso de alíquota de ICMS diferente da esperada, ou null. Só compara o
 * item que destaca ICMS (pICMS maior que zero e sem CSOSN): Simples
 * Nacional, isentos e ST já retido sem destaque ficam de fora. Operação
 * interna e alíquota esperada desconhecida também.
 */
export function avisoAliquotaIcms(
  item: ItemAliquota,
  esperada: AliquotaEsperada | null,
): string | null {
  if (esperada?.operacao !== 'interestadual') return null;
  if (item.CSOSN?.trim()) return null;
  const nota = numero(item.pICMS);
  if (nota === null || nota <= 0) return null;
  if (nota === esperada.aliquota) return null;
  const origem = item.orig?.trim() ?? '';
  let texto = `Alíquota de ICMS diferente da esperada: a nota traz ${pct(nota)}, o esperado para esta origem é ${pct(esperada.aliquota)}.`;
  if (nota === 4 && ORIGENS_FORA_DOS_4.has(origem)) {
    texto +=
      origem === '6' || origem === '7'
        ? ` A origem ${origem} é de importado sem similar nacional, que não entra nos 4%.`
        : ` A origem ${origem} é nacional: os 4% valem só para as origens 1, 2, 3 e 8.`;
  }
  return texto;
}
