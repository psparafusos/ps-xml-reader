import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../src/fiscal/analise.ts';
import { executarPlano, planoAplicar } from '../src/fiscal/entrada.ts';
import { lerTabelaST } from '../src/fiscal/st.ts';
import { lerXlsx } from '../src/fiscal/xlsx.ts';
import {
  baseSemProtocolos,
  gravacoesAliquota,
  previaItem,
  type DecisaoST,
} from '../src/previaST.ts';
import { xlsx } from './fiscal/fixtures/xlsx.mts';

// Planilha de ST inventada, no leiaute do Portal ST: Autopeças com dois
// jogos de MVA, alíquota interna de 25% + 1% e a coluna de estados com um
// protocolo para BA; Tintas a 19% + 1% (FECOEP), sem protocolo.
const topo = (anexo: string, seg: string) => [
  ['Versão: 0020'],
  ['Produção de efeitos a partir de 01/02/2026'],
  [`ANEXO ${anexo} – SEGMENTO: ${seg}`],
];
const st = lerTabelaST([
  ...lerXlsx(
    xlsx('Autopecas', [
      ...topo('I', 'AUTOPEÇAS'),
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'MVA-ST 1 Alíquota de 4%',
        'MVA-ST 1 Alíquota de 7%',
        'MVA-ST 1 Alíquota de 12%',
        'MVA-ST 2 Alíquota de 4%',
        'MVA-ST 2 Alíquota de 7%',
        'MVA-ST 2 Alíquota de 12%',
        'Alíquota interna',
        'AC, AL, AM, BA',
      ],
      [
        1,
        '01.001.00',
        '4009',
        'Tubos de borracha vulcanizada',
        0.7148,
        0.6066,
        0.5203,
        0.6413,
        0.5555,
        0.4719,
        '25% + 1%',
        'PT 41/08',
      ],
    ]),
  ),
  ...lerXlsx(
    xlsx('Tintas', [
      ...topo('XXIII', 'TINTAS E VERNIZES'),
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'Alíquota interna',
      ],
      [
        1,
        '24.001.00',
        '3208',
        'Tintas, vernizes',
        0.62,
        0.5694,
        0.485,
        '19% + 1% (FECOEP)',
      ],
    ]),
  ),
]);

const item = (p: Partial<ItemFiscal>): ItemFiscal => ({
  nItem: '1',
  NCM: '40093100',
  orig: '0',
  CST: '00',
  pICMS: '7',
  CFOP: '6102',
  ...p,
});
const revenda: DecisaoST = { escolha: null, finalidade: 'revenda' };

describe('prévia: Autopeças e a troca de MVA', () => {
  const a = analisarItem(item({}), 'SP', { st });

  it('vem com a MVA-ST 1 e a MVA-ST 2 para trocar', () => {
    const l = previaItem(a, 'SP', revenda);
    assert.equal(l.st, 'sim');
    assert.equal(l.mvaRotulo, 'MVA-ST 1');
    assert.equal(l.mva, 0.6066);
    assert.equal(l.mvaTexto, '60,66%');
    assert.deepEqual(
      l.mvaOpcoes.map((m) => [m.rotulo, m.valor]),
      [
        ['MVA-ST 1', 0.6066],
        ['MVA-ST 2', 0.5555],
      ],
    );
    assert.equal(l.precisaDeMim, false);
    assert.equal(l.cfop, '2403');
  });

  it('a escolha da MVA-ST 2 troca o valor (e vai na decisão)', () => {
    const l = previaItem(a, 'SP', { ...revenda, mvaJogo: 'MVA-ST 2' });
    assert.equal(l.mvaRotulo, 'MVA-ST 2');
    assert.equal(l.mva, 0.5555);
    assert.equal(l.mvaTexto, '55,55%');
  });

  it('jogo que não existe volta ao padrão', () => {
    const l = previaItem(a, 'SP', { ...revenda, mvaJogo: 'MVA-ST 9' });
    assert.equal(l.mvaRotulo, 'MVA-ST 1');
  });
});

