import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TEXTO_COPIA_PERFIL,
  textoExcluirPerfil,
  textoImportarRepetido,
  textoPerfilExportado,
  textoRestaurarPadrao,
} from '../src/nfe/textosPerfis.ts';

// Nomes inventados.
/** Travessão (meia-risca e risca), pelos códigos. */
const TRAVESSOES = [0x2013, 0x2014].map((c) => String.fromCharCode(c));
const semTravessao = (t: string) =>
  assert.ok(!TRAVESSOES.some((x) => t.includes(x)), `travessão no texto: ${t}`);

describe('textos das confirmações de perfil', () => {
  it('a cópia: pasta, onde fica, como volta e quantas ficam', () => {
    assert.match(TEXTO_COPIA_PERFIL, /perfis-excluidos/);
    assert.match(TEXTO_COPIA_PERFIL, /pasta de dados do app/);
    assert.match(TEXTO_COPIA_PERFIL, /Importar/);
    assert.match(TEXTO_COPIA_PERFIL, /10 cópias mais recentes/);
  });

  it('excluir diz o que sai, que o .psxml fica, quem vira ativo e a cópia', () => {
    const t = textoExcluirPerfil('Fiscal Teste', 'Conferente Teste');
    assert.match(t, /"Fiscal Teste" sai da lista/);
    assert.match(t, /\.psxml não muda/);
    assert.match(t, /"Conferente Teste" passa a ser o ativo/);
    assert.ok(t.includes(TEXTO_COPIA_PERFIL));
    assert.doesNotMatch(
      textoExcluirPerfil('Fiscal Teste', null),
      /passa a ser o ativo/,
    );
    semTravessao(t);
  });

  it('nome repetido no importar explica Substituir (com a cópia) e Importar como cópia', () => {
    const t = textoImportarRepetido('Fiscal Teste', 'Fiscal Teste (2)');
    assert.match(t, /Já existe um perfil "Fiscal Teste"/);
    assert.match(t, /Substituir:/);
    assert.ok(t.includes(TEXTO_COPIA_PERFIL));
    assert.match(t, /Importar como cópia: os dois ficam.*"Fiscal Teste \(2\)"/);
    semTravessao(t);
  });

  it('restaurar padrão avisa a cópia', () => {
    const t = textoRestaurarPadrao('Fiscal Teste');
    assert.match(t, /"Fiscal Teste" voltam ao padrão/);
    assert.ok(t.includes(TEXTO_COPIA_PERFIL));
    semTravessao(t);
  });

  it('exportado diz como levar para outro computador', () => {
    const t = textoPerfilExportado('Fiscal Teste');
    assert.match(t, /"Fiscal Teste" foi exportado/);
    assert.match(t, /Importar/);
    semTravessao(t);
  });
});
