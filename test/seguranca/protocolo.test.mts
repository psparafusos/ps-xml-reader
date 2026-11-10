// Protocolo app:// da tela: o resolvedor só aprova arquivos dentro da pasta
// do renderer, com tipo conhecido. Casos de fuga: "..", caminho absoluto,
// barra invertida (também codificada), letra de unidade, UNC, nulo, pasta.
import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  PAGINA_INICIAL,
  resolverCaminhoApp,
  tipoDoArquivo,
} from '../../src/seguranca/protocolo.ts';
import { remetenteValido } from '../../src/seguranca/remetente.ts';

const RAIZ =
  'C:\\Users\\teste\\AppData\\Local\\PSXmlReader\\app-1.2.5\\resources\\app.asar\\.vite\\renderer\\main_window';
const em = (...p: string[]) => path.join(RAIZ, ...p);

describe('app://: resolvedor de caminho', () => {
  it('a página e os arquivos da tela', () => {
    assert.equal(PAGINA_INICIAL, 'app://ps/index.html');
    assert.equal(
      resolverCaminhoApp('app://ps/index.html', RAIZ),
      em('index.html'),
    );
    assert.equal(resolverCaminhoApp('app://ps/', RAIZ), em('index.html'));
    assert.equal(resolverCaminhoApp('app://ps', RAIZ), em('index.html'));
    assert.equal(
      resolverCaminhoApp('app://ps/assets/index-Cee77xDr.js', RAIZ),
      em('assets', 'index-Cee77xDr.js'),
    );
    assert.equal(
      resolverCaminhoApp('app://ps/assets/ps-logo.svg?v=1#x', RAIZ),
      em('assets', 'ps-logo.svg'),
    );
    // Espaço e acento codificados são só texto.
    assert.equal(
      resolverCaminhoApp('app://ps/assets/l%C3%A1%20pis.png', RAIZ),
      em('assets', 'lá pis.png'),
    );
  });

  it('fuga com ".." (texto ou codificado) e com "."', () => {
    // O URL (padrão WHATWG, igual ao Chromium) já resolve "..", "." e
    // %2e%2e antes do resolvedor: o pedido fica preso na raiz e, no máximo,
    // procura um arquivo que não existe lá. Com a barra codificada (%2f), o
    // ".." só aparece depois de decodificar e é recusado.
    for (const url of [
      'app://ps/../../../Windows/win.ini',
      'app://ps/assets/../../main.cjs',
      'app://ps/%2e%2e/%2e%2e/package.json',
      'app://ps/assets/%2E%2E/%2E%2E/build/main.cjs',
      'app://ps/assets/..%2f..%2fbuild%2fmain.cjs',
      'app://ps/./index.html',
    ]) {
      const r = resolverCaminhoApp(url, RAIZ);
      assert.ok(
        r === null || r.startsWith(`${RAIZ}${path.sep}`),
        `${url} -> ${r}`,
      );
      if (r) assert.ok(!r.includes(`${path.sep}..`), url);
    }
    assert.equal(
      resolverCaminhoApp('app://ps/%2e%2e/%2e%2e/package.json', RAIZ),
      em('package.json'),
    );
    assert.equal(
      resolverCaminhoApp('app://ps/assets/../../main.cjs', RAIZ),
      null,
      'main.cjs na raiz: extensão fora da lista',
    );
    assert.equal(
      resolverCaminhoApp('app://ps/assets/..%2f..%2fx.js', RAIZ),
      null,
    );
  });

  it('barra invertida, letra de unidade, absoluto, UNC, nulo', () => {
    for (const url of [
      'app://ps/..%5c..%5cbuild%5cmain.cjs',
      'app://ps/assets%5C..%5C..%5Cx.js',
      'app://ps/C:/Windows/win.ini',
      'app://ps/C%3A%5CWindows%5Cwin.ini',
      'app://ps/c:x.js',
      'app://ps/index.html:fluxo.js',
      'app://ps//servidor/compartilhamento/x.js',
      'app://ps/%2F%2Fservidor%2Fc%2Fx.js',
      'app://ps/%5C%5Cservidor%5Cc%5Cx.js',
      'app://ps/%2FWindows%2Fwin.ini.js',
      'app://ps/index.html%00.js',
      'app://ps/%E0%A4%A.js',
    ])
      assert.equal(resolverCaminhoApp(url, RAIZ), null, url);
  });

  it('pasta, extensão fora da lista, outro esquema ou host', () => {
    for (const url of [
      'app://ps/assets/',
      'app://ps/assets',
      'app://ps/main.cjs',
      'app://ps/index.html.exe',
      'app://ps/assets/x.map',
      'file:///C:/Windows/win.ini',
      'https://ps/index.html',
      'app://outro/index.html',
      'app://ps:80/index.html',
      'não é url',
    ])
      assert.equal(resolverCaminhoApp(url, RAIZ), null, url);
  });

  it('tipo por extensão, sem diferenciar maiúsculas', () => {
    assert.equal(tipoDoArquivo('a.html'), 'text/html; charset=utf-8');
    assert.equal(tipoDoArquivo('a.JS'), 'text/javascript; charset=utf-8');
    assert.equal(tipoDoArquivo('a.css'), 'text/css; charset=utf-8');
    assert.equal(tipoDoArquivo('a.svg'), 'image/svg+xml');
    assert.equal(tipoDoArquivo('a.png'), 'image/png');
    assert.equal(tipoDoArquivo('a.woff2'), 'font/woff2');
    assert.equal(tipoDoArquivo('a.json'), 'application/json; charset=utf-8');
    assert.equal(tipoDoArquivo('a.exe'), null);
    assert.equal(tipoDoArquivo('sem-extensao'), null);
  });
});

describe('app://: remetente dos canais', () => {
  it('a página do app em app://ps é aceita; outras não', () => {
    const ok = (url: string) =>
      remetenteValido({ url, principal: true }, PAGINA_INICIAL);
    assert.ok(ok('app://ps/index.html'));
    assert.ok(ok('app://ps/index.html?x#y'));
    assert.equal(ok('app://ps/outra.html'), false);
    assert.equal(ok('app://outro/index.html'), false);
    assert.equal(ok('file:///C:/x/index.html'), false);
    assert.equal(ok('https://ps/index.html'), false);
    assert.equal(
      remetenteValido(
        { url: 'app://ps/index.html', principal: false },
        PAGINA_INICIAL,
      ),
      false,
    );
  });
});
