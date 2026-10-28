import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { colunasDaConfig } from '../src/nfe/colunas.ts';
import { configPadrao } from '../src/nfe/config.ts';
import {
  criterioValido,
  descreverOrdem,
  ordenarItens,
  type Ordem,
} from '../src/nfe/ordem.ts';
import type { Anotacoes, Item } from '../src/nfe/tipos.ts';

// As colunas da configuração padrão (EAN escondido, as demais visíveis).
const COLUNAS = colunasDaConfig(configPadrao());

function item(nItem: string, extra: Partial<Item> = {}): Item {
  return {
    nItem,
    cProd: '',
    cEAN: '',
    xProd: '',
    NCM: '',
    CEST: '',
    CFOP: '',
    uCom: '',
    qCom: '',
    vUnCom: '',
    vProd: '',
    vDesc: '',
    infAdProd: '',
    vIPI: '',
    vICMS: '',
    cstIcms: '',
    ...extra,
  };
}

const SEM_NOTAS: Anotacoes = new Map();
/** ordenarItens com as colunas da configuração padrão. */
const ordenar = (itens: Item[], ordem: Ordem, notas: Anotacoes) =>
  ordenarItens(itens, ordem, notas, COLUNAS);
const asc = (criterio: string): Ordem => ({ criterio, direcao: 'asc' });
const desc = (criterio: string): Ordem => ({ criterio, direcao: 'desc' });
const ids = (itens: Item[]) => itens.map((i) => i.nItem);

describe('ordem: ordem da nota e imutabilidade', () => {
  it('"nota" devolve cópia na ordem recebida', () => {
    const itens = [item('2'), item('1'), item('3')];
    const r = ordenar(itens, asc('nota'), SEM_NOTAS);
    assert.deepEqual(ids(r), ['2', '1', '3']);
    assert.notEqual(r, itens);
  });

  it('não altera a lista recebida', () => {
    const itens = [item('1', { cProd: 'B' }), item('2', { cProd: 'A' })];
    ordenar(itens, asc('codigo-texto'), SEM_NOTAS);
    assert.deepEqual(ids(itens), ['1', '2']);
  });
});

describe('ordem: por coluna', () => {
  it('coluna numérica compara como número, não como texto', () => {
    const itens = [
      item('1', { qCom: '10.0000' }),
      item('2', { qCom: '9.0000' }),
      item('3', { qCom: '100.0000' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('qtd'), SEM_NOTAS)), [
      '2',
      '1',
      '3',
    ]);
    assert.deepEqual(ids(ordenar(itens, desc('qtd'), SEM_NOTAS)), [
      '3',
      '1',
      '2',
    ]);
  });

  it('coluna de texto usa a ordem do pt-BR, com acentos', () => {
    const itens = [
      item('1', { xProd: 'Zinco' }),
      item('2', { xProd: 'Árvore' }),
      item('3', { xProd: 'Banana' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('descricao'), SEM_NOTAS)), [
      '2',
      '3',
      '1',
    ]);
  });

  it('vazio vai para o fim nas duas direções', () => {
    const itens = [
      item('1', { vProd: '' }),
      item('2', { vProd: '5.00' }),
      item('3', { vProd: '1.00' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('vTotal'), SEM_NOTAS)), [
      '3',
      '2',
      '1',
    ]);
    assert.deepEqual(ids(ordenar(itens, desc('vTotal'), SEM_NOTAS)), [
      '2',
      '3',
      '1',
    ]);
  });

  it('empate mantém a ordem da nota, também em ordem decrescente', () => {
    const itens = [
      item('1', { CFOP: '5102' }),
      item('2', { CFOP: '5102' }),
      item('3', { CFOP: '5101' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('cfop'), SEM_NOTAS)), [
      '3',
      '1',
      '2',
    ]);
    assert.deepEqual(ids(ordenar(itens, desc('cfop'), SEM_NOTAS)), [
      '1',
      '2',
      '3',
    ]);
  });

  it('coluna Anotação ordena pelo texto digitado, vazio no fim', () => {
    const itens = [item('1'), item('2'), item('3')];
    const notas: Anotacoes = new Map([
      [
        'anotacao',
        new Map([
          ['2', 'beta'],
          ['3', 'alfa'],
        ]),
      ],
    ]);
    assert.deepEqual(ids(ordenar(itens, asc('anotacao'), notas)), [
      '3',
      '2',
      '1',
    ]);
  });

  it('anotação extra ordena pelo texto dela, sem misturar com a Anotação', () => {
    const config = configPadrao();
    config.anotacoes.push({
      id: 'anotacao-qtd-recebida',
      titulo: 'Qtd recebida',
    });
    config.colunas.push({ id: 'anotacao-qtd-recebida', visivel: true });
    const colunas = colunasDaConfig(config);
    const itens = [item('1'), item('2'), item('3')];
    const notas: Anotacoes = new Map([
      ['anotacao', new Map([['1', 'aaa']])],
      [
        'anotacao-qtd-recebida',
        new Map([
          ['1', 'zeta'],
          ['3', 'beta'],
        ]),
      ],
    ]);
    assert.deepEqual(
      ids(ordenarItens(itens, desc('anotacao-qtd-recebida'), notas, colunas)),
      ['1', '3', '2'],
    );
    assert.equal(criterioValido('anotacao-qtd-recebida', colunas), true);
    assert.equal(criterioValido('anotacao-qtd-recebida', COLUNAS), false);
  });

  it('critério desconhecido mantém a ordem da nota', () => {
    const itens = [item('2'), item('1')];
    assert.deepEqual(ids(ordenar(itens, asc('inexistente'), SEM_NOTAS)), [
      '2',
      '1',
    ]);
  });
});

