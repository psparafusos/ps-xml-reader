// O que muda no DANFE da NF-e emitida em contingência (tpEmis diferente de 1),
// pelo MOC 7.0 (novembro de 2020):
//
// - Anexo II (Manual de Especificações Técnicas do DANFE e Código de Barras),
//   item 3.9, pp. 20 e 21: os dois campos de conteúdo variável abaixo da
//   chave de acesso. Normal, SVC-AN e SVC-RS (3.9.1): a consulta de
//   autenticidade e o protocolo de autorização de uso. FS-IA e FS-DA
//   (3.9.2): o código de barras adicional "Dados da NF-e" no Campo 1 e a
//   representação numérica dele no Campo 2, em nove blocos de quatro
//   dígitos (3.1.2, p. 9). EPEC (3.9.3): a consulta "no portal da NF-e" e o
//   protocolo de autorização do EPEC.
// - Anexo II, item 2, p. 6: um código de barras só no SCAN (Sistema de
//   Contingência do Ambiente Nacional, hoje desativado).
// - Anexo III (Manual de Contingência NF-e): a expressão no corpo do DANFE
//   do FS-DA (2.1.2, p. 8; o FS-IA, tpEmis 2, segue o mesmo procedimento,
//   nota 1 da p. 8) e do EPEC (2.1.4, p. 14); o motivo e a data e hora da
//   entrada em contingência impressos no DANFE (p. 8 no FS-DA; 2.1.3.5,
//   p. 11, na SVC; Visão Geral 3.3.4, p. 37, no EPEC).
//
// O MOC não diz em que quadro vão a expressão e a entrada em contingência:
// aqui ficam no começo das Informações Complementares, a expressão em
// negrito (o Anexo II, p. 8, pede "em destaque"). O protocolo do EPEC não vem
// no XML da NF-e: o Campo 2 do EPEC fica com o rótulo e em branco.
//
// Puro, sem DOM.

import type { DadosDanfe } from './dados';

/** Conteúdo dos campos 1 e 2 do cabeçalho (MOC Anexo II, 3.9). */
export type CamposVariaveis = 'autorizacao' | 'formulario' | 'epec';

/** Tipos de emissão da NF-e modelo 55 no leiaute 4.00 (o 9 é só da NFC-e). */
export const TIPOS_EMISSAO_NFE = ['1', '2', '3', '4', '5', '6', '7'] as const;

export function camposVariaveis(tpEmis: string): CamposVariaveis {
  if (tpEmis === '2' || tpEmis === '5') return 'formulario';
  if (tpEmis === '4') return 'epec';
  return 'autorizacao';
}

export const EXPRESSAO_FORMULARIO =
  'DANFE em Contingência - impresso em decorrência de problemas técnicos';
export const EXPRESSAO_EPEC =
  'DANFE impresso em contingência - EPEC regularmente recebida pela Receita Federal do Brasil';

/** Expressão obrigatória no corpo do DANFE, ou null. */
export function expressaoContingencia(tpEmis: string): string | null {
  if (tpEmis === '2' || tpEmis === '5') return EXPRESSAO_FORMULARIO;
  if (tpEmis === '4') return EXPRESSAO_EPEC;
  return null;
}

/** "2026-02-03T15:02:35-03:00" -> "03/02/2026 15:02:35" (hora do XML). */
function dataHora(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : bruto;
}

/**
 * Entrada em contingência (dhCont e xJust do XML) numa linha, ou '' na
 * emissão normal e quando o XML não traz nenhum dos dois.
 */
export function linhaEntradaContingencia(d: DadosDanfe): string {
  if (d.tpEmis === '1' || d.tpEmis === '') return '';
  const { dhCont, xJust } = d.contingencia;
  const partes: string[] = [];
  if (dhCont) partes.push(`Entrada em contingência: ${dataHora(dhCont)}`);
  if (xJust) partes.push(`Justificativa: ${xJust}`);
  return partes.join(' - ');
}

const UF_CODIGO: Record<string, string> = {
  RO: '11',
  AC: '12',
  AM: '13',
  RR: '14',
  PA: '15',
  AP: '16',
  TO: '17',
  MA: '21',
  PI: '22',
  CE: '23',
  RN: '24',
  PB: '25',
  PE: '26',
  AL: '27',
  SE: '28',
  BA: '29',
  MG: '31',
  ES: '32',
  RJ: '33',
  SP: '35',
  PR: '41',
  SC: '42',
  RS: '43',
  MS: '50',
  MT: '51',
  GO: '52',
  DF: '53',
};

/**
 * Dígito verificador módulo 11 da chave de acesso (MOC 7.0, Visão Geral,
 * 2.2.6.2, p. 19): pesos 2 a 9 da direita para a esquerda; resto 0 ou 1
 * dá 0.
 */
export function dvModulo11(digitos: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    soma += Number(digitos[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valor do XML ("1234.5") em centavos com 14 dígitos, ou null. */
function centavos(bruto: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(bruto)) return null;
  const [int, dec = ''] = bruto.split('.');
  const s = `${int}${dec.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  return s.length <= 14 ? s.padStart(14, '0') : null;
}

const positivo = (bruto: string) => bruto !== '' && Number(bruto) > 0;

/**
 * Os 36 dígitos do código de barras adicional "Dados da NF-e" (MOC 7.0,
 * Anexo II, 3.9.2, p. 21): cUF (2) do destinatário ou remetente, 99 no
 * exterior; tpEmis (1); CNPJ (14) do destinatário ou remetente, o CPF se
 * pessoa física, zeros no exterior; vNF (14) em centavos; ICMSp (1) e
 * ICMSs (1), 1 com destaque e 2 sem; DD (2), o dia da emissão; DV (1) como
 * o da chave de acesso. null se falta algum dado.
 */
export function dadosNfeContingencia(d: DadosDanfe): string | null {
  if (camposVariaveis(d.tpEmis) !== 'formulario') return null;
  const uf = d.dest.endereco.UF;
  const exterior = uf === 'EX';
  const cUF = exterior ? '99' : UF_CODIGO[uf];
  if (!cUF) return null;
  const doc = exterior ? '' : d.dest.CNPJ || d.dest.CPF;
  if (!exterior && !/^\d{11,14}$/.test(doc)) return null;
  const vNF = centavos(d.totais.vNF);
  if (!vNF) return null;
  const dia = /^\d{4}-\d{2}-(\d{2})/.exec(d.ide.dhEmi)?.[1];
  if (!dia) return null;
  const base =
    cUF +
    d.tpEmis +
    doc.padStart(14, '0') +
    vNF +
    (positivo(d.totais.vICMS) ? '1' : '2') +
    (positivo(d.totais.vST) ? '1' : '2') +
    dia;
  return base + String(dvModulo11(base));
}
