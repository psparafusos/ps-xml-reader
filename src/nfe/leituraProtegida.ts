// Leitura protegida: a NF-e aberta só para ver, como o Word com um arquivo
// baixado. O XML original nunca muda em nenhum modo; na leitura protegida
// nem a cópia (.psxml) é gravada até a pessoa escolher editar.
//
// Lógica pura (sem DOM, sem Electron): o que abre em leitura, o que pode ser
// feito nela e os textos. O processo principal guarda o modo de cada janela
// e recusa gravar o .psxml numa janela protegida; a tela mostra a faixa,
// trava as anotações e pede o aviso antes de qualquer ação que edita.

/** Como a nota está aberta na janela. */
export type Leitura = 'protegida' | 'edicao';

/** Ações sobre a nota aberta que passam pela regra da leitura protegida. */
export type AcaoNota =
  // Só ver: valem na leitura protegida.
  | 'trocar-modo'
  | 'zoom'
  | 'copiar'
  | 'ordenar'
  | 'imprimir'
  | 'salvar-pdf'
  // Editam: pedem o aviso para sair da leitura.
  | 'anotar'
  | 'editar-colunas'
  | 'perfil'
  | 'salvar-psxml'
  | 'salvar-copia'
  | 'ferramenta'
  | 'usar-conferencia';

const SO_VER: ReadonlySet<AcaoNota> = new Set<AcaoNota>([
  'trocar-modo',
  'zoom',
  'copiar',
  'ordenar',
  'imprimir',
  'salvar-pdf',
]);

/**
 * Como a nota abre: cópia editada (.psxml) em edição (é a cópia de
 * trabalho); NF-e (o XML original) em leitura protegida.
 */
export function leituraAoAbrir(copiaEditada: boolean): Leitura {
  return copiaEditada ? 'edicao' : 'protegida';
}

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