describe('ordem: Código como texto e como número', () => {
  const itens = [
    item('1', { cProd: '100' }),
    item('2', { cProd: '20' }),
    item('3', { cProd: '3' }),
  ];

  it('como texto: "100" < "20" < "3"', () => {
    assert.deepEqual(ids(ordenar(itens, asc('codigo-texto'), SEM_NOTAS)), [
      '1',
      '2',
      '3',
    ]);
  });

  it('como número: 3 < 20 < 100', () => {
    assert.deepEqual(ids(ordenar(itens, asc('codigo-numero'), SEM_NOTAS)), [
      '3',
      '2',
      '1',
    ]);
    assert.deepEqual(ids(ordenar(itens, desc('codigo-numero'), SEM_NOTAS)), [
      '1',
      '2',
      '3',
    ]);
  });

  it('como número ignora zeros à esquerda e códigos longos (mais de 15 dígitos)', () => {
    const longos = [
      item('1', { cProd: '000000000080165102' }),
      item('2', { cProd: '9999999' }),
      item('3', { cProd: '80165101' }),
    ];
    assert.deepEqual(ids(ordenar(longos, asc('codigo-numero'), SEM_NOTAS)), [
      '2',
      '3',
      '1',
    ]);
  });

  it('como número usa o primeiro trecho de dígitos ("60062001X")', () => {
    const lista = [
      item('1', { cProd: '60062002' }),
      item('2', { cProd: '60062001X' }),
    ];
    assert.deepEqual(ids(ordenar(lista, asc('codigo-numero'), SEM_NOTAS)), [
      '2',
      '1',
    ]);
  });

  it('como número: mesmo número desempata pelo texto', () => {
    const lista = [item('1', { cProd: '123A' }), item('2', { cProd: '0123' })];
    assert.deepEqual(ids(ordenar(lista, asc('codigo-numero'), SEM_NOTAS)), [
      '2',
      '1',
    ]);
  });

  it('código sem dígitos ou vazio vai para o fim como número', () => {
    const lista = [
      item('1', { cProd: 'ABC' }),
      item('2', { cProd: '' }),
      item('3', { cProd: '7' }),
    ];
    assert.deepEqual(ids(ordenar(lista, asc('codigo-numero'), SEM_NOTAS)), [
      '3',
      '1',
      '2',
    ]);
  });

  it('código vazio vai para o fim como texto', () => {
    const lista = [item('1', { cProd: '' }), item('2', { cProd: 'A' })];
    assert.deepEqual(ids(ordenar(lista, asc('codigo-texto'), SEM_NOTAS)), [
      '2',
      '1',
    ]);
  });
});

describe('ordem: Agrupar por CST', () => {
  it('grupos em ordem crescente e, dentro do grupo, a ordem da nota', () => {
    const itens = [
      item('1', { cstIcms: '000' }),
      item('2', { cstIcms: '010' }),
      item('3', { cstIcms: '000' }),
      item('4', { cstIcms: '010' }),
      item('5', { cstIcms: '000' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('cst'), SEM_NOTAS)), [
      '1',
      '3',
      '5',
      '2',
      '4',
    ]);
  });

  it('a direção não inverte os grupos', () => {
    const itens = [
      item('1', { cstIcms: '010' }),
      item('2', { cstIcms: '000' }),
    ];
    assert.deepEqual(ids(ordenar(itens, desc('cst'), SEM_NOTAS)), ['2', '1']);
  });

  it('CST vazio vai para o fim', () => {
    const itens = [
      item('1', { cstIcms: '' }),
      item('2', { cstIcms: '060' }),
      item('3', { cstIcms: '000' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('cst'), SEM_NOTAS)), [
      '3',
      '2',
      '1',
    ]);
  });

  it('CSOSN (orig + código) entra no mesmo agrupamento', () => {
    const itens = [
      item('1', { cstIcms: '0102' }),
      item('2', { cstIcms: '0101' }),
    ];
    assert.deepEqual(ids(ordenar(itens, asc('cst'), SEM_NOTAS)), ['2', '1']);
  });
});

describe('ordem: critérios e rótulos', () => {
  it('criterioValido aceita os fixos e as colunas visíveis', () => {
    for (const c of ['nota', 'cst', 'codigo-texto', 'codigo-numero', 'ncm'])
      assert.equal(criterioValido(c, COLUNAS), true, c);
  });

  it('criterioValido recusa "codigo" puro, coluna oculta e desconhecido', () => {
    for (const c of ['codigo', 'ean', 'xyz', ''])
      assert.equal(criterioValido(c, COLUNAS), false, c);
  });

  it('descreverOrdem', () => {
    assert.equal(descreverOrdem(asc('nota'), COLUNAS), 'Ordem da nota');
    assert.equal(descreverOrdem(asc('cst'), COLUNAS), 'Agrupado por CST');
    assert.equal(
      descreverOrdem(asc('codigo-texto'), COLUNAS),
      'Código (como texto), crescente',
    );
    assert.equal(
      descreverOrdem(desc('codigo-numero'), COLUNAS),
      'Código (como número), decrescente',
    );
    assert.equal(descreverOrdem(desc('ncm'), COLUNAS), 'NCM, decrescente');
  });
});
