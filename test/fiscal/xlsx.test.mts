import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { letraColuna, lerXlsx, referencia } from '../../src/fiscal/xlsx.ts';
import { lerZip } from '../../src/fiscal/zip.ts';

/** Monta um .zip mínimo: um arquivo deflate e outro guardado (método 0). */
function zip(arquivos: Record<string, string>): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let pos = 0;
  Object.entries(arquivos).forEach(([nome, texto], i) => {
    const dados = Buffer.from(texto, 'utf8');
    const metodo = i % 2 === 0 ? 8 : 0;
    const corpo = metodo === 8 ? deflateRawSync(dados) : dados;
    const n = Buffer.from(nome, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc32(dados), 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc32(dados), 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(pos, 42);
    locais.push(local, n, corpo);
    centrais.push(central, n);
    pos += local.length + n.length + corpo.length;
  });
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...locais, diretorio, fim]));
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

const xlsx = zip({
  'xl/workbook.xml': `<?xml version="1.0"?><workbook ${NS} xmlns:r="r"><sheets><sheet name="Leiaute" sheetId="1" r:id="rId1"/><sheet name="Tintas &amp; Vernizes" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
  'xl/sharedStrings.xml': `<sst ${NS}><si><t>CEST</t></si><si><r><t>24.001</t></r><r><t xml:space="preserve">.00</t></r></si><si><t>3208        3209</t><rPh><t>x</t></rPh></si><si><t>92,36%</t></si></sst>`,
  'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>Versão: XXX</t></is></c></row></sheetData></worksheet>`,
  'xl/worksheets/sheet2.xml': `<worksheet ${NS}><sheetData><row r="1"><c r="B1" t="s"><v>0</v></c></row><row r="3"><c r="B3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="J3"><v>0.5694</v></c><c r="K3" t="s"><v>3</v></c><c r="L3" t="str"><v>a &lt; b</v></c><c r="M3" s="1"/></row></sheetData></worksheet>`,
});

describe('zip', () => {
  it('lê arquivos deflate e guardados', () => {
    const z = lerZip(zip({ 'a.txt': 'olá', 'b.txt': 'mundo' }));
    assert.equal(Buffer.from(z.get('a.txt')!).toString('utf8'), 'olá');
    assert.equal(Buffer.from(z.get('b.txt')!).toString('utf8'), 'mundo');
  });

  it('recusa o que não é zip', () => {
    assert.throws(() => lerZip(new Uint8Array(40)), /não é um \.zip/);
  });
});

describe('xlsx', () => {
  const abas = lerXlsx(xlsx);

  it('lê as abas na ordem do workbook, com o nome desescapado', () => {
    assert.deepEqual(
      abas.map((a) => a.nome),
      ['Leiaute', 'Tintas & Vernizes'],
    );
    assert.deepEqual(Array.from(abas[0].linhas[0]), [undefined, 'Versão: XXX']);
  });

  it('células: texto compartilhado (inclusive rico), número, texto de fórmula; vazia some', () => {
    const l = abas[1].linhas;
    assert.equal(l.length, 3);
    assert.deepEqual(l[1], []);
    assert.equal(l[0][1], 'CEST');
    assert.equal(l[2][1], '24.001.00');
    assert.equal(l[2][2], '3208        3209');
    assert.equal(l[2][9], 0.5694);
    assert.equal(l[2][10], '92,36%');
    assert.equal(l[2][11], 'a < b');
    assert.equal(l[2][12], undefined);
  });

  it('referência de célula e letra da coluna', () => {
    assert.deepEqual(referencia('AB12'), { linha: 11, coluna: 27 });
    assert.equal(letraColuna(0), 'A');
    assert.equal(letraColuna(27), 'AB');
  });
});
