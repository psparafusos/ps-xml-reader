// Data de emissão nos leiautes antigos da NF-e (1.10 e 2.00), que trazem
// dEmi (só a data) em vez de dhEmi, e dSaiEnt/hSaiEnt em vez de dhSaiEnt:
// parser, DANFE, idade da nota e vencimentos das informações complementares.
// NF-e inventadas em test/fixtures/nfe-antigas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { lerDanfe } from '../src/danfe/dados.ts';
import { idadeNota } from '../src/nfe/avisos.ts';
import { resumoConferencia } from '../src/nfe/conferencia.ts';
import {
  lerArquivo,
  lerDocumento,
  localizarOriginal,
} from '../src/nfe/parser.ts';
import { ligarDomMinimo } from './apoioDom.mts';

const fixture = (nome: string) =>
  readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'nfe-antigas', nome),
    'utf8',
  );
const V110 = fixture('nfe-1.10-inventada.xml');
const V200 = fixture('nfe-2.00-inventada.xml');
const danfe = (xml: string) =>
  lerDanfe(localizarOriginal(lerDocumento(xml)).original);

const conferencia = (xml: string, hoje: Date) =>
  resumoConferencia({
    nota: lerArquivo(xml).nota,
    anotacoes: new Map(),
    comQtdRecebida: false,
    cnpjEmpresa: null,
    conferidos: [],
    temPastaDestino: false,
    hoje,
    diasAvisoVencimento: 15,
    diasNotaAntiga: 30,
  });

describe('emissão nos leiautes 1.10 e 2.00 (dEmi)', () => {
  before(ligarDomMinimo);

  it('parser: dEmi vira a data de emissão da nota', () => {
    assert.equal(lerArquivo(V110).nota.ide.dhEmi, '2010-01-15');
    assert.equal(lerArquivo(V200).nota.ide.dhEmi, '2013-05-06');
  });

  it('parser: com dhEmi (3.10 e 4.00) nada muda', () => {
    const v400 = V200.replace(
      '<dEmi>2013-05-06</dEmi>',
      '<dhEmi>2026-11-10T09:15:00-03:00</dhEmi>',
    );
    assert.equal(lerArquivo(v400).nota.ide.dhEmi, '2026-11-10T09:15:00-03:00');
  });

  it('DANFE: emissão de dEmi; saída de dSaiEnt, com hSaiEnt no 2.00', () => {
    const d110 = danfe(V110);
    assert.equal(d110.ide.dhEmi, '2010-01-15');
    assert.equal(d110.ide.dhSaiEnt, '2010-01-16');
    const d200 = danfe(V200);
    assert.equal(d200.ide.dhEmi, '2013-05-06');
    assert.equal(d200.ide.dhSaiEnt, '2013-05-06T14:30:00');
  });

  it('DANFE: sem dSaiEnt a saída fica vazia', () => {
    const sem = V200.replace('<dSaiEnt>2013-05-06</dSaiEnt>', '');
    assert.equal(danfe(sem).ide.dhSaiEnt, '');
  });

  it('idade da nota conta a partir de dEmi', () => {
    const idade = idadeNota(lerArquivo(V200).nota, new Date(2013, 4, 20), 30);
    assert.equal(idade.dias, 14);
    assert.equal(idade.antiga, false);
    assert.match(idade.texto, /06\/05\/2013/);
  });

  it('Conferência: a verificação de idade aparece com a data da emissão', () => {
    const r = conferencia(V110, new Date(2010, 5, 1));
    const idade = r.verificacoes.find((v) => v.id === 'idade');
    assert.ok(idade, 'verificação de idade');
    assert.match(idade.detalhe, /15\/01\/2010/);
  });

  it('vencimentos das informações complementares ganham o ano de dEmi', () => {
    const r = conferencia(V200, new Date(2013, 4, 20));
    const venc = r.verificacoes.find((v) => v.id === 'vencimentos');
    assert.ok(venc, 'verificação de vencimentos');
    const texto = JSON.stringify(venc);
    assert.match(texto, /05\/06\/2013/);
    assert.match(texto, /05\/07\/2013/);
  });
});
