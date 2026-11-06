// Limites do leitor de .zip e .xlsx (T13 e T14 do plano de segurança):
// bomba de descompactação, zip com partes demais e célula fora do Excel.
// Tudo montado na memória com bytes inventados; nada grava no disco.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { LIMITES_ZIP, LimiteExcedido, lerZip } from '../../src/fiscal/zip.ts';
import {
  MAX_COLUNAS,
  MAX_LINHAS,
  lerXlsx,
  referencia,
} from '../../src/fiscal/xlsx.ts';
import { zip, zipBinario, type EntradaZip } from './fixtures/zip.mts';

const MB = 1024 * 1024;
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

/** .xlsx de uma aba com o XML da aba dado. */
function xlsxComAba(aba: string): Uint8Array {
  return zip({
    'xl/workbook.xml': `<workbook ${NS} xmlns:r="r"><sheets><sheet name="Aba" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': aba,
  });
}

const recusa = (mensagem: RegExp) => (e: unknown) =>
  e instanceof LimiteExcedido && mensagem.test(e.message);

describe('zip: limites contra bomba de descompactação (T13)', () => {
  it('os limites são 2.000 partes, 64 MB por parte e 200 MB no total', () => {
    assert.deepEqual(LIMITES_ZIP, {
      entradas: 2000,
      porEntrada: 64 * MB,
      total: 200 * MB,
    });
  });

  it('parte que descomprime para 70 MB (a partir de ~70 KB): recusa', () => {
    const zeros = new Uint8Array(70 * MB);
    const comprimido = deflateRawSync(zeros);
    assert.ok(comprimido.length < MB, 'o zip de ataque é pequeno');
    const dados = zipBinario([
      { nome: 'xl/worksheets/sheet1.xml', dados: zeros, metodo: 8, comprimido },
    ]);
    assert.throws(
      () => lerZip(dados),
      recusa(/^A planilha descomprimida passa do limite de 64 MB por parte\.$/),
    );
  });

  it('partes pequenas que somadas passam do total: recusa', () => {
    // Limites menores para o teste não precisar de 200 MB de memória.
    const limites = { entradas: 2000, porEntrada: 1 * MB, total: 3 * MB };
    const parte = new Uint8Array(Math.floor(0.9 * MB));
    const comprimido = deflateRawSync(parte);
    const entradas: EntradaZip[] = [1, 2, 3, 4].map((n) => ({
      nome: `parte${n}.xml`,
      dados: parte,
      metodo: 8,
      comprimido,
    }));
    assert.throws(
      () => lerZip(zipBinario(entradas), limites),
      recusa(/^A planilha descomprimida passa do limite de 3 MB no total\.$/),
    );
  });

  it('parte guardada sem compressão também conta no limite', () => {
    const limites = { entradas: 2000, porEntrada: 1 * MB, total: 3 * MB };
    const dados = zipBinario([
      { nome: 'grande.xml', dados: new Uint8Array(2 * MB), metodo: 0 },
    ]);
    assert.throws(() => lerZip(dados, limites), LimiteExcedido);
  });

  it('mais de 2.000 partes: recusa sem descomprimir nenhuma', () => {
    const entradas: EntradaZip[] = Array.from({ length: 2001 }, (_, i) => ({
      nome: `p${i}.xml`,
      dados: new Uint8Array(0),
      metodo: 0,
    }));
    assert.throws(
      () => lerZip(zipBinario(entradas)),
      recusa(
        /^O arquivo tem mais de 2\.000 partes, demais para uma planilha\.$/,
      ),
    );
  });

  it('dentro dos limites: lê como antes', () => {
    const z = lerZip(zip({ 'a.xml': '<a/>', 'b.xml': '<b/>' }));
    assert.equal(Buffer.from(z.get('a.xml')!).toString('utf8'), '<a/>');
    assert.equal(Buffer.from(z.get('b.xml')!).toString('utf8'), '<b/>');
  });

  it('a bomba dentro de um .xlsx chega como recusa no lerXlsx', () => {
    const aba = ' '.repeat(65 * MB);
    assert.throws(() => lerXlsx(xlsxComAba(aba)), LimiteExcedido);
  });
});

describe('xlsx: referência de célula nos limites do Excel (T14)', () => {
  it('limites do Excel: 1.048.576 linhas e 16.384 colunas (XFD)', () => {
    assert.equal(MAX_LINHAS, 1_048_576);
    assert.equal(MAX_COLUNAS, 16_384);
    assert.deepEqual(referencia('XFD1048576'), {
      linha: 1_048_575,
      coluna: 16_383,
    });
    assert.deepEqual(referencia('AB12'), { linha: 11, coluna: 27 });
  });

  it('fora do limite: recusa', () => {
    for (const ref of ['A1048577', 'XFE1', 'AAAA1', 'A0', 'A999999999'])
      assert.throws(
        () => referencia(ref),
        recusa(/^Referência de célula fora do limite do Excel: /),
        ref,
      );
  });

  it('célula A999999999 numa aba: recusa em menos de 1 s, sem montar a grade', () => {
    const aba = `<worksheet ${NS}><sheetData><row r="999999999"><c r="A999999999"><v>1</v></c></row></sheetData></worksheet>`;
    const inicio = performance.now();
    assert.throws(() => lerXlsx(xlsxComAba(aba)), recusa(/A999999999/));
    assert.ok(performance.now() - inicio < 1000);
  });
});
