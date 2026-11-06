// Barreiras de segurança antes de ler um XML de NF-e ou uma cópia editada
// (.psxml). Lógica pura, sem Electron e sem DOM: a mesma função vale no
// processo principal (antes de ler e de mandar para a janela) e no renderer
// (antes do DOMParser).
//
// NF-e e .psxml nunca têm DTD. Um <!DOCTYPE> ou <!ENTITY> só serve para
// entidades, que podem apontar para arquivos do computador, para a rede ou
// crescer sem limite (bomba de entidades). Por isso o arquivo é recusado
// antes de qualquer parser, sem depender do que o Chromium faria com ele.

export const MENSAGEM_DOCTYPE =
  'Este arquivo tem uma declaração DOCTYPE, que NF-e não usa. Por segurança ele não foi aberto.';

/** Tamanho máximo de uma NF-e ou de um .psxml (uma nota real fica abaixo de 5 MB). */
export const LIMITE_NFE_BYTES = 50 * 1024 * 1024;

const RE_DECLARACAO = /<!(?:DOCTYPE|ENTITY)/i;

/** Arquivo recusado pelas barreiras: a mensagem é para a pessoa. */
export class ArquivoRecusadoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ArquivoRecusadoError';
  }
}

/**
 * Motivo para não ler o texto como XML, ou null se pode seguir. Recusa
 * <!DOCTYPE e <!ENTITY em qualquer lugar do texto, sem diferenciar
 * maiúsculas.
 */
export function verificarXmlSeguro(texto: string): string | null {
  return RE_DECLARACAO.test(texto) ? MENSAGEM_DOCTYPE : null;
}

/** Megabytes inteiros, arredondados para cima (50,2 MB vira 51). */
const megas = (bytes: number) => Math.ceil(bytes / (1024 * 1024));

/** Motivo para não ler um arquivo de `bytes` como NF-e, ou null. */
export function problemaTamanhoNfe(bytes: number): string | null {
  if (bytes <= LIMITE_NFE_BYTES) return null;
  return `Este arquivo tem ${megas(bytes)} MB, grande demais para uma NF-e (limite de ${megas(LIMITE_NFE_BYTES)} MB).`;
}
