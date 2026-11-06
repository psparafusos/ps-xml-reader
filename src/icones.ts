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
  /** Pasta com seta (trocar a pasta de destino). */
  pastaTrocar: [
    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M9 13h6',
    'M12.5 10.5L15 13l-2.5 2.5',
  ],
  /** Pasta aberta (abrir a pasta no Explorer). */
  pastaAberta: [
    'M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1',
    'M5 19h12.5a1.5 1.5 0 0 0 1.4-1l2-5.6a1 1 0 0 0-.9-1.4H8.1a1.5 1.5 0 0 0-1.4 1z',
  ],
  // Estados dos documentos de referência (src/estadoDocumentos.ts): a forma
  // vem primeiro (círculo ou triângulo), a marca depois.
  /** Ok: check em círculo. */
  estadoOk: ['M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z', 'M8 12.5l2.7 2.7L16 9.8'],
  /** Aviso: triângulo com exclamação. */
  estadoAviso: [
    'M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z',
    'M12 9.5v4.5',
    'M12 17.2v.1',
  ],
  /** Faltando: x em círculo. */
  estadoFaltando: [
    'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z',
    'M9.2 9.2l5.6 5.6',
    'M14.8 9.2l-5.6 5.6',
  ],
  /** Opcional não carregado: círculo vazado. */
  estadoOpcional: ['M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z'],
  /**
   * Engrenagem (Configurações), no jeito da do Windows: oito dentes de topo
   * arredondado em volta de um corpo redondo, com o furo no meio.
   */
  engrenagem: [
    'M10.08 4.85L10.66 2.49A9.6 9.6 0 0 1 13.34 2.49L13.92 4.85A7.4 7.4 0 0 1 15.7 5.59L17.78 4.33A9.6 9.6 0 0 1 19.67 6.22L18.41 8.3A7.4 7.4 0 0 1 19.15 10.08L21.51 10.66A9.6 9.6 0 0 1 21.51 13.34L19.15 13.92A7.4 7.4 0 0 1 18.41 15.7L19.67 17.78A9.6 9.6 0 0 1 17.78 19.67L15.7 18.41A7.4 7.4 0 0 1 13.92 19.15L13.34 21.51A9.6 9.6 0 0 1 10.66 21.51L10.08 19.15A7.4 7.4 0 0 1 8.3 18.41L6.22 19.67A9.6 9.6 0 0 1 4.33 17.78L5.59 15.7A7.4 7.4 0 0 1 4.85 13.92L2.49 13.34A9.6 9.6 0 0 1 2.49 10.66L4.85 10.08A7.4 7.4 0 0 1 5.59 8.3L4.33 6.22A9.6 9.6 0 0 1 6.22 4.33L8.3 5.59A7.4 7.4 0 0 1 10.08 4.85z',
    'M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0z',
  ],
} as const satisfies Record<string, readonly string[]>;
