import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  PLANILHAS_CADASTRO,
  converterCelula,
  converterPlanilhas,
  lerCsv,
} from '../../src/cadastro/csv.ts';
import { validarCadastro } from '../../src/cadastro/formato.ts';

const MODELO = new URL('../../docs/modelo-cadastro/', import.meta.url);

describe('planilhas do cadastro (CSV)', () => {
  it('lê ";", aspas dobradas, quebra de linha entre aspas, CRLF e BOM', () => {
    const t = '﻿a;b\r\n"x;y";"diz ""oi"""\r\n"duas\nlinhas";\r\n\r\n';
    assert.deepEqual(lerCsv(t), [
      ['a', 'b'],
      ['x;y', 'diz "oi"'],
      ['duas\nlinhas', ''],
    ]);
  });

  it('converte cada célula pela coluna', () => {
    assert.equal(converterCelula('ativo', 'S'), true);
    assert.equal(converterCelula('ativo', 'Não'), false);
    assert.equal(converterCelula('ativo', 'talvez'), 'talvez');
    assert.equal(converterCelula('custo', '1.234,56'), 1234.56);
    assert.equal(converterCelula('fator', '12.5'), 12.5);
    assert.equal(converterCelula('fator', 'doze'), 'doze');
    assert.equal(
      converterCelula('cnpj_cpf', '12.345.678/0001-95'),
      '12345678000195',
    );
    assert.equal(converterCelula('fornecedor', '1,23457E+13'), '1,23457E+13');
    assert.equal(converterCelula('chave', '2826 1012 3456'), '282610123456');
    assert.equal(converterCelula('entrada', '21/10/2026'), '2026-10-21');
    assert.equal(
      converterCelula('extraido_em', '14/11/2026 12:30'),
      '2026-11-14T12:30',
    );
    assert.equal(converterCelula('codigo_fornecedor', ' 00450 '), ' 00450 ');
    assert.equal(converterCelula('ncm', ''), null);
  });

  it('o modelo de docs/modelo-cadastro vira o mesmo JSON do exemplo do formato', () => {
    const planilhas: Record<string, string> = {};
    for (const nome of PLANILHAS_CADASTRO) {
      const arq = new URL(`${nome}.csv`, MODELO);
      assert.ok(existsSync(arq), `falta ${nome}.csv no modelo`);
      planilhas[nome] = readFileSync(arq, 'utf8');
    }
    const { dados, problemas } = converterPlanilhas(planilhas);
    assert.deepEqual(problemas, []);
    const md = readFileSync(
      new URL('../../docs/formato-cadastro.md', import.meta.url),
      'utf8',
    );
    const exemplo = JSON.parse(/```json\n([\s\S]*?)```/.exec(md)![1]);
    assert.deepEqual(dados, exemplo);
    assert.ok(validarCadastro(dados).ok);
  });

  it('acusa linha com colunas a mais e meta sem a linha de valores', () => {
    const { problemas } = converterPlanilhas({
      meta: 'versao;origem;extraido_em\n',
      vinculos: 'fornecedor;codigo_fornecedor;produto\n1;2;3;sobra\n',
    });
    assert.deepEqual(problemas, [
      'meta.csv deve ter uma linha de valores abaixo do cabeçalho (tem 0).',
      'vinculos.csv, linha 2: 4 colunas, o cabeçalho tem 3 (sobrou conteúdo; confira o separador ";" e as aspas).',
    ]);
  });
});
