import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import {
  BackupInvalidoError,
  importarBackup,
  LIMITE_PASTAS_ANTES,
  lerArquivoBackup,
  lerBackup,
  listarDadosApp,
  montarBackup,
  nomeArquivoBackup,
  PREFIXO_ANTES,
  resumoBackup,
  textoBackup,
} from '../src/dadosApp.ts';
import { configPadrao } from '../src/nfe/config.ts';
import { perfisParaGravar } from '../src/nfe/perfis.ts';

// Dados inventados de uma pasta de dados do app, no formato que o app grava.
const perfis = perfisParaGravar({
  versao: 1,
  ativo: 'p-aaa111',
  lista: [
    { id: 'p-aaa111', nome: 'Conferente', config: configPadrao() },
    { id: 'p-bbb222', nome: 'Fiscal', config: configPadrao() },
  ],
  fornecedores: {},
});
const CONFIG = {
  pastaDestino: 'C:\\Conferencias\\Exemplo',
  cnpjEmpresa: '11222333000181',
  diasAvisoVencimento: 10,
  perfis,
  ferramentasPerfis: {
    'p-bbb222': {
      ordem: [
        { id: 'cfops-entrada', visivel: true },
        { id: 'st-mva-cfop', visivel: true },
      ],
      camposST: { mva: false, aliquota: true },
    },
  },
};
const PREFERENCIAS = { verificacaoOnline: false, verificarAoAbrir: false };
const DECISOES = {
  versao: 1,
  decisoes: {
    '11222333|PAR-001': {
      raizCnpj: '11222333',
      fornecedor: 'Ferragens Exemplo Ltda',
      cProd: 'PAR-001',
      xProd: 'Parafuso sextavado 1/4',
      ncm: '73181500',
      escolha: { tipo: 'sem-st' },
      finalidade: 'revenda',
      atualizadaEm: '2026-10-20T10:00:00.000Z',
    },
  },
};

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const raiz = await mkdtemp(path.join(tmpdir(), 'ps-reader-dados-'));
let pasta = '';
let n = 0;

async function popular(p: string): Promise<void> {
  await mkdir(path.join(p, 'documentos'), { recursive: true });
  await writeFile(path.join(p, 'config.json'), json(CONFIG));
  await writeFile(
    path.join(p, 'documentos', 'preferencias.json'),
    json(PREFERENCIAS),
  );
  await writeFile(path.join(p, 'documentos', 'decisoes.json'), json(DECISOES));
  await writeFile(path.join(p, 'documentos', 'st.json'), '{"linhas":[]}');
  await writeFile(path.join(p, 'documentos', 'st-info.json'), '{}');
}

/** Impressão digital de todos os arquivos da pasta (caminho e conteúdo). */
async function digital(p: string): Promise<string> {
  const h = createHash('sha256');
  const andar = async (d: string) => {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const c = path.join(d, e.name);
      if (e.isDirectory()) await andar(c);
      else h.update(path.relative(p, c)).update(await readFile(c));
    }
  };
  await andar(p);
  return h.digest('hex');
}

const lerJson = async (...partes: string[]) =>
  JSON.parse(await readFile(path.join(pasta, ...partes), 'utf8'));

beforeEach(async () => {
  pasta = path.join(raiz, `dados-${++n}`);
  await popular(pasta);
});
after(() => rm(raiz, { recursive: true, force: true }));

describe('dados do app: lista do que o app guarda', () => {
  it('config, perfis, preferências, decisões e documentos lidos, com o que é e tamanho', async () => {
    const itens = await listarDadosApp(pasta);
    const nomes = itens.map((i) => i.nome.replaceAll('\\', '/'));
    assert.deepEqual(nomes, [
      'config.json',
      'config.json (perfis)',
      'documentos/preferencias.json',
      'documentos/decisoes.json',
      'documentos/st-info.json',
      'documentos/st.json',
    ]);
    const config = itens[0];
    assert.equal(
      config.tamanho,
      (await stat(path.join(pasta, 'config.json'))).size,
    );
    assert.match(itens[1].oQueE, /2 perfis/);
    assert.match(itens[5].oQueE, /planilha de ST/);
    assert.deepEqual(
      itens.map((i) => i.noBackup),
      [true, true, true, true, false, false],
    );
  });
});

