import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { ARQ_LOG } from '../src/configSeguro.ts';
import {
  DIAS_RASCUNHO,
  LIMITE_BYTES_RASCUNHO,
  PASTA_RASCUNHOS,
  SUFIXO_RECUPERADO,
  criarRascunhos,
  idDoRascunho,
  idValido,
  interpretarRascunho,
  type DadosRascunho,
} from '../src/rascunhos.ts';

// Dados inventados.
const CHAVE = '28261100000000000191550010000001231000001230';
const raiz = mkdtempSync(path.join(tmpdir(), 'ps-rascunhos-'));
let pasta = '';
let n = 0;
let relogio = new Date('2026-11-17T10:00:00.000Z');

const rascunhos = () =>
  criarRascunhos({ pasta: () => pasta, agora: () => relogio });
const dirRascunhos = () => path.join(pasta, PASTA_RASCUNHOS);
const arquivos = () => {
  try {
    return readdirSync(dirRascunhos()).sort();
  } catch {
    return [];
  }
};
const log = () => {
  try {
    return readFileSync(path.join(pasta, ARQ_LOG), 'utf8');
  } catch {
    return '';
  }
};

function dados(extra: Partial<DadosRascunho> = {}): DadosRascunho {
  return {
    chave: CHAVE,
    caminho: 'C:\\Notas\\Teste\\nota-123.xml',
    tipo: 'xml',
    pastaDestino: 'C:\\Conferidas',
    fornecedor: 'Fornecedor Teste',
    numero: '123',
    serie: '1',
    versaoApp: '9.9.9',
    psxml: '<?xml version="1.0"?><psCopiaEditada/>',
    ...extra,
  };
}

beforeEach(() => {
  pasta = path.join(raiz, `caso-${++n}`);
  relogio = new Date('2026-11-17T10:00:00.000Z');
});
after(() => rmSync(raiz, { recursive: true, force: true }));

describe('rascunhos: gravar, ler, listar e apagar', () => {
  it('grava na subpasta rascunhos com tudo o que a nota tem', () => {
    const r = rascunhos();
    const g = r.gravar(dados());
    assert.deepEqual(g, { status: 'gravado', id: `nfe-${CHAVE}` });
    assert.deepEqual(arquivos(), [`nfe-${CHAVE}.json`]);
    const lido = r.ler(`nfe-${CHAVE}`);
    assert.ok(lido);
    assert.equal(lido.versao, 1);
    assert.equal(lido.alteradoEm, '2026-11-17T10:00:00.000Z');
    assert.equal(lido.caminho, 'C:\\Notas\\Teste\\nota-123.xml');
    assert.equal(lido.tipo, 'xml');
    assert.equal(lido.pastaDestino, 'C:\\Conferidas');
    assert.equal(lido.fornecedor, 'Fornecedor Teste');
    assert.equal(lido.numero, '123');
    assert.equal(lido.serie, '1');
    assert.equal(lido.versaoApp, '9.9.9');
    assert.equal(lido.psxml, dados().psxml);
  });

  it('a mesma nota regrava o mesmo rascunho (um por nota)', () => {
    const r = rascunhos();
    r.gravar(dados({ psxml: '<a/>' }));
    relogio = new Date('2026-11-17T10:05:00.000Z');
    r.gravar(
      dados({ psxml: '<b/>', caminho: 'C:\\Outro\\nota_Conferencia.psxml' }),
    );
    assert.equal(arquivos().length, 1);
    const lido = r.ler(`nfe-${CHAVE}`);
    assert.equal(lido?.psxml, '<b/>');
    assert.equal(lido?.alteradoEm, '2026-11-17T10:05:00.000Z');
  });

  it('lista do alterado mais recente para o mais antigo e ignora o inválido', () => {
    const r = rascunhos();
    r.gravar(dados({ chave: CHAVE.replace(/0$/, '2'), numero: '1' }));
    relogio = new Date('2026-11-17T11:00:00.000Z');
    r.gravar(dados({ chave: CHAVE.replace(/0$/, '3'), numero: '2' }));
    writeFileSync(path.join(dirRascunhos(), 'nfe-lixo.json'), '{');
    writeFileSync(
      path.join(dirRascunhos(), `nfe-${CHAVE.replace(/0$/, '4')}.json`),
      'não é json',
    );
    assert.deepEqual(
      r.listar().map((x) => x.numero),
      ['2', '1'],
    );
  });

  it('arquivo renomeado não vale por outra nota', () => {
    const r = rascunhos();
    r.gravar(dados());
    const outra = CHAVE.replace(/0$/, '9');
    const texto = readFileSync(
      path.join(dirRascunhos(), `nfe-${CHAVE}.json`),
      'utf8',
    );
    writeFileSync(path.join(dirRascunhos(), `nfe-${outra}.json`), texto);
    assert.equal(r.ler(`nfe-${outra}`), null);
    assert.equal(r.listar().length, 1);
  });

  it('apaga só o rascunho pedido, e só por id', () => {
    const r = rascunhos();
    r.gravar(dados());
    r.gravar(dados({ chave: null, caminho: 'C:\\Notas\\sem-chave.xml' }));
    assert.equal(r.apagar(`nfe-${CHAVE}`), true);
    assert.equal(r.apagar(`nfe-${CHAVE}`), false);
    assert.equal(r.apagar('..\\config'), false);
    assert.equal(r.apagar('C:\\Windows\\win.ini'), false);
    assert.equal(r.listar().length, 1);
  });

  it('pasta de dados sem rascunhos: lista vazia, ler null', () => {
    const r = rascunhos();
    assert.deepEqual(r.listar(), []);
    assert.equal(r.ler(`nfe-${CHAVE}`), null);
  });
});

