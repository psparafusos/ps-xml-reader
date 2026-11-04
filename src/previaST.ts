// Prévia da ferramenta "ST, MVA e CFOP" com os campos que o motor fiscal
// (src/fiscal/analise.ts) devolve: o rótulo da MVA e a troca entre MVA-ST 1
// e MVA-ST 2 (Autopeças), a alíquota interna da linha da planilha, as
// observações (protocolo com SE e pendências que só informam) e o motivo
// "segmento X lido com problemas". Fica por cima de resolverItem
// (src/fiscal/entrada.ts), sem mudar o motor. Lógica pura, sem DOM.

import type {
  AliquotaInternaItem,
  AnaliseItem,
  MvaJogo,
} from './fiscal/analise';
import {
  resolverItem,
  textoMva,
  type Decisao,
  type DecisaoLembrada,
  type Gravacao,
  type ItemResolvido,
} from './fiscal/entrada';

/** Decisão da prévia: a da ferramenta e, em Autopeças, o jogo de MVA escolhido. */
export type DecisaoST = Decisao & {
  /** Rótulo do jogo escolhido ("MVA-ST 2"); ausente ou null: o padrão do motor. */
  mvaJogo?: string | null;
};

/** Decisão lembrada com o jogo de MVA (o arquivo guarda o campo a mais). */
export type DecisaoLembradaST = DecisaoLembrada & { mvaJogo?: string | null };

export interface LinhaPrevia extends ItemResolvido {
  /** Rótulo do jogo de onde veio a MVA ("MVA-ST 1"). */
  mvaRotulo: string | null;
  /** Jogos para trocar na própria célula (Autopeças); vazio quando não há troca. */
  mvaOpcoes: MvaJogo[];
  /** Alíquota interna da linha em uso. */
  aliquotaInterna: AliquotaInternaItem | null;
  /** Texto da coluna "Alíq. interna": o da planilha, "confirmar" ou "-". */
  aliquotaTexto: string;
  /** Sem alíquota interna numa linha com ST: "confirmar" em destaque leve. */
  aliquotaConfirmar: boolean;
  /** Observações do motor e pendências que só informam. Nunca mudam o CFOP. */
  observacoes: string[];
  /** "segmento X lido com problemas", mostrado com a cor do "confirmar". */
  segmentoProblema: string | null;
}

/** Pendências do motor que só informam (não decidem ST, MVA nem CFOP). */
const RE_INFORMATIVA = [
  /^alíquota interna/,
  /^origem \S+ \(importado\)/,
  /^fornecedor tratou como ST/,
];
const RE_SEGMENTO = /^segmento .+ lido com problemas$/;
const RE_TIPI = /TIPI/;

export function previaItem(
  a: AnaliseItem,
  ufEmitente: string,
  decisao: DecisaoST,
  lembrado = false,
): LinhaPrevia {
  const r = resolverItem(a, ufEmitente, decisao, lembrado);
  let { mva, mvaTexto } = r;
  let mvaRotulo: string | null = null;
  let mvaOpcoes: MvaJogo[] = [];

  // A linha em uso é a única do motor: vale a MVA que ele escolheu (em
  // Autopeças, a MVA-ST 1), com a troca para a alternativa.
  const linhaDoMotor =
    r.candidato !== null &&
    a.candidatos.length === 1 &&
    a.candidatos[0].linhaPlanilha === r.candidato.linhaPlanilha &&
    a.candidatos[0].segmento === r.candidato.segmento;
  if (r.st === 'sim' && r.finalidade === 'revenda' && r.candidato) {
    if (linhaDoMotor && a.mva !== null && a.mvaRotulo) {
      mvaOpcoes = a.mvaAlternativa
        ? [{ rotulo: a.mvaRotulo, valor: a.mva }, a.mvaAlternativa]
        : [];
      const escolhida = mvaOpcoes.find((m) => m.rotulo === decisao.mvaJogo) ?? {
        rotulo: a.mvaRotulo,
        valor: a.mva,
      };
      mva = escolhida.valor;
      mvaRotulo = escolhida.rotulo;
      mvaTexto = mva === null ? 'confirmar' : textoMva(mva);
    } else if (r.mva !== null) {
      mvaRotulo = r.candidato.mvas[0]?.rotulo ?? null;
    }
  }

  const aliquotaInterna =
    r.st === 'sim' ? (r.candidato?.aliquotaInterna ?? null) : null;
  const aliquotaConfirmar =
    r.st === 'sim' &&
    (aliquotaInterna === null || aliquotaInterna.aliquota === null);

  const pendencias = a.pendencias.filter((p) => !RE_TIPI.test(p));
  const observacoes = [
    ...a.observacoes,
    ...pendencias.filter((p) => RE_INFORMATIVA.some((re) => re.test(p))),
  ];
  const segmentoProblema = pendencias.find((p) => RE_SEGMENTO.test(p)) ?? null;

  const mvaPendente =
    r.st === 'sim' && r.finalidade === 'revenda' && mva === null;
  return {
    ...r,
    mva,
    mvaTexto,
    mvaRotulo,
    mvaOpcoes,
    aliquotaInterna,
    aliquotaTexto:
      r.st !== 'sim'
        ? '-'
        : aliquotaInterna?.texto
          ? aliquotaInterna.texto
          : 'confirmar',
    aliquotaConfirmar,
    observacoes,
    segmentoProblema,
    precisaDeMim: r.st === 'confirmar' || r.cfop === null || mvaPendente,
  };
}

/**
 * Aplicar, parte da alíquota interna: o texto da planilha na coluna
 * escolhida, para os itens com CFOP definido e alíquota da linha. Célula que
 * já tem o mesmo texto fica de fora; as outras entram com o valor atual
 * (executarPlano pergunta antes de substituir).
 */
export function gravacoesAliquota(
  linhas: LinhaPrevia[],
  anotacoes: Map<string, Map<string, string>>,
  coluna: string,
): Gravacao[] {
  const r: Gravacao[] = [];
  for (const l of linhas) {
    const valor = l.aliquotaInterna?.texto.trim();
    if (l.cfop === null || l.st !== 'sim' || !valor) continue;
    const atual = anotacoes.get(coluna)?.get(l.nItem) ?? '';
    if (atual.trim() !== valor)
      r.push({ coluna, nItem: l.nItem, valor, atual });
  }
  return r;
}

/**
 * Base gravada antes de a importação ler as colunas de estados (protocolos):
 * nenhuma linha tem o campo. Pede reimportar a planilha.
 */
export function baseSemProtocolos(linhas: readonly object[]): boolean {
  return linhas.length > 0 && !linhas.some((l) => 'protocolos' in l);
}