describe('backup: exportar e importar', () => {
  it('ida e volta igual: exporta, muda tudo, importa e volta ao que era', async () => {
    const antes = {
      config: await lerJson('config.json'),
      preferencias: await lerJson('documentos', 'preferencias.json'),
      decisoes: await lerJson('documentos', 'decisoes.json'),
    };
    const texto = textoBackup(
      await montarBackup(pasta, new Date('2026-11-06T12:00:00Z'), '1.2.2'),
    );
    // Sem os documentos fiscais.
    assert.doesNotMatch(texto, /"linhas"/);

    // Mexe em tudo o que o backup traz (a pasta de destino é deste PC).
    await writeFile(
      path.join(pasta, 'config.json'),
      json({
        pastaDestino: CONFIG.pastaDestino,
        cnpjEmpresa: '11444777000161',
        diasAvisoVencimento: 99,
      }),
    );
    await writeFile(
      path.join(pasta, 'documentos', 'preferencias.json'),
      json({ verificacaoOnline: true, verificarAoAbrir: true }),
    );
    await rm(path.join(pasta, 'documentos', 'decisoes.json'));

    const pastaAntes = await importarBackup(
      pasta,
      lerBackup(texto),
      new Date(2026, 10, 6, 14, 30, 5),
    );
    assert.deepEqual(await lerJson('config.json'), antes.config);
    assert.deepEqual(
      await lerJson('documentos', 'preferencias.json'),
      antes.preferencias,
    );
    assert.deepEqual(
      await lerJson('documentos', 'decisoes.json'),
      antes.decisoes,
    );
    // E exportar de novo dá o mesmo conteúdo.
    const outra = await montarBackup(
      pasta,
      new Date('2026-11-06T12:00:00Z'),
      '1.2.2',
    );
    assert.deepEqual(JSON.parse(textoBackup(outra)), JSON.parse(texto));

    // O que havia antes da importação ficou guardado.
    assert.equal(
      path.basename(pastaAntes),
      `${PREFIXO_ANTES}2026-11-06_14-30-05`,
    );
    assert.deepEqual(
      JSON.parse(await readFile(path.join(pastaAntes, 'config.json'), 'utf8'))
        .cnpjEmpresa,
      '11444777000161',
    );
    assert.equal(
      JSON.parse(
        await readFile(
          path.join(pastaAntes, 'documentos', 'preferencias.json'),
          'utf8',
        ),
      ).verificacaoOnline,
      true,
    );
    // Os documentos lidos não foram tocados.
    assert.equal(
      await readFile(path.join(pasta, 'documentos', 'st.json'), 'utf8'),
      '{"linhas":[]}',
    );
  });

  it('o resumo mostra o que vai substituir', async () => {
    const r = resumoBackup(
      await montarBackup(pasta, new Date('2026-11-06T12:00:00Z'), '1.2.2'),
    );
    assert.equal(r.criadoEm, '2026-11-06T12:00:00.000Z');
    assert.equal(r.versaoApp, '1.2.2');
    assert.deepEqual(
      r.partes.map((p) => [p.id, p.veio, p.valor]),
      [
        ['perfis', true, 'Conferente, Fiscal'],
        ['ferramentas', true, '1 perfil ajustado'],
        ['cnpj', true, '11.222.333/0001-81'],
        ['diasVencimento', true, '10'],
        // Não estava no config.json: não veio.
        ['diasAntiga', false, ''],
        ['preferencias', true, 'desligada'],
        ['decisoes', true, '1'],
      ],
    );
    assert.equal(
      nomeArquivoBackup(new Date(2026, 10, 6, 9)),
      'PS Reader - backup 2026-11-06.psbackup',
    );
  });

  it('duas importações no mesmo segundo não sobrescrevem a cópia de antes', async () => {
    const b = lerBackup(
      textoBackup(await montarBackup(pasta, new Date(), '1.2.2')),
    );
    const agora = new Date(2026, 10, 6, 8, 0, 0);
    const a1 = await importarBackup(pasta, b, agora);
    const a2 = await importarBackup(pasta, b, agora);
    assert.notEqual(a1, a2);
    assert.match(path.basename(a2), /-2$/);
  });

  it('arquivo estranho é recusado sem tocar nos dados', async () => {
    const original = await digital(pasta);
    const valido = JSON.parse(
      textoBackup(await montarBackup(pasta, new Date(), '1.2.2')),
    );
    const estranhos = [
      'isto não é json',
      '',
      '[]',
      json({ formato: 'outro-app', versao: 1 }),
      json({ ...valido, versao: 99 }),
      json({ ...valido, criadoEm: 'ontem' }),
      json({ ...valido, config: 'texto' }),
      json({ ...valido, config: { perfis: { versao: 1, lista: [] } } }),
      json({ ...valido, preferencias: { verificacaoOnline: 'sim' } }),
      json({
        ...valido,
        decisoes: { versao: 1, decisoes: { 'x|y': { cProd: 'y' } } },
      }),
      // Um perfil exportado não é um backup.
      json({ tipo: 'perfil-ps-reader', versao: 1, nome: 'Conferente' }),
    ];
    for (const texto of estranhos) {
      assert.throws(
        () => lerBackup(texto),
        BackupInvalidoError,
        `deveria recusar: ${texto.slice(0, 40)}`,
      );
    }
    assert.equal(await digital(pasta), original);
    const nomes = await readdir(pasta);
    assert.ok(!nomes.some((x) => x.startsWith(PREFIXO_ANTES)));
  });

  it('versão mais nova diz para atualizar o app', () => {
    assert.throws(
      () =>
        lerBackup(
          json({
            formato: 'ps-reader-backup',
            versao: 2,
            criadoEm: '2026-11-06T12:00:00Z',
            config: {},
          }),
        ),
      /mais nova.*Atualize o app/,
    );
  });
});

