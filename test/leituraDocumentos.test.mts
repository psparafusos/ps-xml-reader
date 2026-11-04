import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InfoDocumento } from '../src/fiscal/documentos.ts';
import type { RelatorioST } from '../src/fiscal/st.ts';
import type { RelatorioTipi } from '../src/fiscal/tipi.ts';
import { lerXlsx } from '../src/fiscal/xlsx.ts';
import {
  leituraST,
  leituraTipi,
  lerLeitura,
  mensagemArquivoErrado,
  problemasPorAba,
  reconhecerArquivo,
  rotuloDocumento,
  seloDocumento,
  semaforoDocumento,
  type LeituraDocumento,
} from '../src/leituraDocumentos.ts';
import { xlsx } from './fiscal/fixtures/xlsx.mts';

const aba = (nome: string, p: Partial<RelatorioST['abas'][number]> = {}) => ({
  aba: nome,
  linhaCabecalho: 4,
  linhasProduto: 10,
  linhasNcm: 10,
  linhasSemNcm: 0,
  notas: [] as string[],
  ...p,
});

// Relatório inventado no formato do leitor da planilha de ST.
const relatorioST: RelatorioST = {
  versao: '0019',
  vigencia: '01/07/2023',
  abas: [
    aba('Tintas'),
    aba('Água mineral', {
      linhasNcm: 0,
      notas: [
        'aba sem colunas de MVA',
        'aba sem coluna NCM: 202 linhas de produto ficam fora da busca por NCM',
      ],
    }),
    aba('Bebidas frias', { notas: ['aba sem colunas de MVA'] }),
    aba('Ferramentas', { linhaCabecalho: 0, linhasProduto: 0, linhasNcm: 0 }),
  ],
  problemas: [
    { aba: 'Autopecas', celula: 'D138', valor: '', motivo: 'NCM vazio' },
    {
      aba: 'Bebidas frias',
      celula: 'B157',
      valor: '10.12 | Combo',
      motivo: 'linha sem CEST',
    },
    {
      aba: 'Tintas',
      celula: 'K7',
      valor: '69.7',
      motivo: 'MVA 69.7 lida como percentual (69.7% = 0.697)',
    },
    {
      aba: 'Tintas',
      celula: 'F9',
      valor: 'abc',
      motivo: 'MVA não é número nem percentual',
    },
    {
      aba: 'Tintas',
      celula: 'B12',
      valor: '24.4',
      motivo: 'CEST fora do formato NN.NNN.NN',
    },
    {
      aba: 'Ferramentas',
      celula: '',
      valor: '',
      motivo: 'linha de cabeçalho (ITEM e CEST) não encontrada; aba ignorada',
    },
  ],
  totalLinhas: 30,
};

const info = (p: Partial<InfoDocumento> = {}): InfoDocumento => ({
  formato: 2,
  tipo: 'st',
  arquivo: 'portal-st-se-v0019.xlsx',
  tipoArquivo: 'xlsx',
  tamanhoArquivo: 1000,
  importadoEm: '2026-11-04T12:00:00.000Z',
  versao: '0019',
  vigencia: '01/07/2023',
  quantidades: [],
  naoEntendidos: [],
  totalNaoEntendidos: 0,
  observacoes: [],
  servidor: null,
  ...p,
});

