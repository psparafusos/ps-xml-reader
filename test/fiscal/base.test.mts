import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analisarItem } from '../../src/fiscal/analise.ts';
import { carregarBaseFiscal, gerarBaseFiscal } from '../../src/fiscal/base.ts';
import { zip } from './fixtures/zip.mts';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

/** .xlsx de uma aba, com as células em texto (inlineStr) ou número. */
function xlsx(nome: string, linhas: (string | number)[][]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col = (c: number) => String.fromCharCode(65 + c);
  const rows = linhas
    .map(
      (l, i) =>
        `<row r="${i + 1}">${l
          .map((v, c) => {
            const r = `${col(c)}${i + 1}`;
            return typeof v === 'number'
              ? `<c r="${r}"><v>${v}</v></c>`
              : `<c r="${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  return zip({
    'xl/workbook.xml': `<workbook ${NS} xmlns:r="r"><sheets><sheet name="${nome}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`,
  });
}

const pasta = mkdtempSync(join(tmpdir(), 'base-fiscal-'));
after(() => rmSync(pasta, { recursive: true, force: true }));

const planilha = join(pasta, 'portal-st-se-v0019.xlsx');
writeFileSync(
  planilha,
  xlsx('Tintas', [
    ['Versão: 0019'],
    ['Produção de efeitos a partir de 01/07/2023'],
    ['ANEXO XXIII – SEGMENTO: TINTAS E VERNIZES'],
    [
      'ITEM',
      'CEST',
      'NCM/SH',
      'Descrição',
      'MVA-ST Alíquota de 4%',
      'MVA-ST Alíquota de 7%',
      'MVA-ST Alíquota de 12%',
      'MVA-ST Alíquota de 19%',
    ],
    [
      1,
      '24.001.00',
      '3208  3209',
      'Tintas, vernizes',
      0.62,
      0.5694,
      0.485,
      0.35,
    ],
  ]),
);
const textoTipi = fileURLToPath(
  new URL('./fixtures/tipi-trecho.txt', import.meta.url),
);

describe('base fiscal', () => {
  const destino = join(pasta, 'base');
  const gerada = gerarBaseFiscal(
    { planilhaST: planilha, textoTipi },
    destino,
    new Date('2026-11-03T12:00:00Z'),
  );

  it('grava os três arquivos', () => {
    assert.deepEqual(readdirSync(destino).sort(), [
      'base-fiscal.json',
      'st.json',
      'tipi.json',
    ]);
    assert.equal(gerada.info.origemST, 'portal-st-se-v0019.xlsx');
    assert.equal(gerada.info.origemTipi, 'tipi-trecho.txt');
    assert.equal(gerada.info.geradaEm, '2026-11-03T12:00:00.000Z');
    assert.equal(gerada.info.relatorioST.versao, '0019');
    assert.equal(gerada.st.linhas.length, 2);
  });

  it('carrega igual ao que gerou', () => {
    const carregada = carregarBaseFiscal(destino);
    assert.deepEqual(carregada.st, gerada.st);
    assert.deepEqual(carregada.tipi, gerada.tipi);
    assert.deepEqual(carregada.info, gerada.info);
  });

  it('a base carregada serve para a análise', () => {
    const r = analisarItem(
      {
        NCM: '32081020',
        CEST: '24.001.00',
        orig: '0',
        pICMS: '7',
        pIPI: '3.25',
      },
      'SP',
      carregarBaseFiscal(destino),
    );
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.mva, 0.5694);
    assert.equal(r.cfopSugerido, '2403');
    assert.equal(r.tipi.confere, true);
  });

  it('formato diferente pede para gerar de novo', () => {
    const outra = join(pasta, 'antiga');
    gerarBaseFiscal({ planilhaST: planilha, textoTipi }, outra);
    writeFileSync(join(outra, 'base-fiscal.json'), '{"formato":0}');
    assert.throws(() => carregarBaseFiscal(outra), /formato 0.*gere de novo/);
  });

  it('pasta sem base lança erro', () => {
    assert.throws(() => carregarBaseFiscal(join(pasta, 'nao-existe')));
  });
});
