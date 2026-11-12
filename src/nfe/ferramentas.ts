// Ferramentas do painel de conferência: ações sobre a nota aberta que a
// pessoa roda, vê a prévia do que mudaria e só então aplica. Há dois tipos:
// as de prévia simples (FERRAMENTAS, por enquanto nenhuma), que mostram a
// prévia no próprio painel, e as de janela própria (FerramentaJanela, como
// "ST, MVA e CFOP"), que o renderer passa ao painel. Sem ferramenta, a seção
// não aparece. Sem DOM e sem Electron.

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

/** Aviso de uma ferramenta, com um atalho opcional ("carregue a planilha de ST"). */
export interface AvisoFerramenta {
  texto: string;
  acao?: { rotulo: string; executar(): void };
}

/**
 * Ferramenta cuja prévia abre numa janela própria (a tabela não cabe no
 * painel). Rodar busca o que precisa e abre a janela; o Aplicar é de lá.
 * A lista vem de quem monta o painel, porque estas usam a tela e o app.
 */
export interface FerramentaJanela {
  id: string;
  titulo: string;
  descricao: string;
  aviso(): AvisoFerramenta | null;
  /** false: falta o necessário (o botão Rodar fica desabilitado). */
  podeRodar(): boolean;
  rodar(): Promise<void>;
}
