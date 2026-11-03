import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  consultarTipi,
  digitosPlanilha,
  lerTipi,
  lerTipiPlanilha,
  type TabelaTipi,
} from '../../src/fiscal/tipi.ts';
import { lerXlsx } from '../../src/fiscal/xlsx.ts';
import { xlsx, type CelulaTeste } from './fixtures/xlsx.mts';

// Trecho do texto extraído do PDF da TIPI 2022 (capítulos 32, 60, 73, 87 e
// 95), com quebras de página, notas e uma tabela de Nota Complementar.
const trecho = readFileSync(
  new URL('./fixtures/tipi-trecho.txt', import.meta.url),
  'utf8',
);
const tabelaTexto = lerTipi(trecho);

// Os mesmos códigos no leiaute do tipi.xlsx (NCM, EX, DESCRIÇÃO, ALÍQUOTA),
// com o que a planilha oficial faz: código que perde o zero ("3208.1" é
// 3208.10, "103.9" é 0103.9), quebra de linha dentro da célula, alíquota
// com ruído de ponto flutuante e linhas de exceção (Ex) logo abaixo do NCM.
const NT = 'NT';
const linhasPlanilha: CelulaTeste[][] = [
  [],
  [
    '\r\nTABELA DE INCIDÊNCIA DO IMPOSTO SOBRE PRODUTOS INDUSTRIALIZADOS (TIPI)\r\n\r\n2 0 2 2\r\n(Aprovada pelo Decreto nº 11.158, de 29 de julho de 2022)',
  ],
  [
    'Atualizações:\r\nDecreto nº 11.182, de 24 de agosto de 2022\r\nAto Declaratório Executivo RFB nº 9, de 20 de dezembro de 2024\r\n\r\n',
  ],
  ['NCM ', 'EX', 'DESCRIÇÃO ', 'ALÍQUOTA (%)'],
  ['01.01', null, 'Cavalos, asininos e muares, vivos.'],
  ['0101.2', null, '- Cavalos:'],
  ['0101.21.00', null, '-- Reprodutores de raça pura ', NT],
  ['01.03', null, 'Animais vivos da espécie suína.'],
  ['103.9', null, '- Outros:'],
  ['0103.91.00', null, '-- De peso inferior a 50 kg ', NT],
  ['3.03', null, 'Peixes congelados.'],
  ['0303.11.00', null, '-- Salmões-vermelhos ', 0],
  ['1101', null, 'Farinhas de trigo ou de mistura de trigo com centeio.'],
  ['1101.00.10', null, 'Farinha de trigo ', 0],
  [
    '32.08',
    null,
    'Tintas e vernizes, à base de polímeros sintéticos ou de polímeros naturais modificados, dispersos ou dissolvidos em meio não aquoso; soluções definidas na Nota 4 do presente Capítulo.',
  ],
  ['3208.1', null, '- À base de poliésteres'],
  ['3208.10.10', null, 'Tintas ', 3.25],
  ['3208.10.20', null, 'Vernizes ', 3.25],
  [
    '3208.10.30',
    null,
    'Soluções definidas na Nota 4 do presente Capítulo ',
    3.25,
  ],
  ['3208.2', null, '- À base de polímeros acrílicos ou vinílicos'],
  ['3208.20.1', null, 'Tintas'],
  [
    '3208.20.11',
    null,
    'À base de polímeros acrílicos, apresentadas em sortidos definidos na Nota 3 da Seção VI, do tipo\r\nutilizado para a fabricação de circuitos impressos ',
    3.25,
  ],
  ['3208.9', null, '- Outros'],
  ['3208.90.2', null, 'Vernizes'],
  ['3208.90.21', null, 'À base de derivados de celulose ', 3.25],
  ['60.06', null, 'Outros tecidos de malha.'],
  ['6006.10.00', null, '- De lã ou de pelos finos ', 0],
  ['6006.32', null, '-- Tintos'],
  ['6006.32.20', null, 'De poliésteres ', 0],
  ['6006.90.00', null, '- Outros ', 0],
  ['73.18', null, 'Parafusos, pinos ou pernos, roscados, porcas.'],
  ['7318.1', null, '- Artigos roscados:'],
  [
    '7318.15.00',
    null,
    '-- Outros parafusos e pinos ou pernos, mesmo com as porcas e arruelas (anilhas) ',
    6.5,
  ],
  ['7318.15.00', 1, 'Parafusos de ferro fundido', 0],
  [
    '87.03',
    null,
    'Automóveis de passageiros e outros veículos automóveis principalmente concebidos para transporte de pessoas.',
  ],
  [
    '8703.40.00',
    null,
    '- Outros veículos, equipados para propulsão, simultaneamente, com motor de pistão ',
    18.810000000000002,
  ],
  [
    '8703.60.00',
    null,
    '- Outros veículos, suscetíveis de serem carregados por conexão a uma fonte externa ',
    18.81,
  ],
  ['94.03', null, 'Outros móveis e suas partes.'],
  ['9403.20.00', null, '- Outros móveis de metal '],
  ['9403.20.10', null, 'Do tipo utilizado em cozinhas', 3.25],
  [
    '9503.00',
    null,
    'Triciclos, patinetes, carros de pedais e outros brinquedos semelhantes de rodas.',
  ],
  [
    '9503.00.40',
    null,
    'Trens elétricos, incluindo os trilhos, sinais e outros acessórios ',
    6.5,
  ],
  [
    '9503.00.50',
    null,
    'Modelos reduzidos, mesmo animados, em conjuntos para montagem, exceto os do item 9503.00.40',
    6.5,
  ],
  [null, 1, 'Para ciclomotores', 5],
];
const tabelaPlanilha = lerTipiPlanilha(
  lerXlsx(xlsx('Tabela Completa', linhasPlanilha)),
);

