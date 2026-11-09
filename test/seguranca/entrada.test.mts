// Entradas de fora do app: opções da linha de comando (S10, T17), remetente
// dos canais (S11), caminho de arquivo solto (S12) e caminho de rede que não
// responde ou arquivo em uso (S13). Funções puras, com disco falso.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { opcoesPerigosas } from '../../src/seguranca/argumentos.ts';
import {
  MENSAGEM_EM_USO,
  MENSAGEM_EXTENSAO,
  MENSAGEM_NAO_COMUM,
  comLimite,
  ehArquivoAtePrazo,
  ehCaminhoDeDispositivo,
  lerXmlSeguro,
  problemaCaminhoSolto,
  type Disco,
} from '../../src/seguranca/arquivo.ts';
import { remetenteValido } from '../../src/seguranca/remetente.ts';
import { ArquivoRecusadoError } from '../../src/seguranca/xml.ts';

const EXE = 'C:\\Users\\teste\\AppData\\Local\\PSXmlReader\\PS Reader.exe';
const EXT = ['.xml', '.psxml'];

const erroCom = (code: string) =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

describe('S10: opções perigosas na linha de comando (T17)', () => {
  it('acha cada uma, com --, - ou /, e sem diferenciar maiúsculas', () => {
    const casos = [
      '--remote-debugging-port=9222',
      '--remote-debugging-pipe',
      '--inspect',
      '--inspect-brk=9229',
      '--inspect-port=1',
      '--js-flags=--allow-natives-syntax',
      '--user-data-dir=C:\\outra',
      '-remote-debugging-port=9222',
      '/remote-debugging-port=9222',
      '--Remote-Debugging-Port=9222',
    ];
    for (const c of casos) assert.deepEqual(opcoesPerigosas([EXE, c]), [c], c);
  });

  it('nome de arquivo com a opção dentro é só um arquivo', () => {
    assert.deepEqual(
      opcoesPerigosas([EXE, 'C:\\Notas\\--remote-debugging-port=9222.xml']),
      [],
    );
    assert.deepEqual(
      opcoesPerigosas([EXE, '\\\\servidor\\notas\\--inspect.xml']),
      [],
    );
  });

  it('opções comuns passam; depois de "--" nada é opção', () => {
    assert.deepEqual(
      opcoesPerigosas([
        EXE,
        '--squirrel-firstrun',
        '--allow-file-access',
        'C:\\nota.xml',
      ]),
      [],
    );
    assert.deepEqual(
      opcoesPerigosas([EXE, '--', '--remote-debugging-port=1']),
      [],
    );
    // O executável (argv[0]) não conta.
    assert.deepEqual(opcoesPerigosas(['--inspect']), []);
  });

  it('várias: devolve todas, na ordem', () => {
    assert.deepEqual(
      opcoesPerigosas([EXE, '--inspect', 'a.xml', '--user-data-dir=x']),
      ['--inspect', '--user-data-dir=x'],
    );
  });
});

describe('S11: remetente dos canais', () => {
  const PAGINA_ARQ =
    'file:///C:/Users/teste/AppData/Local/PSXmlReader/app-1.2.4/resources/app.asar/.vite/renderer/main_window/index.html';
  const PAGINA_DEV = 'http://localhost:5173/';

  it('quadro principal da página do app: aceito', () => {
    assert.ok(
      remetenteValido({ url: PAGINA_ARQ, principal: true }, PAGINA_ARQ),
    );
    assert.ok(
      remetenteValido(
        { url: `${PAGINA_ARQ.replace('C:', 'c:')}#x?y`, principal: true },
        PAGINA_ARQ,
      ),
    );
    assert.ok(
      remetenteValido(
        { url: 'http://localhost:5173/?t=1', principal: true },
        PAGINA_DEV,
      ),
    );
  });

  it('iframe, quadro destruído ou outra página: recusado', () => {
    const recusados = [
      { url: PAGINA_ARQ, principal: false },
      { url: null, principal: true },
      { url: 'file:///C:/Users/teste/Downloads/ataque.html', principal: true },
      { url: 'https://exemplo.invalid/', principal: true },
      { url: 'about:blank', principal: true },
      { url: 'data:text/html,oi', principal: true },
      { url: 'file://servidor/C:/Users/teste/x/index.html', principal: true },
    ];
    for (const r of recusados)
      assert.equal(remetenteValido(r, PAGINA_ARQ), false, JSON.stringify(r));
    assert.equal(
      remetenteValido(
        { url: 'http://localhost:5174/', principal: true },
        PAGINA_DEV,
      ),
      false,
    );
    assert.equal(
      remetenteValido(
        { url: 'http://localhost:5173/outra.html', principal: true },
        PAGINA_DEV,
      ),
      false,
    );
    assert.equal(
      remetenteValido({ url: 'não é url', principal: true }, PAGINA_ARQ),
      false,
    );
  });
});

