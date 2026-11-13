// "Abrir com" do .xml (src/associacao.ts): os comandos do reg.exe que a
// instalação e a desinstalação rodam. Só monta os argumentos; nada toca no
// registro. O programa padrão do .xml nunca muda.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAVE_ABRIR_COM_XML,
  CHAVE_PROGID_XML,
  caminhosDosIcones,
  comandosAbrirComXml,
  comandosAssociacaoPsxml,
  comandosRemoverAbrirComXml,
  PROGID_XML,
} from '../src/associacao.ts';
import { opcoesPerigosas } from '../src/seguranca/argumentos.ts';

const EXE = 'C:\\Users\\Fulano\\AppData\\Local\\PSXmlReader\\PS Reader.exe';
const CHAVE_XML = 'HKCU\\Software\\Classes\\.xml';

describe('comandosAbrirComXml', () => {
  const cmds = comandosAbrirComXml(EXE);

  it('grava o valor vazio PSReader.xml em OpenWithProgids do usuário', () => {
    assert.equal(CHAVE_ABRIR_COM_XML, `${CHAVE_XML}\\OpenWithProgids`);
    assert.deepEqual(cmds[0], [
      'add',
      CHAVE_ABRIR_COM_XML,
      '/v',
      PROGID_XML,
      '/t',
      'REG_NONE',
      '/f',
    ]);
  });

  it('ProgID com descrição, ícone do app e comando com "--" antes do "%1"', () => {
    assert.equal(CHAVE_PROGID_XML, 'HKCU\\Software\\Classes\\PSReader.xml');
    /** Valor padrão (/ve) que o comando grava em `chave`. */
    const padrao = (chave: string) => {
      const c = cmds.find((x) => x[1] === chave && x.includes('/ve'));
      return c ? c[c.indexOf('/d') + 1] : undefined;
    };
    assert.equal(padrao(CHAVE_PROGID_XML), 'Documento XML (PS Reader)');
    assert.equal(padrao(`${CHAVE_PROGID_XML}\\DefaultIcon`), `${EXE},0`);
    assert.equal(
      padrao(`${CHAVE_PROGID_XML}\\shell\\open\\command`),
      `"${EXE}" -- "%1"`,
    );
  });

  it('nunca mexe no padrão do .xml nem no UserChoice', () => {
    for (const c of cmds) {
      assert.ok(c[1].startsWith('HKCU\\Software\\Classes\\'), c[1]);
      assert.ok(!/UserChoice|FileExts/i.test(c.join(' ')), c.join(' '));
      // Na chave .xml e em OpenWithProgids, só valores com nome (/v).
      if (c[1] === CHAVE_XML || c[1] === CHAVE_ABRIR_COM_XML) {
        assert.ok(!c.includes('/ve'), `valor padrão em ${c[1]}`);
        assert.ok(c.includes('/v'), c.join(' '));
      }
    }
    assert.equal(cmds.length, 4);
  });
});

describe('comandosRemoverAbrirComXml', () => {
  const cmds = comandosRemoverAbrirComXml();

  it('apaga só o valor PSReader.xml e a chave do ProgID', () => {
    assert.deepEqual(cmds, [
      ['delete', CHAVE_ABRIR_COM_XML, '/v', PROGID_XML, '/f'],
      ['delete', CHAVE_PROGID_XML, '/f'],
    ]);
  });

  it('nunca apaga a chave .xml nem OpenWithProgids inteira', () => {
    for (const c of cmds) {
      assert.notEqual(c[1], CHAVE_XML);
      if (c[1] === CHAVE_ABRIR_COM_XML) assert.ok(c.includes('/v'));
    }
  });
});

describe('o "--" do comando de abrir', () => {
  it('a trava de opções aceita o "--" e não lê o caminho como opção', () => {
    assert.deepEqual(
      opcoesPerigosas([
        EXE,
        '--',
        'C:\\Notas\\--remote-debugging-port=9222.xml',
      ]),
      [],
    );
    // Sem o "--", uma opção perigosa de verdade continua recusada.
    assert.deepEqual(opcoesPerigosas([EXE, '--remote-debugging-port=9222']), [
      '--remote-debugging-port=9222',
    ]);
  });
});

describe('ícones do .xml e do .psxml', () => {
  const RAIZ = 'C:\\Users\\Fulano\\AppData\\Local\\PSXmlReader';
  const icones = caminhosDosIcones(RAIZ);
  const CLASSES = 'HKCU\\Software\\Classes';

  it('ficam na raiz da instalação, que não muda entre versões', () => {
    assert.equal(icones.xml, `${RAIZ}\\icones\\icone-xml.ico`);
    assert.equal(icones.psxml, `${RAIZ}\\icones\\icone-psxml.ico`);
  });

  it('DefaultIcon do PSReader.xml aponta para o icone-xml.ico', () => {
    const cmds = comandosAbrirComXml(EXE, icones.xml);
    const icone = cmds.find((c) => c[1] === `${CHAVE_PROGID_XML}\\DefaultIcon`);
    assert.equal(icone?.[icone.indexOf('/d') + 1], `${icones.xml},0`);
  });

  it('o .psxml: extensão, ProgID, DefaultIcon no icone-psxml.ico e o comando de abrir', () => {
    const cmds = comandosAssociacaoPsxml(EXE, icones.psxml);
    const valor = (chave: string) => {
      const c = cmds.find((x) => x[1] === chave);
      return c?.[c.indexOf('/d') + 1];
    };
    assert.equal(valor(`${CLASSES}\\.psxml`), 'PSReader.psxml');
    assert.equal(
      valor(`${CLASSES}\\PSReader.psxml`),
      'Cópia editada do PS Reader',
    );
    assert.equal(
      valor(`${CLASSES}\\PSReader.psxml\\DefaultIcon`),
      `${icones.psxml},0`,
    );
    assert.equal(
      valor(`${CLASSES}\\PSReader.psxml\\shell\\open\\command`),
      `"${EXE}" "%1"`,
    );
    for (const c of cmds) assert.ok(c[1].startsWith(`${CLASSES}\\`), c[1]);
  });

  it('sem os ícones copiados, fica o ícone do app (o executável da raiz)', () => {
    const cmds = comandosAssociacaoPsxml(EXE);
    const icone = cmds.find((c) => c[1].endsWith('\\DefaultIcon'));
    assert.equal(icone?.[icone.indexOf('/d') + 1], `${EXE},0`);
  });
});
