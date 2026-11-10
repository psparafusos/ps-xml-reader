// Leitura protegida: a NF-e aberta só para ver, como o Word com um arquivo
// baixado. O XML original nunca muda em nenhum modo; na leitura protegida
// nem a cópia (.psxml) é gravada até a pessoa escolher editar.
//
// Lógica pura (sem DOM, sem Electron): o que abre em leitura, o que pode ser
// feito nela e os textos. O processo principal guarda o modo de cada janela
// e recusa gravar o .psxml numa janela protegida; a tela mostra a faixa,
// trava as anotações e pede o aviso antes de qualquer ação que edita.

import type { AbrirNotasEm } from './ferramentasPerfil';

/** Como a nota está aberta na janela. */
export type Leitura = 'protegida' | 'edicao';

/** Ações sobre a nota aberta que passam pela regra da leitura protegida. */
export type AcaoNota =
  // Só ver: valem na leitura protegida. Trocar de perfil só muda a
  // visualização (colunas, orientação), como as Configurações.
  | 'trocar-modo'
  | 'perfil'
  | 'zoom'
  | 'copiar'
  | 'ordenar'
  | 'imprimir'
  | 'salvar-pdf'
  // Editam: pedem o aviso para sair da leitura.
  | 'anotar'
  | 'editar-colunas'
  | 'salvar-psxml'
  | 'salvar-copia'
  | 'ferramenta'
  | 'usar-conferencia';

const SO_VER: ReadonlySet<AcaoNota> = new Set<AcaoNota>([
  'trocar-modo',
  'perfil',
  'zoom',
  'copiar',
  'ordenar',
  'imprimir',
  'salvar-pdf',
]);

/** O que decide como um arquivo abre. */
export interface Abertura {
  /** É uma cópia editada (.psxml), e não o XML original da NF-e. */
  copiaEditada: boolean;
  /** "Abrir notas em" do perfil ativo (vale para o XML da NF-e). */
  abrirEm: AbrirNotasEm;
  /** O arquivo tem a marca de baixado da internet (ZoneId 3 ou 4). */
  daInternet: boolean;
}

/**
 * Como o arquivo abre:
 * - XML da NF-e: como o perfil manda ("Abrir notas em"); o padrão é a
 *   leitura protegida;
 * - cópia editada (.psxml): em edição (é a cópia de trabalho), a não ser que
 *   tenha vindo da internet, como o Word faz com um arquivo baixado.
 */
export function leituraAoAbrir(a: Abertura): Leitura {
  if (a.copiaEditada) return a.daInternet ? 'protegida' : 'edicao';
  return a.abrirEm === 'conferencia' ? 'edicao' : 'protegida';
}

/**
 * true se o conteúdo do fluxo Zone.Identifier (a marca que o Windows e os
 * navegadores gravam no arquivo baixado) diz zona 3 (internet) ou 4 (sites
 * restritos). Zona 0 a 2 (computador, intranet, sites confiáveis) ou texto
 * sem ZoneId: false.
 */
export function zonaDaInternet(texto: string): boolean {
  const m = /^\s*ZoneId\s*=\s*(\d+)\s*$/im.exec(texto);
  return m !== null && (m[1] === '3' || m[1] === '4');
}

/** Aviso ao abrir uma cópia editada que veio da internet. */
export const MENSAGEM_PSXML_INTERNET =
  'Esta cópia editada (.psxml) veio da internet e abriu em leitura protegida. Para editar, use a Conferência pela faixa.';

/** true se `acao` precisa do aviso para sair da leitura protegida antes. */
export function pedeAviso(acao: AcaoNota, leitura: Leitura): boolean {
  return leitura === 'protegida' && !SO_VER.has(acao);
}

export const TEXTO_FAIXA = 'Leitura protegida: só visualização.';
export const ROTULO_USAR_CONFERENCIA = 'Usar a Conferência';

/** Aviso para sair da leitura protegida (dentro do app). */
export const AVISO_SAIR = {
  titulo: 'Sair da leitura protegida?',
  texto:
    'Você vai sair da leitura protegida e começar a editar. O XML original não muda; o que você fizer fica numa cópia (.psxml).',
  continuar: 'Continuar',
  ficar: 'Ficar na leitura',
} as const;

/** Recusa do processo principal ao gravar o .psxml numa janela protegida. */
export const MENSAGEM_RECUSA_GRAVAR =
  'Esta nota está em leitura protegida. Para salvar a cópia (.psxml), saia da leitura protegida.';
