// Ferramentas do painel de conferência: ações sobre a nota aberta que a
// pessoa roda, vê a prévia do que mudaria e só então aplica. Ainda não há
// nenhuma: enquanto FERRAMENTAS estiver vazia, a seção não aparece. Sem DOM
// e sem Electron.

import type { Anotacoes, Nota } from './tipos';

/** O que uma ferramenta enxerga da nota aberta. */
export interface ContextoFerramenta {
  nota: Nota;
  anotacoes: Anotacoes;
}

/** Resultado de Rodar: o que Aplicar faria. */
export interface PreviaFerramenta {
  /** Uma linha para a prévia ("3 itens com CFOP de entrada sugerido"). */
  resumo: string;
  /** Detalhes, um por linha, na prévia. */
  linhas: string[];
  /** false: nada a aplicar (o botão Aplicar fica desabilitado). */
  temMudancas: boolean;
}

export interface Ferramenta {
  id: string;
  titulo: string;
  descricao: string;
  /** Calcula a prévia sem mudar nada. */
  rodar(c: ContextoFerramenta): Promise<PreviaFerramenta>;
  /** Aplica o que a prévia mostrou (por exemplo, preenche anotações). */
  aplicar(c: ContextoFerramenta, previa: PreviaFerramenta): Promise<void>;
}

/** Ferramentas do painel, na ordem em que aparecem. */
export const FERRAMENTAS: readonly Ferramenta[] = [];