const fontes: [string, TabelaTipi][] = [
  ['texto do PDF', tabelaTexto],
  ['planilha', tabelaPlanilha],
];

for (const [fonte, tabela] of fontes)
  describe(`tipi: leitura (${fonte})`, () => {
    it('3208.10.20 = Vernizes, IPI 3,25', () => {
      const r = consultarTipi(tabela, '3208.10.20');
      assert.equal(r.existe, true);
      assert.equal(r.descricao, 'Vernizes');
      assert.equal(r.aliquotaIpi, 3.25);
    });

    it('a descrição completa traz a posição e a subposição', () => {
      const r = consultarTipi(tabela, '32081020');
      assert.match(
        r.descricaoCompleta ?? '',
        /^Tintas e vernizes, à base de polímeros sintéticos .* > À base de poliésteres > Vernizes$/,
      );
    });

    it('aceita o NCM com ou sem pontos', () => {
      assert.deepEqual(
        consultarTipi(tabela, '7318.15.00'),
        consultarTipi(tabela, '73181500'),
      );
    });

    it('NCM que não está na tabela não existe', () => {
      const r = consultarTipi(tabela, '3208.10.99');
      assert.equal(r.existe, false);
      assert.equal(r.aliquotaIpi, null);
    });

    it('descrição que atravessa a quebra de página e alíquota numa linha só', () => {
      const r = consultarTipi(tabela, '3208.20.11');
      assert.equal(r.aliquotaIpi, 3.25);
      assert.match(
        r.descricao ?? '',
        /Nota 3 da Seção VI, do tipo utilizado para a fabricação de circuitos impressos$/,
      );
    });

    it('o cabeçalho de página no meio da subposição não quebra a hierarquia', () => {
      const r = tabela.porNcm.get('32089021');
      assert.deepEqual(
        r?.hierarquia.map((h) => h.codigo),
        ['32.08', '3208.90', '3208.90.2'],
      );
    });

    it('parafuso 7318.15.00 tem IPI 6,5', () => {
      const r = consultarTipi(tabela, '73181500');
      assert.equal(r.aliquotaIpi, 6.5);
      assert.match(r.descricao ?? '', /^Outros parafusos e pinos ou pernos/);
    });

    it('NT vira "NT"', () => {
      const t =
        tabela === tabelaPlanilha
          ? tabela
          : lerTipi(
              'Capítulo 1\r\n(%)\r\n01.01 Cavalos, asininos e muares, vivos.\r\n0101.21.00 -- Reprodutores de raça pura NT\r\n',
            );
      assert.equal(consultarTipi(t, '0101.21.00').aliquotaIpi, 'NT');
    });

    it('código citado dentro de uma descrição quebrada não vira NCM novo', () => {
      const r = consultarTipi(tabela, '9503.00.50');
      assert.equal(r.aliquotaIpi, 6.5);
      assert.match(r.descricao ?? '', /exceto os do item 9503\.00\.40$/);
      assert.equal(
        consultarTipi(tabela, '9503.00.40').descricao,
        'Trens elétricos, incluindo os trilhos, sinais e outros acessórios',
      );
    });

    it('alíquota e traço colados pelo PDF ("6006.90.00- Outros0")', () => {
      assert.equal(consultarTipi(tabela, '6006.32.20').aliquotaIpi, 0);
      assert.equal(
        consultarTipi(tabela, '6006.32.20').descricao,
        'De poliésteres',
      );
      assert.equal(consultarTipi(tabela, '6006.90.00').descricao, 'Outros');
    });

    it('tabela de Nota Complementar não sobrescreve a alíquota da listagem', () => {
      assert.equal(consultarTipi(tabela, '8703.40.00').aliquotaIpi, 18.81);
      assert.equal(consultarTipi(tabela, '8703.60.00').aliquotaIpi, 18.81);
    });

    it('nota que começa com código ("60.06 e outras.") fica nas notas', () => {
      assert.equal(tabela.porNcm.get('60061000')?.aliquotaIpi, 0);
      assert.equal(
        tabela.porNcm.get('60061000')?.hierarquia[0].descricao,
        'Outros tecidos de malha.',
      );
    });
  });