describe('backup: arquivo de origem desconhecida', () => {
  const valido = async () =>
    JSON.parse(textoBackup(await montarBackup(pasta, new Date(), '1.2.2')));

  it('backup com 6 MB é recusado antes de ser lido, sem tocar nos dados', async () => {
    const original = await digital(pasta);
    const grande = path.join(raiz, `grande-${n}.psbackup`);
    // Um backup válido com 6 MB de espaços no fim: o tamanho basta para recusar.
    await writeFile(grande, json(await valido()) + ' '.repeat(6 * 1024 * 1024));
    await assert.rejects(lerArquivoBackup(grande), (e: Error) => {
      assert.ok(e instanceof BackupInvalidoError);
      assert.match(e.message, /no máximo 5 MB/);
      return true;
    });
    assert.equal(await digital(pasta), original);
  });

  it('backup pequeno do disco é lido e validado', async () => {
    const arq = path.join(raiz, `ok-${n}.psbackup`);
    await writeFile(arq, json(await valido()));
    assert.deepEqual((await lerArquivoBackup(arq)).decisoes, DECISOES);
  });

  it('uma decisão inválida recusa o pacote inteiro e nada muda', async () => {
    const original = await digital(pasta);
    const b = await valido();
    b.config.cnpjEmpresa = '11444777000161';
    b.decisoes.decisoes['11222333|OUTRO'] = {
      ...DECISOES.decisoes['11222333|PAR-001'],
      cProd: 'OUTRO',
      escolha: { tipo: 'manual', cfop: 'abc', mva: null, motivo: '' },
    };
    assert.throws(() => lerBackup(json(b)), /decisões lembradas.*inválida/);
    assert.equal(await digital(pasta), original);
  });

  it('cada parte da configuração passa pelo seu validador', async () => {
    const original = await digital(pasta);
    const casos: [string, (c: Record<string, unknown>) => void, RegExp][] = [
      ['CNPJ', (c) => (c.cnpjEmpresa = '123'), /CNPJ/],
      ['dias', (c) => (c.diasNotaAntiga = -5), /dias/],
      ['dias texto', (c) => (c.diasAvisoVencimento = '10'), /dias/],
      [
        'ferramentas de perfil que não existe',
        (c) => (c.ferramentasPerfis = { 'p-zzz': { ordem: [] } }),
        /ferramentas/,
      ],
      [
        'ferramenta desconhecida',
        (c) =>
          (c.ferramentasPerfis = {
            'p-aaa111': { ordem: [{ id: 'apagar-tudo', visivel: true }] },
          }),
        /ferramentas/,
      ],
      [
        'campo da ST que não é booleano',
        (c) =>
          (c.ferramentasPerfis = {
            'p-aaa111': { ordem: [], camposST: { mva: 'sim' } },
          }),
        /ferramentas/,
      ],
      [
        'notas recentes estragadas',
        (c) => (c.notasRecentes = [{ caminho: 42 }]),
        /notas recentes/,
      ],
    ];
    for (const [nome, mexer, erro] of casos) {
      const b = await valido();
      mexer(b.config);
      assert.throws(() => lerBackup(json(b)), erro, nome);
    }
    assert.equal(await digital(pasta), original);
  });

  it('pasta de destino, notas recentes e janela de outro PC não são importadas', async () => {
    const b = await valido();
    b.config.pastaDestino = 'E:\\OutroPC\\Notas';
    b.config.ultimaPastaAbertura = 'E:\\OutroPC\\Downloads';
    b.config.notasRecentes = [];
    b.config.janela = { x: 5000, y: 5000, width: 800, height: 600 };
    b.config.cnpjEmpresa = '11444777000161';
    const local = {
      ...CONFIG,
      ultimaPastaAbertura: 'C:\\Downloads',
      notasRecentes: [
        {
          caminho: 'C:\\Conferencias\\Exemplo\\NF1.psxml',
          chave: '',
          fornecedor: 'Ferragens Exemplo',
          numero: '1',
          itens: 3,
          acesso: '2026-11-05T10:00:00.000Z',
          situacao: 'conferida',
          alerta: '',
        },
      ],
      janela: { x: 0, y: 0, width: 1366, height: 768 },
    };
    await writeFile(path.join(pasta, 'config.json'), json(local));
    await importarBackup(pasta, lerBackup(json(b)), new Date());
    const c = await lerJson('config.json');
    assert.equal(c.pastaDestino, CONFIG.pastaDestino);
    assert.equal(c.ultimaPastaAbertura, 'C:\\Downloads');
    assert.deepEqual(c.notasRecentes, local.notasRecentes);
    assert.deepEqual(c.janela, local.janela);
    // O resto veio do backup.
    assert.equal(c.cnpjEmpresa, '11444777000161');
    assert.deepEqual(c.perfis, CONFIG.perfis);
  });

  it('ficam só as 3 pastas "antes" mais recentes', async () => {
    const b = lerBackup(json(await valido()));
    for (let m = 0; m < 5; m++)
      await importarBackup(pasta, b, new Date(2026, 10, 6, 9, m, 0));
    const pastas = (await readdir(pasta))
      .filter((x) => x.startsWith(PREFIXO_ANTES))
      .sort();
    assert.equal(pastas.length, LIMITE_PASTAS_ANTES);
    assert.deepEqual(pastas, [
      `${PREFIXO_ANTES}2026-11-06_09-02-00`,
      `${PREFIXO_ANTES}2026-11-06_09-03-00`,
      `${PREFIXO_ANTES}2026-11-06_09-04-00`,
    ]);
  });
});

