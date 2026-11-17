import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { copiasDePerfis, guardarCopiaPerfil } from '../src/perfisExcluidos.ts';
import { configPadrao, idDaAnotacao } from '../src/nfe/config.ts';
import {
  LIMITE_PERFIS_EXCLUIDOS,
  PASTA_PERFIS_EXCLUIDOS,
  lerArquivoPerfil,
  type Perfil,
} from '../src/nfe/perfis.ts';
import { listarDadosApp } from '../src/dadosApp.ts';

// Perfis inventados.
const raiz = mkdtempSync(path.join(tmpdir(), 'ps-perfis-excluidos-'));
let pasta = '';
let n = 0;

const dir = () => path.join(pasta, PASTA_PERFIS_EXCLUIDOS);
const nomes = () => readdirSync(dir()).sort();

function perfil(nome: string): Perfil {
  const config = configPadrao();
  config.orientacao = 'paisagem';
  const id = idDaAnotacao('Lote Teste');
  config.anotacoes.push({ id, titulo: 'Lote Teste' });
  config.colunas.push({ id, visivel: true });
  return { id: `p-${nome.length}`, nome, config };
}

beforeEach(() => {
  pasta = path.join(raiz, `caso-${++n}`);
  mkdirSync(pasta, { recursive: true });
});

after(() => rmSync(raiz, { recursive: true, force: true }));

describe('cópia dos perfis excluídos e substituídos', () => {
  it('grava em perfis-excluidos no formato do Exportar, e o Importar lê de volta', () => {
    const p = perfil('Fiscal Teste');
    const caminho = guardarCopiaPerfil(
      pasta,
      p,
      'excluido',
      new Date(2026, 10, 17, 9, 5, 7),
    );
    assert.equal(path.dirname(caminho), dir());
    assert.equal(
      path.basename(caminho),
      '2026-11-17_09-05-07 excluido - PS Reader - perfil Fiscal Teste.json',
    );
    const lido = lerArquivoPerfil(readFileSync(caminho, 'utf8'));
    assert.equal(lido.nome, 'Fiscal Teste');
    assert.deepEqual(lido.config, p.config);
  });

  it('o motivo vai no nome: substituído e antes do padrão', () => {
    const agora = new Date(2026, 10, 17, 9, 0, 0);
    guardarCopiaPerfil(pasta, perfil('Conferente Teste'), 'substituido', agora);
    guardarCopiaPerfil(pasta, perfil('Conferente Teste'), 'padrao', agora);
    assert.deepEqual(nomes(), [
      '2026-11-17_09-00-00 substituido - PS Reader - perfil Conferente Teste.json',
      '2026-11-17_09-00-00-2 antes do padrao - PS Reader - perfil Conferente Teste.json',
    ]);
  });

  it('nome com caractere que o Windows recusa fica limpo no arquivo', () => {
    const caminho = guardarCopiaPerfil(
      pasta,
      perfil('Teste: A/B?'),
      'excluido',
      new Date(2026, 10, 17, 9, 0, 0),
    );
    assert.match(
      path.basename(caminho),
      / - PS Reader - perfil Teste AB\.json$/,
    );
    assert.equal(
      lerArquivoPerfil(readFileSync(caminho, 'utf8')).nome,
      'Teste: A/B?',
    );
  });

  it(`ficam as ${LIMITE_PERFIS_EXCLUIDOS} mais recentes, e arquivo de outro nome fica`, () => {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(path.join(dir(), 'anotacao da pessoa.txt'), 'texto');
    for (let s = 0; s < LIMITE_PERFIS_EXCLUIDOS + 3; s++)
      guardarCopiaPerfil(
        pasta,
        perfil(`Teste ${s}`),
        'excluido',
        new Date(2026, 10, 17, 9, 0, s),
      );
    const copias = copiasDePerfis(pasta);
    assert.equal(copias.length, LIMITE_PERFIS_EXCLUIDOS);
    // A mais nova primeiro; as três mais antigas saíram.
    assert.match(copias[0], /perfil Teste 12\.json$/);
    assert.match(copias.at(-1) ?? '', /perfil Teste 3\.json$/);
    assert.ok(nomes().includes('anotacao da pessoa.txt'));
  });

  it('no mesmo segundo, a de número maior conta como a mais nova', () => {
    const agora = new Date(2026, 10, 17, 9, 0, 0);
    for (let i = 0; i < 3; i++)
      guardarCopiaPerfil(pasta, perfil(`Teste ${i}`), 'excluido', agora);
    assert.deepEqual(
      copiasDePerfis(pasta).map((x) => x.slice(0, 22)),
      [
        '2026-11-17_09-00-00-3 ',
        '2026-11-17_09-00-00-2 ',
        '2026-11-17_09-00-00 ex',
      ],
    );
  });

  it('sem a pasta, nenhuma cópia', () => {
    assert.deepEqual(copiasDePerfis(pasta), []);
  });

  it('não grava: lança, e quem chama não mexe no perfil', () => {
    // Um arquivo no lugar da pasta: não dá para criar perfis-excluidos.
    writeFileSync(dir(), 'não é pasta');
    assert.throws(() =>
      guardarCopiaPerfil(
        pasta,
        perfil('Fiscal Teste'),
        'excluido',
        new Date(2026, 10, 17, 9, 0, 0),
      ),
    );
  });

  it('a pasta aparece em Dados do app, fora do backup', async () => {
    guardarCopiaPerfil(
      pasta,
      perfil('Fiscal Teste'),
      'excluido',
      new Date(2026, 10, 17, 9, 0, 0),
    );
    const item = (await listarDadosApp(pasta)).find(
      (i) => i.nome === PASTA_PERFIS_EXCLUIDOS,
    );
    assert.ok(item, 'a pasta não está na lista');
    assert.equal(item.noBackup, false);
    assert.match(item.oQueE, /1 cópia/);
    assert.ok(item.tamanho > 0);
  });
});
