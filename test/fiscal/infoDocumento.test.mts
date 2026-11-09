// S15: o <tipo>-info.json lido de volta é conferido campo a campo. Um
// arquivo adulterado ou corrompido conta como documento não importado.
// Dados inventados; a pasta do teste (os.tmpdir()/info-*) é apagada no fim.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { FORMATO_BASE, lerInfoDocumento } from '../../src/fiscal/base.ts';
import {
  validarInfoDocumento,
  type InfoDocumento,
} from '../../src/fiscal/documentos.ts';

const valido: InfoDocumento = {
  formato: FORMATO_BASE,
  tipo: 'st',
  arquivo: 'portal-st-inventado.xlsx',
  tipoArquivo: 'xlsx',
  tamanhoArquivo: 1000,
  importadoEm: '2026-11-09T12:00:00.000Z',
  versao: '0099',
  vigencia: '01/01/2026',
  quantidades: [{ rotulo: 'Abas lidas', valor: 3 }],
  naoEntendidos: [{ aba: 'A', celula: 'D1', valor: 'x', motivo: 'teste' }],
  totalNaoEntendidos: 1,
  observacoes: ['nota'],
  servidor: {
    url: 'https://www.confaz.fazenda.gov.br/x.xlsx',
    data: null,
    tamanho: 1000,
    versao: '0099',
    baixadoEm: '2026-11-09T12:00:00.000Z',
  },
};

const com = (mudanca: Record<string, unknown>) => ({ ...valido, ...mudanca });

describe('S15: validação do InfoDocumento', () => {
  it('válido volta igual, com exatamente os campos conhecidos', () => {
    assert.deepEqual(validarInfoDocumento(valido, 'st', FORMATO_BASE), valido);
    const extra = validarInfoDocumento(
      com({ intruso: '<img src=x onerror=alert(1)>' }),
      'st',
      FORMATO_BASE,
    );
    assert.deepEqual(extra, valido);
    assert.equal(
      validarInfoDocumento(com({ servidor: null }), 'st', FORMATO_BASE)
        ?.servidor,
      null,
    );
  });

  it('qualquer campo de outro tipo: null', () => {
    const errados: Record<string, unknown>[] = [
      { formato: 1 },
      { tipo: 'tipi' },
      { arquivo: 42 },
      { tipoArquivo: 'pdf' },
      { tamanhoArquivo: -1 },
      { tamanhoArquivo: '1000' },
      { importadoEm: 'ontem' },
      { versao: null },
      { vigencia: 1 },
      { quantidades: 'muitas' },
      { quantidades: [{ rotulo: 'x', valor: 'três' }] },
      { naoEntendidos: [{ aba: 'A' }] },
      {
        naoEntendidos: Array.from(
          { length: 201 },
          () => valido.naoEntendidos[0],
        ),
      },
      { totalNaoEntendidos: 1.5 },
      { observacoes: [1] },
      { servidor: 'https://exemplo.invalid' },
      { servidor: { ...valido.servidor, tamanho: 'grande' } },
      { servidor: { ...valido.servidor, baixadoEm: undefined } },
    ];
    for (const m of errados)
      assert.equal(
        validarInfoDocumento(com(m), 'st', FORMATO_BASE),
        null,
        JSON.stringify(m),
      );
    for (const v of [null, 'texto', [], 7])
      assert.equal(validarInfoDocumento(v, 'st', FORMATO_BASE), null);
  });

  it('lerInfoDocumento usa a validação: arquivo adulterado conta como faltando', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'info-'));
    after(() => rmSync(pasta, { recursive: true, force: true }));
    writeFileSync(join(pasta, 'st-info.json'), JSON.stringify(valido));
    assert.deepEqual(lerInfoDocumento('st', pasta), valido);
    writeFileSync(
      join(pasta, 'st-info.json'),
      JSON.stringify(com({ quantidades: { rotulo: 'x' } })),
    );
    assert.equal(lerInfoDocumento('st', pasta), null);
    writeFileSync(join(pasta, 'st-info.json'), '{ quebrado');
    assert.equal(lerInfoDocumento('st', pasta), null);
  });
});
