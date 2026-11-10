// Regras da leitura protegida (src/nfe/leituraProtegida.ts): o que abre em
// leitura, o que pode ser feito nela e os textos combinados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AVISO_SAIR,
  MENSAGEM_RECUSA_GRAVAR,
  ROTULO_USAR_CONFERENCIA,
  TEXTO_FAIXA,
  leituraAoAbrir,
  pedeAviso,
  type AcaoNota,
} from '../src/nfe/leituraProtegida.ts';

const SO_VER: AcaoNota[] = [
  'trocar-modo',
  'zoom',
  'copiar',
  'ordenar',
  'imprimir',
  'salvar-pdf',
];
const EDITAM: AcaoNota[] = [
  'anotar',
  'editar-colunas',
  'perfil',
  'salvar-psxml',
  'salvar-copia',
  'ferramenta',
  'usar-conferencia',
];

describe('leitura protegida: regras', () => {
  it('NF-e abre em leitura protegida; .psxml em edição', () => {
    assert.equal(leituraAoAbrir(false), 'protegida');
    assert.equal(leituraAoAbrir(true), 'edicao');
  });

  it('na leitura protegida, ver, imprimir e salvar PDF não pedem aviso', () => {
    for (const a of SO_VER) assert.equal(pedeAviso(a, 'protegida'), false, a);
  });

  it('na leitura protegida, toda ação que edita pede o aviso', () => {
    for (const a of EDITAM) assert.equal(pedeAviso(a, 'protegida'), true, a);
  });

  it('em edição, nada pede aviso', () => {
    for (const a of [...SO_VER, ...EDITAM])
      assert.equal(pedeAviso(a, 'edicao'), false, a);
  });

  it('textos combinados', () => {
    assert.equal(TEXTO_FAIXA, 'Leitura protegida: só visualização.');
    assert.equal(ROTULO_USAR_CONFERENCIA, 'Usar a Conferência');
    assert.equal(
      AVISO_SAIR.texto,
      'Você vai sair da leitura protegida e começar a editar. O XML original não muda; o que você fizer fica numa cópia (.psxml).',
    );
    assert.equal(AVISO_SAIR.continuar, 'Continuar');
    assert.equal(AVISO_SAIR.ficar, 'Ficar na leitura');
    assert.match(MENSAGEM_RECUSA_GRAVAR, /leitura protegida/);
  });
});
