// Só para o test:janela: grava uma planilha de ST inventada (.xlsx, no
// leiaute do Portal ST) no caminho dado. O executar.cjs roda este arquivo
// com o Node do Electron e carrega a planilha pelo Carregar dos Documentos.
// Abas: Tintas; Pneus (o 4011.20.90 do t13 com duas linhas candidatas e
// outras três linhas citando 4011 para NCMs diferentes); Autopecas (7318).
// Uso: node planilhaST.mts <saida.xlsx>
import { writeFileSync } from 'node:fs';
import { xlsxAbas, type CelulaTeste } from '../fiscal/fixtures/xlsx.mts';

const saida = process.argv[2];
if (!saida) throw new Error('falta o caminho da planilha');

const topo = (anexo: string, seg: string): CelulaTeste[][] => [
  ['Versão: 0099'],
  ['Produção de efeitos a partir de 01/07/2023'],
  [`ANEXO ${anexo} – SEGMENTO: ${seg}`],
];
const cab = [
  'ITEM',
  'CEST',
  'NCM/SH',
  'Descrição',
  'MVA-ST Alíquota de 4%',
  'MVA-ST Alíquota de 7%',
  'MVA-ST Alíquota de 12%',
  'MVA-ST Alíquota de 19%',
];
const mvas = [0.62, 0.5694, 0.485, 0.35];

writeFileSync(
  saida,
  xlsxAbas([
    {
      nome: 'Tintas',
      linhas: [
        ...topo('XXIII', 'TINTAS E VERNIZES'),
        cab,
        [1, '24.001.00', '3208  3209', 'Tintas, vernizes', ...mvas],
      ],
    },
    {
      nome: 'Pneus',
      linhas: [
        ...topo('XVI', 'PNEUMÁTICOS'),
        cab,
        [1, '16.001.00', '4011', 'Pneus novos de borracha', ...mvas],
        [2, '16.002.00', '4011.10.00', 'Pneus de automóveis', ...mvas],
        [3, '16.003.00', '4011.20.90', 'Pneus de ônibus', ...mvas],
        [
          4,
          '16.004.00',
          '4011.40.00  4011.50.00',
          'Pneus de motos e bicicletas',
          ...mvas,
        ],
        [5, '16.005.00', '4011.40.00', 'Pneus de motos, outros', ...mvas],
      ],
    },
    {
      nome: 'Autopecas',
      linhas: [
        ...topo('II', 'AUTOPEÇAS'),
        cab,
        [1, '01.019.00', '7318', 'Parafusos, porcas, arruelas', ...mvas],
      ],
    },
  ]),
);
