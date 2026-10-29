// Navegação por teclado nas caixas de anotação da tabela de itens.
//
// A tabela é vista como uma grade na ordem visual (a da tela, inclusive
// ordenada): cada linha tem tantas caixas quanto colunas de anotação visíveis.
//   Enter        mesma coluna, linha de baixo (Shift+Enter: linha de cima)
//   Tab          próxima coluna da mesma linha; na última, a primeira coluna
//                da linha de baixo (Shift+Tab: o inverso)
// Nos extremos da grade, Enter fica no campo e Tab segue o caminho normal do
// navegador (sai da tabela), para não prender o foco.

export type TeclaAnotacao = 'enter' | 'shift-enter' | 'tab' | 'shift-tab';

export type Destino =
  | { linha: number; coluna: number }
  /** Fica onde está (Enter na última linha, Shift+Enter na primeira). */
  | 'ficar'
  /** Deixa o navegador agir (Tab na última caixa, Shift+Tab na primeira). */
  | 'sair';

/**
 * Para onde vai o foco. `colunasPorLinha[i]` é o número de caixas da linha i.
 * `linha` e `coluna` são a posição atual (a partir de zero).
 */
export function destinoAnotacao(
  colunasPorLinha: number[],
  linha: number,
  coluna: number,
  tecla: TeclaAnotacao,
): Destino {
  const ultima = colunasPorLinha.length - 1;
  switch (tecla) {
    case 'enter':
    case 'shift-enter': {
      const alvo = linha + (tecla === 'enter' ? 1 : -1);
      if (alvo < 0 || alvo > ultima) return 'ficar';
      // Todas as linhas têm as mesmas colunas; por segurança, limita.
      const ultimaColuna = colunasPorLinha[alvo] - 1;
      if (ultimaColuna < 0) return 'ficar';
      return { linha: alvo, coluna: Math.min(coluna, ultimaColuna) };
    }
    case 'tab': {
      if (coluna < colunasPorLinha[linha] - 1)
        return { linha, coluna: coluna + 1 };
      for (let l = linha + 1; l <= ultima; l++)
        if (colunasPorLinha[l] > 0) return { linha: l, coluna: 0 };
      return 'sair';
    }
    case 'shift-tab': {
      if (coluna > 0) return { linha, coluna: coluna - 1 };
      for (let l = linha - 1; l >= 0; l--)
        if (colunasPorLinha[l] > 0)
          return { linha: l, coluna: colunasPorLinha[l] - 1 };
      return 'sair';
    }
  }
}