describe('leitura da planilha de ST', () => {
  const l = leituraST(
    relatorioST,
    'portal-st-se-v0019.xlsx',
    '2026-11-04T12:00:00.000Z',
  );

  it('ignorado de propósito fica fora dos problemas', () => {
    assert.deepEqual(
      l.ignorados.map((g) => [g.motivo, g.onde]),
      [
        ['linhas de produto sem NCM', ['Autopecas']],
        ['linhas sem CEST (combos, títulos, observações)', ['Bebidas frias']],
        ['abas sem colunas de MVA', ['Água mineral', 'Bebidas frias']],
        ['abas sem coluna NCM (ficam fora da busca por NCM)', ['Água mineral']],
      ],
    );
  });

  it('problema de leitura: célula que não deu para converter', () => {
    assert.equal(l.totalProblemas, 2);
    assert.deepEqual(
      problemasPorAba(l.problemas).map(([a, ps]) => [
        a,
        ps.map((p) => p.celula),
      ]),
      [['Tintas', ['F9', 'B12']]],
    );
    assert.deepEqual(l.observacoes, [
      '1 MVA escrita em percentual e convertida.',
    ]);
  });

  it('aba de segmento sem cabeçalho é segmento incompleto', () => {
    assert.deepEqual(l.segmentosIncompletos, ['Ferramentas']);
  });
});

describe('leitura da TIPI', () => {
  const r: RelatorioTipi = {
    totalNcm: 10,
    totalLinhas: 100,
    semAliquota: [],
    ignoradas: [
      {
        motivo: 'exceção tarifária (Ex)',
        total: 587,
        exemplos: [{ linha: 34, texto: 'Ex 01', celula: 'B34' }],
      },
      {
        motivo: 'título e notas de capítulo ou seção',
        total: 40,
        exemplos: [],
      },
      {
        motivo: 'código não reconhecido',
        total: 1,
        exemplos: [{ linha: 50, texto: 'X.1', celula: 'A50' }],
      },
    ],
  };
  it('Ex e notas são ignorados; código não reconhecido é problema', () => {
    const l = leituraTipi(r, 'tipi.xlsx', 'x');
    assert.deepEqual(
      l.ignorados.map((g) => g.motivo),
      ['exceção tarifária (Ex)', 'título e notas de capítulo ou seção'],
    );
    assert.equal(l.totalProblemas, 1);
    assert.equal(l.problemas[0].celula, 'A50');
  });
});

describe('rótulo e semáforo', () => {
  const ok: LeituraDocumento = {
    versao: 1,
    tipo: 'st',
    arquivo: 'x',
    importadoEm: 'x',
    segmentosIncompletos: [],
    problemas: [],
    totalProblemas: 0,
    ignorados: [{ motivo: 'Ex', total: 500, onde: [] }],
    observacoes: [],
  };

  it('só ignorados: verde "Carregado"', () => {
    assert.deepEqual(rotuloDocumento(info(), ok), {
      cor: 'verde',
      texto: 'Carregado',
    });
    assert.deepEqual(semaforoDocumento(info(), ok, null), {
      cor: 'verde',
      texto: 'ok',
    });
  });

  it('com problema: amarelo, com a contagem', () => {
    const l = { ...ok, totalProblemas: 3 };
    assert.deepEqual(rotuloDocumento(info(), l), {
      cor: 'amarela',
      texto: 'Carregado com 3 problemas',
    });
    assert.deepEqual(semaforoDocumento(info(), l, null), {
      cor: 'amarela',
      texto: '3 problemas',
    });
    assert.equal(
      rotuloDocumento(info(), { ...ok, segmentosIncompletos: ['Ferramentas'] })
        .texto,
      'Carregado com 1 segmento incompleto',
    );
  });

  it('versão nova disponível: amarelo', () => {
    const v = { estado: 'nova' } as never;
    assert.deepEqual(semaforoDocumento(info(), ok, v), {
      cor: 'amarela',
      texto: 'versão nova',
    });
  });

  it('faltando ou incompatível: vermelho', () => {
    assert.deepEqual(semaforoDocumento(null, null, null), {
      cor: 'vermelha',
      texto: 'falta',
    });
    assert.deepEqual(semaforoDocumento(null, null, null, true), {
      cor: 'vermelha',
      texto: 'incompatível',
    });
  });

  it('arquivo de leitura de outra importação não vale', () => {
    assert.equal(lerLeitura({ ...ok, importadoEm: 'outra' }, info()), null);
    const certo = { ...ok, importadoEm: info().importadoEm };
    assert.deepEqual(lerLeitura(certo, info()), certo);
    assert.equal(lerLeitura(certo, null), null);
  });
});

