// Nome do PDF dos documentos do modo Documento (src/docfiscal/nomeArquivo.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASE_DOCUMENTO,
  SUFIXO_DOCUMENTO,
  baseDocumento,
  saidaDacte,
  saidaDanfse,
  saidaEvento,
} from '../../src/docfiscal/nomeArquivo.ts';

describe('nome do PDF dos documentos', () => {
  it('DACTE: fornecedor do emitente, CTe<número>, série só se não for 1', () => {
    assert.deepEqual(
      saidaDacte('Transportadora Inventada', 'X Ltda', '0004567', '1'),
      { base: 'TRANSPORTADORA-INVEN_CTe4567', sufixo: '_DACTE' },
    );
    assert.equal(
      saidaDacte('', 'Transportes Rapidos Inventados Ltda', '12', '002').base,
      'TRANSPORTES-RAPIDOS_CTe12-S2',
    );
  });

  it('DANFSe: nome fantasia do prestador ou a razão social, NFSe<número>', () => {
    assert.deepEqual(
      saidaDanfse(
        'Locadora Inventada',
        'Locadora Inventada de Veiculos Ltda',
        '202600000000321',
      ),
      { base: 'LOCADORA-INVENTADA_NFSe202600000000321', sufixo: '_DANFSe' },
    );
    assert.equal(
      saidaDanfse('', 'Prestadora Inventada de Servicos Ltda', '123').base,
      'PRESTADORA-INVENTADA_NFSe123',
    );
  });

  it('Evento: CNPJ do emitente e número da NF-e tirados da chave', () => {
    const chave = '28261187654321000198550010000012341123456789';
    assert.deepEqual(saidaEvento(chave, '110110', false), {
      base: '87654321000198_NF1234',
      sufixo: '_Evento-CCe',
    });
    assert.equal(
      saidaEvento(chave, '110111', false).sufixo,
      '_Evento-Cancelamento',
    );
    assert.equal(saidaEvento(chave, '210210', false).sufixo, '_Evento-Ciencia');
    assert.equal(saidaEvento(chave, '999999', false).sufixo, '_Evento-999999');
    assert.equal(saidaEvento(chave, '', true).sufixo, '_Evento-Cancelamento');
    assert.equal(
      saidaEvento(
        '28261187654321000198550020000012341123456789',
        '110110',
        false,
      ).base,
      '87654321000198_NF1234-S2',
    );
    assert.equal(saidaEvento('123', '110110', false).base, null);
  });

  it('sem fornecedor ou sem número: null (vale o nome do arquivo aberto)', () => {
    assert.equal(baseDocumento('', 'CTe', '1'), null);
    assert.equal(baseDocumento('X', 'CTe', 'A1'), null);
  });

  it('o processo principal só aceita bases e sufixos do padrão', () => {
    for (const b of ['CISER_NF2330596', 'A-B_CTe1-S2', 'X_NFSe202600000000321'])
      assert.ok(BASE_DOCUMENTO.test(b), b);
    for (const b of ['..\\x_NF1', 'x_NF1', 'A_NFe1', 'A_CTe'])
      assert.ok(!BASE_DOCUMENTO.test(b), b);
    for (const s of [
      '_DACTE',
      '_DANFSe',
      '_DANFE-NFCe',
      '_Evento-CCe',
      '_Evento-110110',
    ])
      assert.ok(SUFIXO_DOCUMENTO.test(s), s);
    for (const s of ['_DANFE', '_Conferencia', '_Evento-..\\x', 'DACTE'])
      assert.ok(!SUFIXO_DOCUMENTO.test(s), s);
  });
});