describe('tipi: relatório (texto do PDF)', () => {
  const tabela = tabelaTexto;
  it('conta os NCMs e não deixa nenhum sem alíquota', () => {
    assert.equal(tabela.relatorio.totalNcm, tabela.porNcm.size);
    // 58 linhas com código de 8 dígitos no trecho, menos 3 citações: as duas
    // da tabela da NC (87-6) e o "9503.00.40" dentro da descrição de 9503.00.50.
    assert.equal(tabela.porNcm.size, 55);
    assert.deepEqual(tabela.relatorio.semAliquota, []);
  });

  it('agrupa as linhas ignoradas por motivo, com exemplos', () => {
    const motivos = new Map(
      tabela.relatorio.ignoradas.map((g) => [g.motivo, g]),
    );
    assert.ok(motivos.get('cabeçalho ou rodapé de página')!.total > 0);
    const notas = motivos.get('título e notas de capítulo ou seção')!;
    assert.ok(notas.total > notas.exemplos.length);
    assert.equal(notas.exemplos.length, 8);
    assert.deepEqual(notas.exemplos[0], { linha: 1, texto: 'Capítulo 32' });
  });
});

describe('tipi: planilha (tipi.xlsx)', () => {
  const t = tabelaPlanilha;

  it('repõe os zeros que o código perdeu', () => {
    assert.equal(digitosPlanilha('103.9'), '01039');
    assert.equal(digitosPlanilha('3.03'), '0303');
    assert.equal(digitosPlanilha('02.1'), '0210');
    assert.equal(digitosPlanilha('302.42'), '030242');
    assert.equal(digitosPlanilha('1101'), '110100');
    assert.equal(digitosPlanilha(1101), '110100');
    assert.equal(digitosPlanilha('3208.10.20'), '32081020');
    assert.equal(digitosPlanilha('Ex 01'), null);
    assert.deepEqual(
      t.porNcm.get('01039100')?.hierarquia.map((h) => h.codigo),
      ['01.03', '0103.9'],
    );
    assert.equal(t.porNcm.get('03031100')?.hierarquia[0].codigo, '03.03');
    assert.equal(t.porNcm.get('11010010')?.hierarquia[0].codigo, '1101.00');
  });

  it('"0101.2" com filhos 0101.21 fica com 5 dígitos', () => {
    assert.deepEqual(
      t.porNcm.get('01012100')?.hierarquia.map((h) => h.codigo),
      ['01.01', '0101.2'],
    );
  });

  it('"9403.20.00" sem alíquota e com filhos é a subposição 9403.20', () => {
    assert.equal(t.porNcm.has('94032000'), false);
    assert.deepEqual(
      t.porNcm.get('94032010')?.hierarquia.map((h) => h.codigo),
      ['94.03', '9403.20'],
    );
  });

  it('a exceção (Ex) não sobrescreve a alíquota do NCM', () => {
    assert.equal(consultarTipi(t, '7318.15.00').aliquotaIpi, 6.5);
    const ex = t.relatorio.ignoradas.find(
      (g) => g.motivo === 'exceção tarifária (Ex)',
    );
    assert.equal(ex?.total, 2);
    assert.equal(ex?.exemplos[0].celula, 'B34');
  });

  it('lê o ano e a última atualização da capa', () => {
    assert.equal(t.relatorio.versao, '2022');
    assert.equal(
      t.relatorio.atualizacao,
      'Ato Declaratório Executivo RFB nº 9, de 20 de dezembro de 2024',
    );
    assert.deepEqual(t.relatorio.semAliquota, []);
  });

  it('planilha sem o cabeçalho da TIPI lança erro', () => {
    assert.throws(
      () =>
        lerTipiPlanilha(
          lerXlsx(
            xlsx('Plan1', [
              ['ITEM', 'CEST', 'NCM/SH'],
              [1, '01.001.00', '3208'],
            ]),
          ),
        ),
      /cabeçalho da TIPI/,
    );
  });

  // Com os arquivos oficiais em samples\fiscal (fora do git): a planilha e
  // o texto do PDF têm de dar os mesmos NCMs.
  const xlsxOficial = new URL(
    '../../samples/fiscal/tipi.xlsx',
    import.meta.url,
  );
  const txtOficial = new URL(
    '../../samples/fiscal/tipi.pdf.txt',
    import.meta.url,
  );
  it(
    'tipi.xlsx oficial e texto do PDF dão os mesmos NCMs',
    { skip: !existsSync(xlsxOficial) || !existsSync(txtOficial) },
    () => {
      const x = lerTipiPlanilha(
        lerXlsx(new Uint8Array(readFileSync(xlsxOficial))),
      );
      const p = lerTipi(readFileSync(txtOficial, 'utf8'));
      assert.deepEqual(
        [...x.porNcm.keys()].sort(),
        [...p.porNcm.keys()].sort(),
      );
      assert.deepEqual(x.relatorio.semAliquota, []);
      assert.equal(consultarTipi(x, '3208.10.20').aliquotaIpi, 3.25);
      assert.equal(consultarTipi(x, '7318.15.00').aliquotaIpi, 6.5);
    },
  );
});
