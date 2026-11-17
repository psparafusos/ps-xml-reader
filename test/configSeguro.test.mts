import assert from 'node:assert/strict';
import {
  existsSync,
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
import {
  ARQ_BAK,
  ARQ_CONFIG,
  ARQ_LOG,
  LIMITE_COPIAS,
  PREFIXO_ILEGIVEL,
  PREFIXO_PERFIS_INVALIDOS,
  criarConfigSeguro,
  recuperarPerfis,
} from '../src/configSeguro.ts';
import { configPadrao } from '../src/nfe/config.ts';
import { perfisParaGravar, validarPerfis } from '../src/nfe/perfis.ts';

// Dados inventados.
const USUARIO = 'Usuario Teste';
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const raiz = mkdtempSync(path.join(tmpdir(), 'ps-config-seguro-'));
let pasta = '';
let n = 0;
let segundo = 0;

const arquivo = (nome: string) => path.join(pasta, nome);
const ler = (nome: string) => readFileSync(arquivo(nome), 'utf8');
const lerJson = (nome: string) => JSON.parse(ler(nome));
const gravar = (nome: string, texto: string) =>
  writeFileSync(arquivo(nome), texto, 'utf8');
const copias = (prefixo: string) =>
  readdirSync(pasta)
    .filter((x) => x.startsWith(prefixo))
    .sort();
const temporarios = () => readdirSync(pasta).filter((x) => x.endsWith('.tmp'));

/** Relógio que anda um segundo a cada leitura (nomes de cópia distintos). */
const novo = () =>
  criarConfigSeguro({
    pasta: () => pasta,
    agora: () => new Date(2026, 10, 16, 10, 0, segundo++),
  });

function perfil(id: string, nome: string, extra: object = {}) {
  const c = configPadrao();
  return {
    id,
    nome,
    colunas: c.colunas,
    anotacoes: c.anotacoes,
    orientacao: c.orientacao,
    layout: c.layout,
    ...extra,
  };
}

const PERFIL_TESTE = perfisParaGravar({
  versao: 1,
  ativo: 'p-teste1',
  lista: [{ id: 'p-teste1', nome: 'Perfil Teste', config: configPadrao() }],
  fornecedores: {},
});

beforeEach(() => {
  pasta = path.join(raiz, `caso-${++n}`);
  mkdirSync(pasta, { recursive: true });
});

after(() => rmSync(raiz, { recursive: true, force: true }));

describe('gravação', () => {
  it('junta a parte nova, troca pelo rename e não deixa temporário', async () => {
    const c = novo();
    await c.gravar({ pastaDestino: 'C:\\Destino' });
    await c.gravar({ cnpjEmpresa: '11222333000181' });
    assert.deepEqual(lerJson(ARQ_CONFIG), {
      pastaDestino: 'C:\\Destino',
      cnpjEmpresa: '11222333000181',
    });
    assert.deepEqual(temporarios(), []);
  });

  it('erro antes da troca deixa o config.json intacto', async () => {
    const c = novo();
    await c.gravar({ a: 1 });
    const antes = ler(ARQ_CONFIG);
    await assert.rejects(c.gravar({ b: 10n }));
    assert.equal(ler(ARQ_CONFIG), antes);
    assert.deepEqual(temporarios(), []);
  });

  it('temporário de uma gravação interrompida não atrapalha e é limpo', async () => {
    gravar(ARQ_CONFIG, json({ a: 1 }));
    gravar(`${ARQ_CONFIG}.99999.1.tmp`, '{"a": 1, "b"');
    const c = novo();
    assert.deepEqual(await c.ler(), { a: 1 });
    await c.gravar({ b: 2 });
    assert.deepEqual(lerJson(ARQ_CONFIG), { a: 1, b: 2 });
    assert.deepEqual(temporarios(), []);
  });

  it('fila: gravações ao mesmo tempo, uma por vez e na ordem', async () => {
    const c = novo();
    const ordem: string[] = [];
    const lenta = c.naFila(async () => {
      await new Promise((r) => setTimeout(r, 30));
      ordem.push('lenta');
    });
    const todas = Array.from({ length: 30 }, (_, i) =>
      c.gravar({ [`k${i}`]: i, ultimo: i }).then(() => ordem.push(`k${i}`)),
    );
    await Promise.all([lenta, ...todas]);
    const final = lerJson(ARQ_CONFIG);
    for (let i = 0; i < 30; i++) assert.equal(final[`k${i}`], i);
    assert.equal(final.ultimo, 29);
    assert.equal(ordem[0], 'lenta');
    assert.deepEqual(
      ordem.slice(1),
      Array.from({ length: 30 }, (_, i) => `k${i}`),
    );
  });

  it('gravação síncrona e assíncrona juntas não se perdem', async () => {
    const c = novo();
    const p = c.gravar({ perfis: PERFIL_TESTE });
    c.gravarSync({ janela: { x: 1 } });
    await p;
    assert.deepEqual(lerJson(ARQ_CONFIG), {
      janela: { x: 1 },
      perfis: PERFIL_TESTE,
    });
  });
});

describe('config.json.bak', () => {
  it('guarda a versão anterior válida antes de trocar', async () => {
    const c = novo();
    await c.gravar({ a: 1 });
    assert.equal(existsSync(arquivo(ARQ_BAK)), false);
    await c.gravar({ b: 2 });
    assert.deepEqual(lerJson(ARQ_BAK), { a: 1 });
    await c.gravar({ c: 3 });
    assert.deepEqual(lerJson(ARQ_BAK), { a: 1, b: 2 });
    assert.deepEqual(lerJson(ARQ_CONFIG), { a: 1, b: 2, c: 3 });
  });

  it('gravação igual ao que está no disco não mexe no .bak', async () => {
    const c = novo();
    await c.gravar({ a: 1 });
    await c.gravar({ a: 2 });
    await c.gravar({ a: 2 });
    assert.deepEqual(lerJson(ARQ_BAK), { a: 1 });
  });

  it('nunca grava por cima de um config.json que não conseguiu ler', async () => {
    // Uma pasta no lugar do arquivo: erro de leitura que não passa.
    mkdirSync(arquivo(ARQ_CONFIG));
    gravar(ARQ_BAK, json({ pastaDestino: 'C:\\Destino' }));
    const c = novo();
    assert.deepEqual(await c.ler(), { pastaDestino: 'C:\\Destino' });
    await assert.rejects(c.gravar({ a: 1 }));
    assert.throws(() => c.gravarSync({ a: 1 }));
    assert.deepEqual(lerJson(ARQ_BAK), { pastaDestino: 'C:\\Destino' });
    // Perfis: lidos do .bak, nada gravado.
    const perfis = await c.lerPerfis(USUARIO);
    assert.equal(perfis.lista[0].nome, USUARIO);
    assert.deepEqual(lerJson(ARQ_BAK), { pastaDestino: 'C:\\Destino' });
    assert.deepEqual(c.tirarAvisos(), []);
  });
});

describe('leitura', () => {
  it('primeira execução: vazio, perfil com o nome do usuário, sem cópia nem aviso', async () => {
    const c = novo();
    assert.deepEqual(await c.ler(), {});
    assert.deepEqual(c.lerSync(), {});
    const perfis = await c.lerPerfis(USUARIO);
    assert.deepEqual(
      perfis.lista.map((p) => p.nome),
      [USUARIO],
    );
    assert.deepEqual(validarPerfis(lerJson(ARQ_CONFIG).perfis), perfis);
    assert.deepEqual(copias(PREFIXO_ILEGIVEL), []);
    assert.deepEqual(copias(PREFIXO_PERFIS_INVALIDOS), []);
    assert.deepEqual(c.tirarAvisos(), []);
  });

  it('primeira execução com pedidos ao mesmo tempo: um perfil só', async () => {
    const c = novo();
    const lidos = await Promise.all([
      c.lerPerfis(USUARIO),
      c.lerPerfis(USUARIO),
      c.lerPerfis(USUARIO),
    ]);
    const ids = new Set(lidos.map((p) => p.lista[0].id));
    assert.equal(ids.size, 1);
    assert.equal(lerJson(ARQ_CONFIG).perfis.lista[0].id, [...ids][0]);
  });

  it('arquivo cortado com .bak válido: volta o .bak e o cortado fica guardado', async () => {
    const cortado =
      '{\n  "pastaDestino": "C:\\\\Destino",\n  "perfis": {\n    "ver';
    gravar(ARQ_CONFIG, cortado);
    gravar(
      ARQ_BAK,
      json({ pastaDestino: 'C:\\Destino', perfis: PERFIL_TESTE }),
    );
    const c = novo();
    const config = await c.ler();
    assert.deepEqual(config, {
      pastaDestino: 'C:\\Destino',
      perfis: PERFIL_TESTE,
    });
    const [copia] = copias(PREFIXO_ILEGIVEL);
    assert.match(copia, /^config-ilegivel-2026-11-16_10-00-\d{2}\.json$/);
    assert.equal(ler(copia), cortado);
    assert.deepEqual(lerJson(ARQ_CONFIG), config);
    const avisos = c.tirarAvisos();
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].arquivo, copia);
    assert.ok(avisos[0].mensagem.includes(copia));
    assert.deepEqual(c.tirarAvisos(), [], 'o aviso sai uma vez só');
    const perfis = await c.lerPerfis(USUARIO);
    assert.deepEqual(
      perfis.lista.map((p) => p.nome),
      ['Perfil Teste'],
    );
    assert.ok(ler(ARQ_LOG).includes(copia));
  });

  it('arquivo vazio (0 bytes) também é cortado', () => {
    gravar(ARQ_CONFIG, '');
    gravar(ARQ_BAK, json({ a: 1 }));
    const c = novo();
    assert.deepEqual(c.lerSync(), { a: 1 });
    assert.equal(copias(PREFIXO_ILEGIVEL).length, 1);
  });

  it('arquivo cortado sem .bak: guarda o cortado e segue vazio', async () => {
    gravar(ARQ_CONFIG, '{"perfis": {"versao": 1, "ativo": "p-');
    const c = novo();
    assert.deepEqual(await c.ler(), {});
    const [copia] = copias(PREFIXO_ILEGIVEL);
    assert.equal(ler(copia), '{"perfis": {"versao": 1, "ativo": "p-');
    assert.equal(existsSync(arquivo(ARQ_CONFIG)), false);
    const avisos = c.tirarAvisos();
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].mensagem.includes(copia));
    // Sem nada aproveitável, o perfil com o nome do usuário.
    const perfis = await c.lerPerfis(USUARIO);
    assert.equal(perfis.lista[0].nome, USUARIO);
  });

  it('cortado na gravação síncrona (fechar a janela): o .bak é a base', () => {
    gravar(ARQ_CONFIG, '{"pastaDes');
    gravar(
      ARQ_BAK,
      json({ pastaDestino: 'C:\\Destino', perfis: PERFIL_TESTE }),
    );
    const c = novo();
    c.gravarSync({ janela: { x: 1 } });
    assert.deepEqual(lerJson(ARQ_CONFIG), {
      pastaDestino: 'C:\\Destino',
      perfis: PERFIL_TESTE,
      janela: { x: 1 },
    });
    assert.equal(copias(PREFIXO_ILEGIVEL).length, 1);
  });

  it('config.json sumido com .bak válido: volta o .bak', async () => {
    gravar(ARQ_BAK, json({ a: 1 }));
    const c = novo();
    assert.deepEqual(await c.ler(), { a: 1 });
    assert.deepEqual(lerJson(ARQ_CONFIG), { a: 1 });
    assert.equal(c.tirarAvisos().length, 1);
  });

  it('JSON que não é objeto conta como ilegível; BOM é aceito', () => {
    gravar(ARQ_CONFIG, '[1, 2]');
    assert.deepEqual(novo().lerSync(), {});
    assert.equal(copias(PREFIXO_ILEGIVEL).length, 1);
    gravar(ARQ_CONFIG, `\uFEFF${json({ a: 1 })}`);
    assert.deepEqual(novo().lerSync(), { a: 1 });
    assert.equal(copias(PREFIXO_ILEGIVEL).length, 1);
  });

  it(`ficam só as ${LIMITE_COPIAS} cópias mais recentes`, () => {
    const c = novo();
    const guardadas: string[] = [];
    for (let i = 0; i < 5; i++) {
      gravar(ARQ_CONFIG, `{"corte": ${i}`);
      c.lerSync();
      guardadas.push(c.tirarAvisos()[0].arquivo as string);
    }
    assert.deepEqual(copias(PREFIXO_ILEGIVEL), guardadas.slice(2).sort());
    assert.equal(ler(guardadas[4]), '{"corte": 4');
  });
});