describe('rascunhos: nota sem chave', () => {
  it('o id vem do caminho, sem diferenciar maiúsculas', () => {
    const a = idDoRascunho(null, 'C:\\Notas\\Sem Chave.xml');
    const b = idDoRascunho(null, 'c:\\notas\\sem chave.XML');
    assert.equal(a, b);
    assert.match(a, /^arquivo-[0-9a-f]{32}$/);
    assert.notEqual(a, idDoRascunho(null, 'C:\\Notas\\outra.xml'));
    // Chave que não tem 44 dígitos não conta como chave.
    assert.equal(idDoRascunho('123', 'C:\\Notas\\Sem Chave.xml'), a);
  });

  it('grava, lê e apaga pelo id do caminho', () => {
    const r = rascunhos();
    const g = r.gravar(dados({ chave: null, caminho: 'C:\\Notas\\x.xml' }));
    assert.equal(g.status, 'gravado');
    const lido = r.ler(g.id);
    assert.equal(lido?.chave, null);
    assert.equal(r.apagar(g.id), true);
    assert.deepEqual(arquivos(), []);
  });

  it('idValido recusa caminhos e nomes estranhos', () => {
    assert.ok(idValido(`nfe-${CHAVE}`));
    assert.ok(idValido(`arquivo-${'a'.repeat(32)}`));
    for (const ruim of [
      '',
      'nfe-123',
      `nfe-${CHAVE}.json`,
      '..\\nfe',
      `arquivo-${'A'.repeat(32)}`,
      null,
      42,
    ])
      assert.ok(!idValido(ruim), String(ruim));
  });
});