describe('prévia: alíquota interna', () => {
  it('linha a 25% + 1%: o texto da planilha', () => {
    const l = previaItem(analisarItem(item({}), 'SP', { st }), 'SP', revenda);
    assert.equal(l.aliquotaTexto, '25% + 1%');
    assert.equal(l.aliquotaInterna?.aliquota, 25);
    assert.equal(l.aliquotaInterna?.fecoep, 1);
    assert.equal(l.aliquotaConfirmar, false);
  });

  it('sem ST: "-"', () => {
    const l = previaItem(
      analisarItem(item({ NCM: '73181500' }), 'SP', { st }),
      'SP',
      revenda,
    );
    assert.equal(l.aliquotaTexto, '-');
    assert.equal(l.aliquotaConfirmar, false);
  });
});

describe('prévia: protocolo e observações', () => {
  it('fornecedor de estado com protocolo sem ST na nota: observação, CFOP igual', () => {
    const l = previaItem(analisarItem(item({}), 'BA', { st }), 'BA', revenda);
    assert.equal(l.cfop, '2403');
    assert.equal(l.precisaDeMim, false);
    assert.ok(
      l.observacoes.some((o) => /protocolo \(BA, PT 41\/08\)/.test(o)),
      l.observacoes.join(' | '),
    );
  });

  it('com o ST retido na nota, não há a observação do protocolo', () => {
    const l = previaItem(
      analisarItem(item({ CST: '10', vST: '12.50', vBCST: '100.00' }), 'BA', {
        st,
      }),
      'BA',
      revenda,
    );
    assert.ok(!l.observacoes.some((o) => /protocolo/.test(o)));
  });

  it('estado sem protocolo: "a loja recolhe" fica nas observações', () => {
    const l = previaItem(analisarItem(item({}), 'SP', { st }), 'SP', revenda);
    assert.ok(l.observacoes.includes('sem protocolo com SE: a loja recolhe'));
  });
});

describe('prévia: segmento incompleto', () => {
  it('vira confirmar, com o motivo do segmento', () => {
    const a = analisarItem(item({ NCM: '32081020' }), 'SP', {
      st,
      segmentosIncompletos: ['Tintas'],
    });
    const l = previaItem(a, 'SP', revenda);
    assert.equal(l.st, 'confirmar');
    assert.equal(l.cfop, null);
    assert.equal(l.segmentoProblema, 'segmento Tintas lido com problemas');
    assert.equal(l.precisaDeMim, true);
  });
});

describe('aplicar: alíquota interna na coluna escolhida', () => {
  it('grava o texto da planilha; célula preenchida só com confirmação', () => {
    const linhas = [
      previaItem(
        analisarItem(item({ nItem: '1' }), 'SP', { st }),
        'SP',
        revenda,
      ),
      previaItem(
        analisarItem(item({ nItem: '2', NCM: '32081020' }), 'SP', { st }),
        'SP',
        revenda,
      ),
      previaItem(
        analisarItem(item({ nItem: '3', NCM: '73181500' }), 'SP', { st }),
        'SP',
        revenda,
      ),
    ];
    const anotacoes = new Map([
      ['anotacao-aliq-interna', new Map([['2', '18%']])],
    ]);
    const plano = planoAplicar(
      linhas,
      anotacoes,
      'anotacao-cfop-de-entrada',
      null,
    );
    const extra = gravacoesAliquota(linhas, anotacoes, 'anotacao-aliq-interna');
    assert.deepEqual(
      extra.map((g) => [g.nItem, g.valor, g.atual]),
      [
        ['1', '25% + 1%', ''],
        ['2', '19% + 1% (FECOEP)', '18%'],
      ],
    );
    const tudo = { ...plano, gravacoes: [...plano.gravacoes, ...extra] };
    executarPlano(tudo, anotacoes, false);
    assert.equal(anotacoes.get('anotacao-aliq-interna')?.get('1'), '25% + 1%');
    assert.equal(anotacoes.get('anotacao-aliq-interna')?.get('2'), '18%');
    assert.equal(anotacoes.get('anotacao-cfop-de-entrada')?.get('3'), '2102');
  });
});

describe('aviso de reimportação', () => {
  it('base sem o campo protocolos em nenhuma linha pede reimportar', () => {
    assert.equal(baseSemProtocolos([{ ncm: '3208' }, { ncm: '4009' }]), true);
    assert.equal(baseSemProtocolos(st.linhas), false);
    assert.equal(baseSemProtocolos([]), false);
  });
});
