// Conjunto único de ícones do app: desenho em grade de 24, traço e cantos
// arredondados (a espessura e o tamanho vêm do CSS, .icone). Os mesmos
// caminhos estão escritos à mão nos SVG do index.html; mudou aqui, muda lá.

export const ICONES = {
  /** Pasta (abrir arquivo, abrir outro XML). */
  pasta: [
    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
  /** Arquivo com a dobra no canto. */
  arquivo: [
    'M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M14 3v5h5',
  ],
  impressora: [
    'M7 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4',
    'M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2',
    'M7 14h10v5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z',
  ],
  /** Salvar e baixar: seta para a bandeja. */
  salvar: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  /** Enviar e atualizar: seta saindo da bandeja. */
  enviar: ['M12 15V4', 'M7 9l5-5 5 5', 'M5 20h14'],
  setaBaixo: ['M6 9l6 6 6-6'],
  setaCima: ['M6 15l6-6 6 6'],
  setaDireita: ['M9 6l6 6-6 6'],
  setaEsquerda: ['M15 6l-6 6 6 6'],
  fechar: ['M6 6l12 12', 'M18 6L6 18'],
  mais: ['M12 5v14', 'M5 12h14'],
  /** Abrir fora do app (pasta no Explorer, página, relatório). */
  externo: [
    'M14 4h6v6',
    'M20 4l-9 9',
    'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  ],
  desfazer: ['M4 12a8 8 0 1 0 3-6.2', 'M4 4v5h5'],
  /** Colunas da tabela (Editar colunas). */
  colunas: [
    'M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
    'M10 5v14',
    'M15 5v14',
  ],
} as const satisfies Record<string, readonly string[]>;