describe('rascunhos: gravação segura', () => {
  it('troca o arquivo inteiro e não deixa temporário', () => {
    const r = rascunhos();
    r.gravar(dados({ psxml: 'x'.repeat(5000) }));
    r.gravar(dados({ psxml: '<curto/>' }));
    assert.deepEqual(arquivos(), [`nfe-${CHAVE}.json`]);
    const texto = readFileSync(
      path.join(dirRascunhos(), `nfe-${CHAVE}.json`),
      'utf8',
    );
    assert.ok(interpretarRascunho(texto));
    assert.equal(interpretarRascunho(texto)?.psxml, '<curto/>');
  });

  it('a abertura apaga temporários de outro processo e as cópias recuperadas', () => {
    const r = rascunhos();
    r.gravar(dados());
    const lido = r.ler(`nfe-${CHAVE}`);
    assert.ok(lido);
    const recuperado = r.gravarRecuperado(lido);
    assert.equal(readFileSync(recuperado, 'utf8'), lido.psxml);
    assert.ok(recuperado.endsWith(SUFIXO_RECUPERADO));
    assert.ok(r.dentroDaPasta(recuperado));
    assert.ok(!r.dentroDaPasta(path.join(pasta, 'config.json')));
    assert.ok(!r.dentroDaPasta(dirRascunhos()));
    const preso = path.join(
      dirRascunhos(),
      `nfe-${CHAVE}.json.${process.pid + 1}.7.tmp`,
    );
    writeFileSync(preso, '{"cortado');
    r.limparNaAbertura();
    assert.deepEqual(arquivos(), [`nfe-${CHAVE}.json`]);
  });
});

describe('rascunhos: limites', () => {
  it(`rascunho com mais de ${DIAS_RASCUNHO} dias sai na abertura, com uma linha no log`, () => {
    const r = rascunhos();
    relogio = new Date('2026-10-01T10:00:00.000Z');
    r.gravar(dados({ fornecedor: 'Antigo Teste', numero: '7', serie: '2' }));
    relogio = new Date('2026-10-20T10:00:00.000Z');
    r.gravar(
      dados({ chave: CHAVE.replace(/0$/, '5'), fornecedor: 'Recente Teste' }),
    );
    relogio = new Date('2026-11-17T10:00:00.000Z');
    const apagados = r.limparNaAbertura();
    assert.deepEqual(
      apagados.map((x) => x.fornecedor),
      ['Antigo Teste'],
    );
    assert.deepEqual(
      r.listar().map((x) => x.fornecedor),
      ['Recente Teste'],
    );
    const linhas = log().trim().split('\n');
    assert.equal(linhas.length, 1);
    assert.match(
      linhas[0],
      /^2026-11-17T10:00:00\.000Z Rascunho com mais de 30 dias apagado: Antigo Teste, NF 7 série 2, alterado em 2026-10-01T10:00:00\.000Z\.$/,
    );
  });

  it('exatamente 30 dias ainda fica', () => {
    const r = rascunhos();
    relogio = new Date('2026-10-18T10:00:00.000Z');
    r.gravar(dados());
    relogio = new Date('2026-11-17T10:00:00.000Z');
    assert.deepEqual(r.limparNaAbertura(), []);
    assert.equal(r.listar().length, 1);
  });

  it('acima de 20 MB não grava e registra no log uma vez', () => {
    const r = rascunhos();
    r.gravar(dados({ psxml: '<pequeno/>' }));
    const grande = 'x'.repeat(LIMITE_BYTES_RASCUNHO + 1);
    const g = r.gravar(dados({ psxml: grande }));
    assert.equal(g.status, 'grande-demais');
    r.gravar(dados({ psxml: `${grande}y` }));
    // O rascunho anterior fica como estava.
    assert.equal(r.ler(`nfe-${CHAVE}`)?.psxml, '<pequeno/>');
    assert.deepEqual(arquivos(), [`nfe-${CHAVE}.json`]);
    const linhas = log().trim().split('\n');
    assert.equal(linhas.length, 1);
    assert.match(
      linhas[0],
      /Rascunho não gravado: 20\.0 MB passa do limite de 20 MB \(Fornecedor Teste, NF 123 série 1\)\.$/,
    );
  });

  it('o limite conta bytes, não letras', () => {
    const r = rascunhos();
    // 'ç' tem 2 bytes em UTF-8: metade do limite em letras já passa.
    const g = r.gravar(
      dados({ psxml: 'ç'.repeat(LIMITE_BYTES_RASCUNHO / 2 + 10) }),
    );
    assert.equal(g.status, 'grande-demais');
    assert.ok(!existsSync(path.join(dirRascunhos(), `nfe-${CHAVE}.json`)));
  });
});
