import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { analisarItem } from '../../src/fiscal/analise.ts';
import {
  ARQUIVO_LEITURA_ST,
  carregarBaseFiscal,
  importarDocumento,
  lerDocumentos,
  lerSegmentosIncompletos,
  removerDocumento,
} from '../../src/fiscal/base.ts';
import { ErroFormato } from '../../src/fiscal/documentos.ts';
import { xlsx, type CelulaTeste } from './fixtures/xlsx.mts';

const pasta = mkdtempSync(join(tmpdir(), 'base-fiscal-'));
after(() => rmSync(pasta, { recursive: true, force: true }));

/** Planilha de ST inventada, no leiaute do Portal ST. */
function planilhaST(versao: string, linhas: CelulaTeste[][]) {
  return xlsx('Tintas', [
    [`Versão: ${versao}`],
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
    ...linhas,
  ]);
}
const linhaTintas = [
  1,
  '24.001.00',
  '3208  3209',
  'Tintas, vernizes',
  0.62,
  0.5694,
  0.485,
  0.35,
];
const textoTipi = new Uint8Array(
  readFileSync(new URL('./fixtures/tipi-trecho.txt', import.meta.url)),
);
const agora = new Date('2026-11-03T12:00:00Z');

describe('base fiscal: importação', () => {
  const destino = join(pasta, 'base');

  it('começa sem documentos', () => {
    assert.deepEqual(lerDocumentos(destino), {
      st: null,
      tipi: null,
      combustiveis: null,
    });
    const b = carregarBaseFiscal(destino);
    assert.equal(b.st, null);
    assert.equal(b.tipi, null);
  });

  it('importa a planilha de ST e guarda os metadados', () => {
    const info = importarDocumento(
      'st',
      planilhaST('0019', [linhaTintas]),
      'portal-st-se-v0019.xlsx',
      destino,
      agora,
    );
    assert.equal(info.versao, '0019');
    assert.equal(info.vigencia, '01/07/2023');
    assert.equal(info.importadoEm, '2026-11-03T12:00:00.000Z');
    assert.equal(info.arquivo, 'portal-st-se-v0019.xlsx');
    assert.deepEqual(info.quantidades, [
      { rotulo: 'abas lidas', valor: 1 },
      { rotulo: 'linhas de produto', valor: 1 },
      { rotulo: 'NCMs na busca', valor: 2 },
    ]);
    assert.equal(info.totalNaoEntendidos, 0);
    assert.deepEqual(readdirSync(destino).sort(), ['st-info.json', 'st.json']);
  });

  it('importa a TIPI do texto do PDF', () => {
    const info = importarDocumento(
      'tipi',
      textoTipi,
      'tipi.pdf.txt',
      destino,
      agora,
    );
    assert.equal(info.tipoArquivo, 'txt');
    assert.deepEqual(info.quantidades[0], { rotulo: 'NCMs', valor: 55 });
  });

  it('carrega o que importou e serve para a análise', () => {
    const b = carregarBaseFiscal(destino);
    assert.equal(b.st?.linhas.length, 2);
    assert.equal(b.tipi?.porNcm.size, 55);
    const r = analisarItem(
      {
        NCM: '32081020',
        CEST: '24.001.00',
        orig: '0',
        pICMS: '7',
        pIPI: '3.25',
      },
      'SP',
      { st: b.st!, tipi: b.tipi },
    );
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.mva, 0.5694);
    assert.equal(r.cfopSugerido, '2403');
    assert.equal(r.tipi.confere, true);
  });

  it('pontos não entendidos: carrega o que leu e lista aba, célula e motivo', () => {
    const info = importarDocumento(
      'st',
      planilhaST('0020', [linhaTintas, [2, '24.002.00', null, 'Sem NCM']]),
      'portal-st-se-v0020.xlsx',
      destino,
      agora,
    );
    assert.equal(info.versao, '0020');
    assert.equal(info.totalNaoEntendidos, 1);
    assert.deepEqual(info.naoEntendidos[0], {
      aba: 'Tintas',
      celula: 'C6',
      valor: '',
      motivo: 'NCM vazio',
    });
    assert.equal(lerDocumentos(destino).st?.versao, '0020');
  });

  it('arquivo errado não substitui o documento anterior', () => {
    const errado = xlsx('Planilha2', [
      ['Combustível', 'PMPF'],
      ['Gasolina', 6.2],
    ]);
    assert.throws(
      () => importarDocumento('st', errado, 'sev002.xlsx', destino, agora),
      (e: unknown) => e instanceof ErroFormato && /ITEM e CEST/.test(e.message),
    );
    assert.throws(
      () =>
        importarDocumento(
          'st',
          new TextEncoder().encode('não é planilha'),
          'x.xlsx',
          destino,
        ),
      ErroFormato,
    );
    assert.throws(
      () => importarDocumento('tipi', errado, 'tipi.xlsx', destino),
      (e: unknown) => e instanceof ErroFormato && /TIPI/.test(e.message),
    );
    assert.throws(
      () =>
        importarDocumento(
          'tipi',
          new TextEncoder().encode('texto qualquer'),
          'a.txt',
          destino,
        ),
      ErroFormato,
    );
    const docs = lerDocumentos(destino);
    assert.equal(docs.st?.versao, '0020');
    assert.equal(docs.tipi?.arquivo, 'tipi.pdf.txt');
    assert.deepEqual(readdirSync(destino).sort(), [
      'st-info.json',
      'st.json',
      'tipi-info.json',
      'tipi.json',
    ]);
  });

  it('remover volta o documento a faltando', () => {
    removerDocumento('tipi', destino);
    assert.equal(lerDocumentos(destino).tipi, null);
    assert.equal(carregarBaseFiscal(destino).tipi, null);
  });
});

describe('base fiscal: segmentos lidos com problemas (st-leitura.json)', () => {
  const destino = join(pasta, 'leitura');

  it('sem o arquivo: lista vazia', () => {
    importarDocumento(
      'st',
      planilhaST('0019', [linhaTintas]),
      'st.xlsx',
      destino,
      agora,
    );
    assert.deepEqual(lerSegmentosIncompletos(destino), []);
    assert.deepEqual(carregarBaseFiscal(destino).segmentosIncompletos, []);
  });

  it('com o arquivo: a lista vai para a base e para a análise', () => {
    writeFileSync(
      join(destino, ARQUIVO_LEITURA_ST),
      JSON.stringify({ segmentosIncompletos: ['Tintas', 3, ''] }),
    );
    const b = carregarBaseFiscal(destino);
    assert.deepEqual(b.segmentosIncompletos, ['Tintas']);
    const r = analisarItem({ NCM: '32081020', orig: '0', pICMS: '7' }, 'SP', {
      st: b.st!,
      segmentosIncompletos: b.segmentosIncompletos,
    });
    assert.equal(r.stSergipe, 'confirmar');
    assert.ok(r.pendencias.includes('segmento Tintas lido com problemas'));
  });

  it('arquivo ilegível conta como ausente', () => {
    writeFileSync(join(destino, ARQUIVO_LEITURA_ST), '{ quebrado');
    assert.deepEqual(lerSegmentosIncompletos(destino), []);
  });

  it('remover a planilha de ST apaga o st-leitura.json', () => {
    writeFileSync(
      join(destino, ARQUIVO_LEITURA_ST),
      JSON.stringify({ segmentosIncompletos: ['Tintas'] }),
    );
    removerDocumento('st', destino);
    assert.ok(!readdirSync(destino).includes(ARQUIVO_LEITURA_ST));
  });
});
