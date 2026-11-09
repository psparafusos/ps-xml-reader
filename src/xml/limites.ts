// Limites do leitor genérico de XML (etapa 3 do plano da visualização
// protegida). Valores aprovados pelo Daniel em 06/11/2026: árvore até 20 MB,
// só texto até 100 MB, acima disso o arquivo não é lido (só o stat).
// Lógica pura, sem Electron e sem DOM.

const MB = 1024 * 1024;

/** Até este tamanho o arquivo é mostrado como árvore e como texto. */
export const LIMITE_ARVORE_BYTES = 20 * MB;

/** Até este tamanho o arquivo é mostrado só como texto; acima, recusado. */
export const LIMITE_TEXTO_BYTES = 100 * MB;

/** Níveis de aninhamento a partir dos quais a árvore deixa de ser montada. */
export const PROFUNDIDADE_MAXIMA = 1000;

/** Quanto do começo do arquivo é lido para achar a declaração encoding. */
export const BYTES_DECLARACAO = 1024;

/** Quanto do começo do arquivo é examinado para decidir se é binário. */
export const BYTES_AMOSTRA_BINARIO = 64 * 1024;

/** Fração de bytes inválidos (na amostra) que faz o arquivo ser binário. */
export const FRACAO_BINARIO = 0.1;

/**
 * Memória máxima do utilityProcess do leitor, vigiada pelo processo
 * principal (app.getAppMetrics); acima disso o filho é morto. O
 * --max-old-space-size no execArgv do fork é ignorado pelo Electron 44
 * (medido no protótipo), por isso a vigia fica do lado de fora.
 */
export const LIMITE_MEMORIA_FILHO_MB = 1024;

/** Máximo de achados devolvidos por uma busca. */
export const LIMITE_ACHADOS = 10000;

export const MENSAGEM_ARVORE_DESLIGADA =
  'Arquivo grande: a árvore fica desligada.';

export const MENSAGEM_PROFUNDIDADE =
  'O arquivo tem mais de 1.000 níveis; mostrando como texto.';

export const MENSAGEM_BINARIO =
  'Este arquivo não parece um XML (tem bytes de arquivo binário).';

export const MENSAGEM_VAZIO = 'O arquivo está vazio.';

export type ModoLeitor = 'arvore' | 'texto' | 'recusado';

export interface AvaliacaoTamanho {
  modo: ModoLeitor;
  /** Aviso para a pessoa; null quando o arquivo abre normalmente. */
  mensagem: string | null;
}

/** Megabytes inteiros, arredondados para cima (100,2 MB vira 101). */
const megas = (bytes: number) => Math.ceil(bytes / MB);

/**
 * O que fazer com um arquivo de `bytes` (do stat, antes de ler). Acima de
 * LIMITE_TEXTO_BYTES o conteúdo nunca deve ser lido.
 */
export function avaliarTamanho(bytes: number): AvaliacaoTamanho {
  if (bytes <= LIMITE_ARVORE_BYTES) return { modo: 'arvore', mensagem: null };
  if (bytes <= LIMITE_TEXTO_BYTES) {
    return { modo: 'texto', mensagem: MENSAGEM_ARVORE_DESLIGADA };
  }
  return {
    modo: 'recusado',
    mensagem: `Este arquivo tem ${megas(bytes)} MB, grande demais para o PS Reader.`,
  };
}