describe('backup: parte que não veio fica como está', () => {
  it('backup sem decisões mantém as decisões atuais (e o resto vem do backup)', async () => {
    const b = JSON.parse(
      textoBackup(await montarBackup(pasta, new Date(), '1.2.2')),
    );
    b.decisoes = null;
    b.config.cnpjEmpresa = '11444777000161';
    const decisoesAntes = await readFile(
      path.join(pasta, 'documentos', 'decisoes.json'),
      'utf8',
    );
    const lido = lerBackup(json(b));
    const parte = resumoBackup(lido).partes.find((p) => p.id === 'decisoes');
    assert.deepEqual([parte?.veio, parte?.valor], [false, '']);
    await importarBackup(pasta, lido, new Date());
    assert.equal(
      await readFile(path.join(pasta, 'documentos', 'decisoes.json'), 'utf8'),
      decisoesAntes,
    );
    assert.equal((await lerJson('config.json')).cnpjEmpresa, '11444777000161');
  });

  it('backup sem preferências e sem uma chave do config mantém as atuais', async () => {
    const b = JSON.parse(
      textoBackup(await montarBackup(pasta, new Date(), '1.2.2')),
    );
    b.preferencias = null;
    delete b.config.diasAvisoVencimento;
    delete b.config.ferramentasPerfis;
    await writeFile(
      path.join(pasta, 'documentos', 'preferencias.json'),
      json({ verificacaoOnline: true, verificarAoAbrir: false }),
    );
    await importarBackup(pasta, lerBackup(json(b)), new Date());
    assert.equal(
      (await lerJson('documentos', 'preferencias.json')).verificacaoOnline,
      true,
    );
    const c = await lerJson('config.json');
    assert.equal(c.diasAvisoVencimento, CONFIG.diasAvisoVencimento);
    assert.deepEqual(c.ferramentasPerfis, CONFIG.ferramentasPerfis);
  });
});