describe('S12: arquivo solto na janela', () => {
  const arquivo = async () => ({ isFile: () => true });
  const pasta = async () => ({ isFile: () => false });

  it('caminhos de dispositivo do Windows', () => {
    for (const c of [
      '\\\\?\\C:\\nota.xml',
      '\\\\.\\C:\\nota.xml',
      '//?/C:/nota.xml',
      '//./PhysicalDrive0',
    ])
      assert.ok(ehCaminhoDeDispositivo(c), c);
    for (const c of ['C:\\nota.xml', '\\\\servidor\\notas\\nota.xml'])
      assert.equal(ehCaminhoDeDispositivo(c), false, c);
  });

  it('recusa extensão errada, relativo, dispositivo, link e pasta', async () => {
    assert.equal(
      await problemaCaminhoSolto('C:\\x.html', EXT, arquivo),
      MENSAGEM_EXTENSAO,
    );
    assert.equal(
      await problemaCaminhoSolto('nota.xml', EXT, arquivo),
      MENSAGEM_EXTENSAO,
    );
    assert.equal(
      await problemaCaminhoSolto(42, EXT, arquivo),
      MENSAGEM_EXTENSAO,
    );
    assert.equal(
      await problemaCaminhoSolto('\\\\?\\C:\\nota.xml', EXT, arquivo),
      MENSAGEM_NAO_COMUM,
    );
    // lstat de um link simbólico ou de uma pasta: não é arquivo comum.
    assert.equal(
      await problemaCaminhoSolto('C:\\link.xml', EXT, pasta),
      MENSAGEM_NAO_COMUM,
    );
  });

  it('arquivo comum, local ou de rede: aceito', async () => {
    assert.equal(
      await problemaCaminhoSolto('C:\\nota.xml', EXT, arquivo),
      null,
    );
    assert.equal(
      await problemaCaminhoSolto(
        '\\\\servidor\\notas\\nota.psxml',
        EXT,
        arquivo,
      ),
      null,
    );
  });

  it('em uso e não encontrado têm mensagem própria', async () => {
    const travado = async () => {
      throw erroCom('EBUSY');
    };
    const sumiu = async () => {
      throw erroCom('ENOENT');
    };
    assert.equal(
      await problemaCaminhoSolto('C:\\nota.xml', EXT, travado),
      MENSAGEM_EM_USO,
    );
    assert.equal(
      await problemaCaminhoSolto('C:\\nota.xml', EXT, sumiu),
      'O arquivo não foi encontrado.',
    );
  });
});

describe('S13: rede que não responde e arquivo em uso', () => {
  const nunca = () => new Promise<{ isFile(): boolean }>(() => undefined);

  it('caminho que não responde: false no prazo, sem esperar o Windows', async () => {
    const inicio = performance.now();
    assert.equal(await ehArquivoAtePrazo('\\\\fora\\x.xml', 50, nunca), false);
    assert.ok(performance.now() - inicio < 1000);
  });

  it('arquivo que responde a tempo: true; pasta ou erro: false', async () => {
    assert.equal(
      await ehArquivoAtePrazo('C:\\a.xml', 50, async () => ({
        isFile: () => true,
      })),
      true,
    );
    assert.equal(
      await ehArquivoAtePrazo('C:\\p', 50, async () => ({
        isFile: () => false,
      })),
      false,
    );
    assert.equal(
      await ehArquivoAtePrazo('C:\\x', 50, async () => {
        throw erroCom('ENOENT');
      }),
      false,
    );
  });

  it('comLimite devolve o valor de esgotado e não segura o processo', async () => {
    assert.equal(
      await comLimite(new Promise(() => undefined), 10, 'esgotou'),
      'esgotou',
    );
    assert.equal(await comLimite(Promise.resolve('ok'), 1000, 'esgotou'), 'ok');
  });

  it('EBUSY ou EPERM ao abrir: "O arquivo está em uso por outro programa."', async () => {
    for (const code of ['EBUSY', 'EPERM']) {
      const ler: Disco = {
        tamanho: async () => 10,
        ler: async () => {
          throw erroCom(code);
        },
      };
      await assert.rejects(
        lerXmlSeguro('C:\\nota.xml', ler),
        (e: unknown) =>
          e instanceof ArquivoRecusadoError && e.message === MENSAGEM_EM_USO,
      );
      const medir: Disco = {
        tamanho: async () => {
          throw erroCom(code);
        },
        ler: async () => assert.fail('não deveria ler'),
      };
      await assert.rejects(
        lerXmlSeguro('C:\\nota.xml', medir),
        ArquivoRecusadoError,
      );
    }
    // Outros erros seguem como estão.
    const sumiu: Disco = {
      tamanho: async () => {
        throw erroCom('ENOENT');
      },
      ler: async () => new Uint8Array(),
    };
    await assert.rejects(
      lerXmlSeguro('C:\\nota.xml', sumiu),
      (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT',
    );
  });
});