describe('perfis', () => {
  const ruim = {
    // Coluna que esta versão não conhece e o bloco de itens escondido.
    colunas: [
      { id: 'ncm', visivel: false },
      { id: 'coluna-futura', visivel: true },
      { id: 'codigo', visivel: true },
    ],
    layout: {
      blocos: [
        { id: 'emitente', visivel: false, largura: 6 },
        { id: 'itens', visivel: false, largura: 12 },
      ],
    },
  };

  it('um perfil inválido entre válidos: nomes, ids e ativo continuam', async () => {
    const original = {
      versao: 1,
      ativo: 'p-bbb222',
      lista: [
        perfil('p-aaa111', 'Conferente'),
        perfil('p-bbb222', 'Eli Teste', ruim),
        perfil('p-ccc333', 'Fiscal', { orientacao: 'paisagem' }),
      ],
      fornecedores: {},
    };
    gravar(ARQ_CONFIG, json({ pastaDestino: 'C:\\Destino', perfis: original }));
    const c = novo();
    const perfis = await c.lerPerfis(USUARIO);
    assert.deepEqual(
      perfis.lista.map((p) => [p.id, p.nome]),
      [
        ['p-aaa111', 'Conferente'],
        ['p-bbb222', 'Eli Teste'],
        ['p-ccc333', 'Fiscal'],
      ],
    );
    assert.equal(perfis.ativo, 'p-bbb222');
    assert.equal(perfis.lista[2].config.orientacao, 'paisagem');
    // No perfil inválido, só o que estava inválido voltou ao padrão.
    const eli = perfis.lista[1].config;
    assert.deepEqual(eli.colunas.slice(0, 2), [
      { id: 'ncm', visivel: false },
      { id: 'codigo', visivel: true },
    ]);
    assert.equal(
      eli.colunas.some((x) => x.id === 'coluna-futura'),
      false,
    );
    assert.deepEqual(eli.layout.blocos[0], {
      id: 'emitente',
      visivel: false,
      largura: 6,
    });
    assert.equal(
      eli.layout.blocos.find((b) => b.id === 'itens')?.visivel,
      true,
    );
    // Gravado, válido e com a cópia do original.
    const gravado = lerJson(ARQ_CONFIG);
    assert.equal(gravado.pastaDestino, 'C:\\Destino');
    assert.deepEqual(validarPerfis(gravado.perfis), perfis);
    const [copia] = copias(PREFIXO_PERFIS_INVALIDOS);
    assert.deepEqual(lerJson(copia), original);
    const avisos = c.tirarAvisos();
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].mensagem.includes('Eli Teste'));
    assert.ok(avisos[0].mensagem.includes(copia));
    // A próxima leitura já é normal: sem cópia nova.
    await c.lerPerfis(USUARIO);
    assert.equal(copias(PREFIXO_PERFIS_INVALIDOS).length, 1);
  });

  it('todos os perfis inválidos: mantêm id e nome, com o padrão', async () => {
    const original = {
      versao: 1,
      ativo: 'p-bbb222',
      lista: [
        perfil('p-aaa111', 'Conferente', { colunas: 'nada', layout: null }),
        perfil('p-bbb222', 'Eli Teste', { anotacoes: 7 }),
      ],
      fornecedores: {},
    };
    gravar(ARQ_CONFIG, json({ perfis: original }));
    const c = novo();
    const perfis = await c.lerPerfis(USUARIO);
    assert.deepEqual(
      perfis.lista.map((p) => [p.id, p.nome]),
      [
        ['p-aaa111', 'Conferente'],
        ['p-bbb222', 'Eli Teste'],
      ],
    );
    assert.equal(perfis.ativo, 'p-bbb222');
    assert.deepEqual(perfis.lista[0].config, configPadrao());
    assert.equal(copias(PREFIXO_PERFIS_INVALIDOS).length, 1);
  });

  it('nenhum perfil aproveitável: perfil com o nome do usuário, com cópia e aviso', async () => {
    const original = { versao: 1, ativo: 'x', lista: ['texto', 42] };
    gravar(ARQ_CONFIG, json({ perfis: original }));
    const c = novo();
    const perfis = await c.lerPerfis(USUARIO);
    assert.deepEqual(
      perfis.lista.map((p) => p.nome),
      [USUARIO],
    );
    const [copia] = copias(PREFIXO_PERFIS_INVALIDOS);
    assert.deepEqual(lerJson(copia), original);
    const avisos = c.tirarAvisos();
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].mensagem.includes(USUARIO));
  });

  it('nomes e ids com problema: corrigidos sem perder o perfil', () => {
    const longo = 'N'.repeat(60);
    const r = recuperarPerfis({
      versao: 1,
      ativo: 'p-1',
      lista: [
        perfil('p-1', 'Compras'),
        perfil('p-1', 'compras'),
        perfil('', ''),
        perfil('p-4', longo),
      ],
    });
    assert.ok(r.perfis);
    const nomes = r.perfis.lista.map((p) => p.nome);
    assert.deepEqual(nomes, [
      'Compras',
      'compras (2)',
      'Perfil recuperado',
      'N'.repeat(40),
    ]);
    assert.equal(new Set(r.perfis.lista.map((p) => p.id)).size, 4);
    assert.equal(r.perfis.ativo, 'p-1');
    assert.doesNotThrow(() => validarPerfis(perfisParaGravar(r.perfis!)));
  });

  it(`perfis inválidos: ficam só as ${LIMITE_COPIAS} cópias mais recentes`, async () => {
    for (let i = 0; i < 5; i++) {
      gravar(ARQ_CONFIG, json({ perfis: { versao: 1, lista: [i] } }));
      await novo().lerPerfis(USUARIO);
    }
    const restantes = copias(PREFIXO_PERFIS_INVALIDOS);
    assert.equal(restantes.length, LIMITE_COPIAS);
    assert.deepEqual(lerJson(restantes[2]), { versao: 1, lista: [4] });
  });
});
