import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as f from '../src/nfe/formato.ts';

// Intl usa espaço sem quebra (U+00A0) entre "R$" e o número.
const NBSP = ' ';

describe('formato: valores', () => {
  it('moeda em reais, milhar com ponto e centavos com vírgula', () => {
    assert.equal(f.moeda('1234.5'), `R$${NBSP}1.234,50`);
    assert.equal(f.moeda('0'), `R$${NBSP}0,00`);
    assert.equal(f.moeda('1234567.891'), `R$${NBSP}1.234.567,89`);
  });

  it('valor sem símbolo, 2 casas', () => {
    assert.equal(f.valor('1234.5'), '1.234,50');
    assert.equal(f.valor('0.005'), '0,01');
    assert.equal(f.valor('-10'), '-10,00');
  });

  it('valor unitário mantém as casas significativas (até 10)', () => {
    assert.equal(f.valorUnitario('77.1833000000'), '77,1833');
    assert.equal(f.valorUnitario('25.6200000000'), '25,62');
    assert.equal(f.valorUnitario('3'), '3,00');
    assert.equal(f.valorUnitario('0.1234567891'), '0,1234567891');
  });

  it('quantidade: sem casas inteiras, até 4 decimais', () => {
    assert.equal(f.quantidade('20.0000'), '20');
    assert.equal(f.quantidade('1.2500'), '1,25');
    assert.equal(f.quantidade('1500'), '1.500');
    assert.equal(f.quantidade('0.12345'), '0,1235');
  });

  it('entrada vazia ou inválida devolve string vazia', () => {
    for (const fn of [f.moeda, f.valor, f.valorUnitario, f.quantidade]) {
      assert.equal(fn(''), '');
      assert.equal(fn('abc'), '');
      assert.equal(fn('Infinity'), '');
    }
  });
});

describe('formato: datas', () => {
  it('data aaaa-mm-dd vira dd/mm/aaaa', () => {
    assert.equal(f.data('2026-03-05'), '05/03/2026');
  });

  it('data aceita data e hora e ignora o resto', () => {
    assert.equal(f.data('2026-03-05T10:00:00-03:00'), '05/03/2026');
  });

  it('data inválida ou vazia dá vazio', () => {
    assert.equal(f.data(''), '');
    assert.equal(f.data('05/03/2026'), '');
  });

  it('dataHora usa a hora escrita, sem converter fuso', () => {
    assert.equal(f.dataHora('2026-02-03T15:02:28-03:00'), '03/02/2026 15:02');
    assert.equal(f.dataHora('2026-02-03T23:59:59+09:00'), '03/02/2026 23:59');
  });

  it('dataHora sem hora cai para só a data; inválida dá vazio', () => {
    assert.equal(f.dataHora('2026-02-03'), '03/02/2026');
    assert.equal(f.dataHora('xx'), '');
  });

  it('agora tem o formato dd/mm/aaaa hh:mm', () => {
    assert.match(f.agora(), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});

describe('formato: documentos e contato (dados inventados)', () => {
  it('cnpj', () => {
    assert.equal(f.cnpj('12345678000195'), '12.345.678/0001-95');
    assert.equal(f.cnpj('12.345.678/0001-95'), '12.345.678/0001-95');
    assert.equal(f.cnpj('123'), '123');
  });

  it('cpf', () => {
    assert.equal(f.cpf('12345678901'), '123.456.789-01');
    assert.equal(f.cpf('1234'), '1234');
  });

  it('cep', () => {
    assert.equal(f.cep('88000000'), '88000-000');
    assert.equal(f.cep('8800'), '8800');
  });

  it('fone de 10 e 11 dígitos', () => {
    assert.equal(f.fone('4733334444'), '(47) 3333-4444');
    assert.equal(f.fone('47999998888'), '(47) 99999-8888');
    assert.equal(f.fone('999'), '999');
  });

  it('chave de acesso em grupos de 4, sem espaço sobrando no fim', () => {
    const chave = '12345678901234567890123456789012345678901234';
    const r = f.chaveAcesso(chave);
    assert.equal(r.split(' ').length, 11);
    assert.ok(r.startsWith('1234 5678 9012'));
    assert.ok(!r.endsWith(' '));
    assert.equal(r.replace(/ /g, ''), chave);
  });

  it('nomeArquivoSeguro tira caracteres proibidos no Windows', () => {
    assert.equal(f.nomeArquivoSeguro('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij');
    assert.equal(f.nomeArquivoSeguro('  nome   com   espaços  '), 'nome com espaços');
    assert.equal(f.nomeArquivoSeguro('arquivo. '), 'arquivo');
    assert.equal(f.nomeArquivoSeguro('a\u0001b'), 'ab');
  });
});