describe('reconhecer arquivo errado', () => {
  const planilha = (linhas: (string | number | null)[][]) => {
    const b = xlsx('Plan1', linhas);
    return { b, abas: lerXlsx(b) };
  };
  const texto = (t: string) => new TextEncoder().encode(t);

  it('planilha de combustíveis (Ato COTEPE)', () => {
    const { b, abas } = planilha([
      ['ANEXO ÚNICO'],
      ['(ATO COTEPE/ICMS 61/19)'],
      ['Gasolina', 'PMPF'],
    ]);
    assert.equal(reconhecerArquivo(b, abas), 'combustiveis');
    assert.equal(
      mensagemArquivoErrado('st', 'combustiveis').mensagem,
      'Este arquivo parece a planilha de combustíveis (Ato COTEPE), não a de ST de Sergipe.',
    );
  });

  it('TIPI no cartão da ST, e ST no cartão da TIPI', () => {
    const tipi = planilha([['NCM', 'EX', 'DESCRIÇÃO', 'ALÍQUOTA (%)']]);
    assert.equal(reconhecerArquivo(tipi.b, tipi.abas), 'tipi');
    assert.match(
      mensagemArquivoErrado('st', 'tipi').oQueFazer,
      /cartão da TIPI/,
    );
    const st = planilha([['ITEM', 'CEST', 'NCM/SH']]);
    assert.equal(reconhecerArquivo(st.b, st.abas), 'st');
    assert.match(
      mensagemArquivoErrado('tipi', 'st').mensagem,
      /planilha de ST/,
    );
  });

  it('NF-e, PDF e texto da TIPI', () => {
    assert.equal(
      reconhecerArquivo(texto('<?xml?><nfeProc xmlns="x">'), null),
      'nfe',
    );
    assert.equal(reconhecerArquivo(texto('%PDF-1.7'), null), 'pdf');
    const linhas = Array.from(
      { length: 25 },
      (_, i) => `3208.10.${String(i).padStart(2, '0')} Tintas 3,25`,
    );
    assert.equal(reconhecerArquivo(texto(linhas.join('\n')), null), 'tipi');
    assert.equal(reconhecerArquivo(texto('lista de compras'), null), 'texto');
  });
});

describe('selo único do cartão', () => {
  const base: LeituraDocumento = {
    versao: 1,
    tipo: 'st',
    arquivo: 'x',
    importadoEm: 'x',
    segmentosIncompletos: [],
    problemas: [],
    totalProblemas: 0,
    ignorados: [],
    observacoes: [],
  };
  it('carregado, problemas de leitura, faltando e versão nova', () => {
    assert.deepEqual(seloDocumento(info(), base, null), {
      cor: 'verde',
      texto: 'Carregado',
    });
    assert.deepEqual(
      seloDocumento(info(), { ...base, totalProblemas: 3 }, null),
      {
        cor: 'amarela',
        texto: '3 problemas de leitura',
      },
    );
    assert.deepEqual(
      seloDocumento(
        info(),
        { ...base, totalProblemas: 1, segmentosIncompletos: ['Tintas'] },
        null,
      ),
      {
        cor: 'amarela',
        texto: '1 problema de leitura e 1 segmento incompleto',
      },
    );
    assert.deepEqual(seloDocumento(null, null, null), {
      cor: 'vermelha',
      texto: 'Faltando',
    });
    assert.deepEqual(seloDocumento(null, null, null, true), {
      cor: 'vermelha',
      texto: 'Arquivo incompatível',
    });
    assert.deepEqual(seloDocumento(info(), base, { estado: 'nova' } as never), {
      cor: 'amarela',
      texto: 'Versão nova disponível',
    });
  });
});
