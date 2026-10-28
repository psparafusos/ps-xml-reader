// Nome dos arquivos salvos, a partir dos dados da nota (não do nome do arquivo
// aberto): <FORNECEDOR>_NF<número>, por exemplo CISER_NF2330596. O processo
// principal acrescenta _Conferencia.pdf, _Conferencia.psxml ou _DANFE.pdf.
// Sem DOM e sem Electron, para poder ser testado fora do app.

import type { Nota } from './tipos';

/** Tamanho máximo do FORNECEDOR no nome. */
const LIMITE_FORNECEDOR = 20;

/**
 * Palavras que não contam como significativas na razão social: forma
 * societária e porte (LTDA, S/A, SA, ME, EPP, EIRELI, CIA) e, por decisão
 * deste app, as preposições e o "E" de ligação e letras soltas ("P S
 * PARAFUSOS E SEGURANCA" vira PARAFUSOS-SEGURANCA).
 */
const IGNORADAS = new Set([
  'LTDA',
  'SA',
  'ME',
  'EPP',
  'EIRELI',
  'CIA',
  'DE',
  'DA',
  'DO',
  'DAS',
  'DOS',
  'E',
]);

/** Maiúsculas, sem acento, só letras e números, palavras em lista. */
function palavras(texto: string): string[] {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .split(/\s+/)
      // "S/A" e "H." viram "SA" e "H": a pontuação de dentro da palavra sai.
      .map((p) => p.replace(/[^A-Z0-9]/g, ''))
      .filter((p) => p !== '')
  );
}

/** Junta com hífen e corta em LIMITE_FORNECEDOR, sem hífen sobrando no fim. */
function juntar(lista: string[]): string {
  return lista.join('-').slice(0, LIMITE_FORNECEDOR).replace(/-+$/, '');
}

/**
 * FORNECEDOR: o nome fantasia (xFant) do emitente; sem ele, as duas
 * primeiras palavras significativas da razão social. Vazio se não sobrar nada.
 */
export function fornecedorNoNome(xFant: string, xNome: string): string {
  const fantasia = juntar(palavras(xFant));
  if (fantasia) return fantasia;
  const significativas = palavras(xNome).filter(
    (p) => !IGNORADAS.has(p) && !/^[A-Z]$/.test(p),
  );
  return juntar(significativas.slice(0, 2));
}

/**
 * Nome base dos arquivos salvos, ou null se a nota não tem fornecedor ou
 * número (aí vale o nome do arquivo aberto). Número sem zeros à esquerda;
 * série diferente de 1 vira -S<série> (NF2330596-S2).
 */
export function nomeBaseArquivo(n: Nota): string | null {
  const fornecedor = fornecedorNoNome(n.emitente.xFant, n.emitente.xNome);
  if (!/^\d+$/.test(n.ide.nNF) || !fornecedor) return null;
  const numero = n.ide.nNF.replace(/^0+(?=\d)/, '');
  const serie = /^\d+$/.test(n.ide.serie)
    ? n.ide.serie.replace(/^0+(?=\d)/, '')
    : '';
  const sufixoSerie = serie !== '' && serie !== '1' ? `-S${serie}` : '';
  return `${fornecedor}_NF${numero}${sufixoSerie}`;
}

/** Caracteres que o Windows não aceita em nome de arquivo. */
// oxlint-disable-next-line no-control-regex -- os caracteres de controle também são proibidos
const INVALIDOS_WINDOWS = /[<>:"/\\|?*\u0000-\u001F]/;
/** Nomes reservados do Windows (com ou sem extensão). */
const RESERVADOS_WINDOWS = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
export const LIMITE_NOME_ARQUIVO = 150;

/**
 * Problema com um nome de arquivo digitado (sem a pasta), ou null se o
 * Windows aceita. Usado no Salvar cópia.
 */
export function problemaNomeArquivo(nome: string): string | null {
  const n = nome.trim();
  if (!n) return 'Digite o nome da cópia.';
  const invalido = INVALIDOS_WINDOWS.exec(n);
  if (invalido)
    return invalido[0] < ' '
      ? 'O nome tem um caractere de controle, que o Windows não aceita.'
      : `O Windows não aceita o caractere ${invalido[0]} em nome de arquivo.`;
  if (/[. ]$/.test(n)) return 'O nome não pode terminar com ponto ou espaço.';
  if (RESERVADOS_WINDOWS.test(n))
    return `${n.split('.')[0]} é um nome reservado do Windows.`;
  if (n.length > LIMITE_NOME_ARQUIVO)
    return `O nome pode ter no máximo ${LIMITE_NOME_ARQUIVO} caracteres.`;
  return null;
}
