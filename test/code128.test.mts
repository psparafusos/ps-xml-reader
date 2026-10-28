import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PADROES,
  START_C,
  STOP,
  ZONA_SILENCIO,
  barrasCode128C,
  digitoVerificador,
  modulosCode128C,
  valoresCode128C,
} from '../src/danfe/code128.ts';

// Chave inventada de 44 dígitos (não é de nota real).
const CHAVE = '12345678901234567890123456789012345678901234';

describe('code128: tabela de padrões', () => {
  it('tem 107 padrões (0 a 106)', () => {
    assert.equal(PADROES.length, 107);
  });

  it('cada símbolo soma 11 módulos e o STOP soma 13', () => {
    PADROES.slice(0, 106).forEach((p, i) => {
      const soma = [...p].reduce((s, c) => s + Number(c), 0);
      assert.equal(p.length, 6, `padrão ${i}`);
      assert.equal(soma, 11, `padrão ${i}`);
    });
    assert.equal(PADROES[STOP].length, 7);
    assert.equal(
      [...PADROES[STOP]].reduce((s, c) => s + Number(c), 0),
      13,
    );
  });

  it('valores conhecidos da especificação (0, 12, 89 a 99, START C, STOP)', () => {
    assert.equal(PADROES[0], '212222');
    assert.equal(PADROES[12], '112232');
    assert.equal(PADROES[START_C], '211232');
    assert.equal(PADROES[STOP], '2331112');
  });
});

describe('code128: dígito verificador', () => {
  it('"1234" dá (105 + 12*1 + 34*2) % 103 = 82', () => {
    assert.equal(digitoVerificador([12, 34]), 82);
  });

  it('sem dados, o verificador é o próprio START C', () => {
    assert.equal(digitoVerificador([]), 105 % 103);
  });
});

describe('code128: chave de 44 dígitos em CODE-128C', () => {
  it('gera START C, 22 pares, verificador e STOP', () => {
    const v = valoresCode128C(CHAVE);
    assert.equal(v.length, 25);
    assert.equal(v[0], START_C);
    assert.deepEqual(v.slice(1, 6), [12, 34, 56, 78, 90]);
    assert.equal(v[22], 34);
    assert.equal(v[23], 61);
    assert.equal(v[24], STOP);
  });

  it('o verificador confere com o cálculo sobre os pares', () => {
    const v = valoresCode128C(CHAVE);
    assert.equal(v[23], digitoVerificador(v.slice(1, 23)));
  });

  it('mantém o par "00" e zeros à esquerda', () => {
    const v = valoresCode128C('0001');
    assert.deepEqual(v.slice(0, 3), [START_C, 0, 1]);
  });

  it('larguras: 24 símbolos de 11 módulos mais o STOP de 13 = 277', () => {
    const m = modulosCode128C(CHAVE);
    assert.equal(m.length, 24 * 6 + 7);
    assert.equal(
      m.reduce((s, n) => s + n, 0),
      277,
    );
  });

  it('barras: 76 barras, total com as duas zonas de silêncio', () => {
    const { total, barras } = barrasCode128C(CHAVE);
    assert.equal(barras.length, 24 * 3 + 4);
    assert.equal(total, 277 + 2 * ZONA_SILENCIO);
    assert.equal(barras[0].x, ZONA_SILENCIO);
  });

  it('barras não se sobrepõem e ficam dentro da área útil', () => {
    const { total, barras } = barrasCode128C(CHAVE);
    for (let i = 1; i < barras.length; i++) {
      assert.ok(barras[i].x >= barras[i - 1].x + barras[i - 1].largura);
    }
    const ultima = barras[barras.length - 1];
    assert.equal(ultima.x + ultima.largura, total - ZONA_SILENCIO);
  });

  it('rejeita entrada ímpar, vazia ou não numérica', () => {
    assert.throws(() => valoresCode128C('123'), /par de dígitos/);
    assert.throws(() => valoresCode128C(''), /par de dígitos/);
    assert.throws(() => valoresCode128C('12ab'), /par de dígitos/);
    assert.throws(() => valoresCode128C('12 34'), /par de dígitos/);
  });
});
