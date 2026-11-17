import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cnpjDaConfig,
  cnpjDestinatarioDoTexto,
  cnpjMaisFrequente,
  cnpjValido,
  mascaraCnpj,
  problemaCnpj,
} from '../src/nfe/cnpj.ts';

// CNPJs inventados, com dígitos verificadores válidos.
const LOJA = '12345678000195';
const OUTRA = '11222333000181';
const TERCEIRA = '98765432000198';

describe('cnpjValido', () => {
  it('confere os dois dígitos verificadores', () => {
    assert.ok(cnpjValido(LOJA));
    assert.ok(cnpjValido(OUTRA));
    assert.ok(cnpjValido(TERCEIRA));
    assert.ok(!cnpjValido('12345678000194'));
    assert.ok(!cnpjValido('12345678000185'));
  });

  it('recusa tamanho errado, letras e dígitos todos iguais', () => {
    assert.ok(!cnpjValido('1234567800019'));
    assert.ok(!cnpjValido('123456780001955'));
    assert.ok(!cnpjValido('1234567800019A'));
    assert.ok(!cnpjValido('00000000000000'));
    assert.ok(!cnpjValido('11111111111111'));
  });
});

describe('problemaCnpj', () => {
  it('aceita com e sem máscara', () => {
    assert.equal(problemaCnpj(LOJA), null);
    assert.equal(problemaCnpj('12.345.678/0001-95'), null);
    assert.equal(problemaCnpj('  12.345.678/0001-95 '), null);
  });

  it('diz o que está errado', () => {
    assert.equal(problemaCnpj(''), 'Digite o CNPJ da loja.');
    assert.equal(problemaCnpj('   '), 'Digite o CNPJ da loja.');
    assert.equal(problemaCnpj('123'), 'O CNPJ precisa ter 14 dígitos.');
    assert.equal(
      problemaCnpj('12.345.678/0001-94'),
      'CNPJ inválido: confira os dígitos.',
    );
    assert.equal(
      problemaCnpj('12.345.678/0001-9x'),
      'Use só números, pontos, barra e hífen no CNPJ.',
    );
  });

  it('cnpjDaConfig devolve só os dígitos do CNPJ válido', () => {
    assert.equal(cnpjDaConfig('12.345.678/0001-95'), LOJA);
    assert.equal(cnpjDaConfig('12.345.678/0001-94'), null);
    assert.equal(cnpjDaConfig(null), null);
  });

  it('mascaraCnpj', () => {
    assert.equal(mascaraCnpj(LOJA), '12.345.678/0001-95');
    assert.equal(mascaraCnpj('123'), '123');
  });
});

describe('cnpjDestinatarioDoTexto', () => {
  const nfe = (dest: string) =>
    `<nfeProc><NFe><infNFe Id="NFe${'1'.repeat(44)}"><emit><CNPJ>${OUTRA}</CNPJ></emit>${dest}</infNFe></NFe></nfeProc>`;

  it('lê o CNPJ do grupo dest, não o do emitente', () => {
    assert.equal(
      cnpjDestinatarioDoTexto(nfe(`<dest><CNPJ>${LOJA}</CNPJ></dest>`)),
      LOJA,
    );
  });

  it('com prefixo de namespace e espaços', () => {
    assert.equal(
      cnpjDestinatarioDoTexto(
        `<nfe:dest xmlns:nfe="x">\n  <nfe:CNPJ>${LOJA}</nfe:CNPJ></nfe:dest>`,
      ),
      LOJA,
    );
  });

  it('destinatário com CPF, sem dest ou com CNPJ inválido: null', () => {
    assert.equal(
      cnpjDestinatarioDoTexto(nfe('<dest><CPF>12345678909</CPF></dest>')),
      null,
    );
    assert.equal(cnpjDestinatarioDoTexto(nfe('')), null);
    assert.equal(
      cnpjDestinatarioDoTexto(nfe('<dest><CNPJ>12345678000194</CNPJ></dest>')),
      null,
    );
  });
});

describe('cnpjMaisFrequente', () => {
  it('o que mais aparece nas notas recentes', () => {
    assert.equal(
      cnpjMaisFrequente([OUTRA, LOJA, null, LOJA, OUTRA, LOJA]),
      LOJA,
    );
  });

  it('no empate, o da nota mais recente', () => {
    assert.equal(cnpjMaisFrequente([TERCEIRA, LOJA, LOJA, TERCEIRA]), TERCEIRA);
  });

  it('sem nenhum CNPJ: null', () => {
    assert.equal(cnpjMaisFrequente([]), null);
    assert.equal(cnpjMaisFrequente([null, null]), null);
  });
});
