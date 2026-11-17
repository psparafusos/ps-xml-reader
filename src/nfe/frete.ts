// Linha do frete no painel da Conferência: como a nota entra no Saef pela
// modalidade do frete (transp/modFrete), o valor do frete da nota
// (ICMSTot/vFrete) e a transportadora. Só informa: a pessoa decide.
//
// Regra da loja: o conhecimento de frete (CT-e) tem um tomador, quem paga.
// Tomador fornecedor: o conhecimento não se lança e a nota entra como
// Emitente CIF. Tomador PS Parafusos: a nota entra como Destinatário FOB e o
// valor do conhecimento é digitado. Lógica pura, sem DOM e sem Electron.

import { centavos, reais } from './avisos';
import * as f from './formato';
import type { Nota } from './tipos';

export interface LinhaFrete {
  /** info: só informa; leve: aviso (conta como ponto para olhar). */
  nivel: 'info' | 'leve';
  titulo: string;
  detalhe: string;
}

/** Significado de cada modFrete, para o detalhe. */
const MODALIDADE: Record<string, string> = {
  '0': 'por conta do remetente (CIF)',
  '1': 'por conta do destinatário (FOB)',
  '2': 'por conta de terceiros',
  '3': 'transporte próprio do remetente',
  '4': 'transporte próprio do destinatário',
  '9': 'sem frete',
};

/** Título das modalidades sem regra da loja (só o significado do código). */
const TITULO_SEM_REGRA: Record<string, string> = {
  '2': 'Frete por conta de terceiros (modalidade 2)',
  '3': 'Transporte próprio do remetente (modalidade 3)',
  '4': 'Transporte próprio do destinatário (modalidade 4)',
  '9': 'Sem frete (modalidade 9)',
};

/** Palavras das informações complementares que combinam com cada modFrete. */
const COMBINA: Record<'CIF' | 'FOB', readonly string[]> = {
  CIF: ['0', '3'],
  FOB: ['1', '4'],
};

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

/**
 * CIF e FOB (palavras inteiras, sem diferenciar maiúsculas) escritos nas
 * informações complementares que não combinam com o modFrete. Vazio quando
 * o texto não fala disso ou também traz a palavra que combina.
 */
export function freteContraditoNoTexto(
  modFrete: string,
  infCpl: string,
): ('CIF' | 'FOB')[] {
  const t = semAcento(infCpl);
  const ditas = (['CIF', 'FOB'] as const).filter((p) =>
    new RegExp(`(?<![\\p{L}\\d])${p}(?![\\p{L}\\d])`, 'u').test(t),
  );
  if (ditas.some((p) => COMBINA[p].includes(modFrete))) return [];
  return ditas;
}

/** "Transportadora na nota: NOME (CNPJ 00.000.000/0000-00)." ou vazio. */
function textoTransportadora(n: Nota): string {
  const t = n.transporte;
  const doc = t.transportadoraCNPJ
    ? `CNPJ ${f.cnpj(t.transportadoraCNPJ)}`
    : t.transportadoraCPF
      ? `CPF ${f.cpf(t.transportadoraCPF)}`
      : '';
  const nome = t.transportadoraNome.trim();
  if (!nome && !doc) return 'A nota não traz transportadora.';
  if (!nome) return `Transportadora na nota: sem nome (${doc}).`;
  return `Transportadora na nota: ${nome}${doc ? ` (${doc})` : ''}.`;
}

/**
 * A linha do frete, ou null quando a nota não traz a modalidade do frete.
 * modFrete 0 sem valor de frete: informação. modFrete 1, e modFrete 0 com
 * valor de frete: aviso. Outras modalidades: informação com o significado.
 */
export function linhaFrete(n: Nota): LinhaFrete | null {
  const mod = n.transporte.modFrete.trim();
  if (!mod) return null;
  const frete = centavos(n.totais.vFrete);
  const nome = n.transporte.transportadoraNome.trim();
  const significado = MODALIDADE[mod];
  const modalidade = significado
    ? `Modalidade do frete na nota: ${mod}, ${significado}.`
    : `Modalidade do frete na nota: ${mod}, fora da tabela da NF-e.`;
  const valorFrete =
    frete > 0
      ? `Valor do frete na nota: ${reais(frete)}.`
      : 'A nota não traz valor de frete.';
  const transportadora = textoTransportadora(n);

  let nivel: LinhaFrete['nivel'];
  let titulo: string;
  let saef = '';
  if (mod === '0' && frete === 0) {
    nivel = 'info';
    titulo =
      'Frete do fornecedor (CIF). Se veio conhecimento em nome do fornecedor, ele não se lança.';
    saef =
      'No Saef, a nota entra como Emitente CIF, sem valor de conhecimento.';
  } else if (mod === '0') {
    nivel = 'leve';
    titulo = `A nota diz frete do remetente, mas traz frete de ${reais(frete)}: lançar como Destinatário FOB, sem digitar valor de conhecimento (o frete vem da nota).`;
  } else if (mod === '1') {
    nivel = 'leve';
    titulo = `Frete por conta da loja (FOB): lançar com o valor do conhecimento da transportadora${nome ? ` ${nome}` : ''}. Se o conhecimento não veio, pedir a segunda via.`;
    saef =
      'No Saef, a nota entra como Destinatário FOB, com o valor do conhecimento digitado.';
  } else {
    nivel = 'info';
    titulo =
      TITULO_SEM_REGRA[mod] ??
      `Modalidade de frete ${mod}, fora da tabela da NF-e`;
  }

  const contradito = freteContraditoNoTexto(mod, n.infAdic.infCpl);
  if (contradito.length > 0) {
    const ditas = contradito.join(' e ');
    // O título pode terminar sem ponto (modalidades sem regra).
    titulo = `${titulo.replace(/\.?$/, '.')} As informações complementares dizem ${ditas}.`;
  }

  return {
    nivel,
    titulo,
    detalhe: [modalidade, valorFrete, transportadora, saef]
      .filter(Boolean)
      .join(' '),
  };
}
