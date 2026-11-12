// Textos da tela do leitor genérico de XML: tamanho, codificação, avisos e
// contador da busca, em palavras simples. Puro, sem DOM.

import type { CodificacaoLida } from '../xml/preparar';
import type { ErroXml } from '../xml/leitor';
import { LIMITE_ARVORE_BYTES, LIMITE_TEXTO_BYTES } from '../xml/limites';

const numero = new Intl.NumberFormat('pt-BR');
const umaCasa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Número com separador de milhar: 12.345. */
export const formatarNumero = (n: number): string => numero.format(n);

/** 512 bytes, 12,3 KB, 1,2 MB. */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  if (bytes < 1024 * 1024) return `${umaCasa.format(bytes / 1024)} KB`;
  return `${umaCasa.format(bytes / (1024 * 1024))} MB`;
}

const NOMES: Record<CodificacaoLida['codificacao'], string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'iso-8859-1': 'ISO-8859-1',
  'windows-1252': 'Windows-1252',
  'us-ascii': 'ASCII',
};

/** "UTF-8 (declarada no arquivo)", "UTF-16 LE (pela marca BOM)"... */
export function descreverCodificacao(c: CodificacaoLida): string {
  const nome = NOMES[c.codificacao];
  switch (c.origem) {
    case 'bom':
      return `${nome} (pela marca BOM no começo do arquivo)`;
    case 'inicio':
      return `${nome} (pelo começo do arquivo)`;
    case 'declaracao':
      return `${nome} (declarada no arquivo)`;
    case 'padrao':
      return `${nome} (o arquivo não declara; é o padrão do XML)`;
    case 'reserva':
      return `${nome} (a codificação declarada não confere)`;
  }
}

const MB = 1024 * 1024;

/** Aviso do modo leve (20 a 100 MB), ou null. */
export function avisoModoLeve(bytes: number): string | null {
  if (bytes <= LIMITE_ARVORE_BYTES || bytes > LIMITE_TEXTO_BYTES) return null;
  return `Modo leve: o arquivo tem ${formatarTamanho(bytes)}, mais de ${LIMITE_ARVORE_BYTES / MB} MB. Só a vista Texto funciona; a Árvore fica desligada.`;
}

/** Complemento da recusa acima de 100 MB. */
export const DICA_GRANDE = `O PS Reader abre arquivos de até ${LIMITE_TEXTO_BYTES / MB} MB. Para ver este, use o Bloco de Notas.`;

export const AVISO_PROFUNDIDADE =
  'O XML tem mais de 1.000 níveis, um dentro do outro. A Árvore fica desligada; o texto aparece completo.';

export const AVISO_DOCTYPE =
  'Este XML tem uma declaração DOCTYPE. Ela aparece como texto e não é processada: nada de fora é carregado.';

/** Aviso dos caracteres de controle, ou null. */
export function avisoControles(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? 'O arquivo tem 1 caractere de controle que não vale no XML; ele aparece como [U+....].'
    : `O arquivo tem ${formatarNumero(n)} caracteres de controle que não valem no XML; eles aparecem como [U+....].`;
}

/**
 * "O XML tem um erro na linha 3, coluna 5 do arquivo: motivo". Linha e coluna
 * são as do arquivo como está gravado (as mesmas do Bloco de Notas), não as
 * da vista Texto, que é indentada.
 */
export function mensagemErroXml(erro: ErroXml): string {
  return `O XML tem um erro na linha ${formatarNumero(erro.linha)}, coluna ${formatarNumero(erro.coluna)} do arquivo: ${erro.motivo}`;
}

export const COMPLEMENTO_ERRO_ARVORE =
  'A Árvore mostra o que foi lido até o erro.';

/** Contador da busca: "2 de 5", "Nada encontrado", "1 de mais de 10.000". */
export function textoContador(
  atual: number,
  total: number,
  truncado: boolean,
): string {
  if (total === 0) return 'Nada encontrado';
  const de = truncado
    ? `mais de ${formatarNumero(total)}`
    : formatarNumero(total);
  return `${formatarNumero(atual + 1)} de ${de}`;
}

/** "3.456 linhas" */
export function textoLinhas(n: number): string {
  return n === 1 ? '1 linha' : `${formatarNumero(n)} linhas`;
}
