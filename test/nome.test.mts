import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fornecedorNoNome, nomeBaseArquivo } from '../src/nfe/nome.ts';
import type { Nota } from '../src/nfe/tipos.ts';

function nota(xFant: string, xNome: string, nNF: string, serie: string): Nota {
  return {
    emitente: { xFant, xNome },
    ide: { nNF, serie },
  } as unknown as Nota;
}

describe('nome: fornecedorNoNome', () => {
  it('usa o nome fantasia quando existe', () => {
    assert.equal(
      fornecedorNoNome('Ciser', 'CISER PARAFUSOS E PORCAS LTDA'),
      'CISER',
    );
  });

  it('fantasia com várias palavras vira lista com hífen', () => {
    assert.equal(fornecedorNoNome('Loja Modelo', 'X'), 'LOJA-MODELO');
  });

  it('sem fantasia, usa as duas primeiras palavras significativas da razão', () => {
    assert.equal(
      fornecedorNoNome('', 'FERRAGENS ALFA BETA COMERCIO LTDA'),
      'FERRAGENS-ALFA',
    );
  });

  it('ignora LTDA, SA, ME, EPP, EIRELI, CIA, preposições e letras soltas', () => {
    assert.equal(
      fornecedorNoNome('', 'P S PARAFUSOS E SEGURANCA LTDA'),
      'PARAFUSOS-SEGURANCA',
    );
    assert.equal(fornecedorNoNome('', 'DE DA DO LTDA ME BRAVO'), 'BRAVO');
    assert.equal(fornecedorNoNome('', 'CIA DAS ESTRELAS S/A'), 'ESTRELAS');
  });

  it('remove acentos e pontuação', () => {
    assert.equal(fornecedorNoNome('Açaí & Cia.', 'X'), 'ACAI-CIA');
    assert.equal(
      fornecedorNoNome('', 'Indústria Ótica Ltda.'),
      'INDUSTRIA-OTICA',
    );
  });

  it('corta em 20 caracteres sem deixar hífen no fim', () => {
    const r = fornecedorNoNome('ABCDEFGHIJKLMNOPQRS TUVWXYZ', '');
    assert.ok(r.length <= 20);
    assert.ok(!r.endsWith('-'));
    assert.equal(r, 'ABCDEFGHIJKLMNOPQRS');
  });

  it('vazio quando não sobra nada', () => {
    assert.equal(fornecedorNoNome('', ''), '');
    assert.equal(fornecedorNoNome('  ', 'E DE LTDA'), '');
  });
});

describe('nome: nomeBaseArquivo', () => {
  it('formato FORNECEDOR_NFnúmero com série 1 sem sufixo', () => {
    assert.equal(
      nomeBaseArquivo(nota('Ciser', 'CISER LTDA', '2330596', '1')),
      'CISER_NF2330596',
    );
  });

  it('série diferente de 1 vira -S<série>', () => {
    assert.equal(
      nomeBaseArquivo(nota('Ciser', 'CISER LTDA', '2330596', '2')),
      'CISER_NF2330596-S2',
    );
  });

  it('série 001 conta como 1 e 002 vira S2 (zeros à esquerda saem)', () => {
    assert.equal(nomeBaseArquivo(nota('A', 'A', '10', '001')), 'A_NF10');
    assert.equal(nomeBaseArquivo(nota('A', 'A', '10', '002')), 'A_NF10-S2');
  });

  it('série vazia ou não numérica não gera sufixo', () => {
    assert.equal(nomeBaseArquivo(nota('A', 'A', '10', '')), 'A_NF10');
    assert.equal(nomeBaseArquivo(nota('A', 'A', '10', 'U')), 'A_NF10');
  });

  it('série 0 gera -S0', () => {
    assert.equal(nomeBaseArquivo(nota('A', 'A', '10', '0')), 'A_NF10-S0');
  });

  it('número sem zeros à esquerda, mas "0" continua "0"', () => {
    assert.equal(nomeBaseArquivo(nota('A', 'A', '000123', '1')), 'A_NF123');
    assert.equal(nomeBaseArquivo(nota('A', 'A', '000', '1')), 'A_NF0');
  });

  it('acentos na razão social, sem fantasia', () => {
    assert.equal(
      nomeBaseArquivo(nota('', 'Fixação Rápida Ltda', '5', '1')),
      'FIXACAO-RAPIDA_NF5',
    );
  });

  it('null sem número válido ou sem fornecedor', () => {
    assert.equal(nomeBaseArquivo(nota('A', 'A', '', '1')), null);
    assert.equal(nomeBaseArquivo(nota('A', 'A', '12A', '1')), null);
    assert.equal(nomeBaseArquivo(nota('', '', '12', '1')), null);
  });
});
