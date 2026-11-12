// Só para o test:janela: grava uma planilha de ST inventada (.xlsx, no
// leiaute do Portal ST) no caminho dado. O executar.cjs roda este arquivo
// com o Node do Electron e carrega a planilha pelo Carregar dos Documentos.
// Uso: node planilhaST.mts <saida.xlsx>
import { writeFileSync } from 'node:fs';
import { xlsx } from '../fiscal/fixtures/xlsx.mts';

const saida = process.argv[2];
if (!saida) throw new Error('falta o caminho da planilha');

writeFileSync(
  saida,
  xlsx('Tintas', [
    ['Versão: 0099'],
    ['Produção de efeitos a partir de 01/07/2023'],
    ['ANEXO XXIII – SEGMENTO: TINTAS E VERNIZES'],
    [
      'ITEM',
      'CEST',
      'NCM/SH',
      'Descrição',
      'MVA-ST Alíquota de 4%',
      'MVA-ST Alíquota de 7%',
      'MVA-ST Alíquota de 12%',
      'MVA-ST Alíquota de 19%',
    ],
    [
      1,
      '24.001.00',
      '3208  3209',
      'Tintas, vernizes',
      0.62,
      0.5694,
      0.485,
      0.35,
    ],
  ]),
);
