// Limpeza do "Abrir com" (src/abrirComAntigo.ts): quais nomes são de um PS
// Reader antigo e o que sai de cada OpenWithList. Nada toca no registro.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAVE_APPLICATIONS,
  CHAVES_OPEN_WITH_LIST,
  ehNomeAntigoDoPsReader,
  planoOpenWithList,
  subchavesNaSaida,
  valoresNaSaida,
} from '../src/abrirComAntigo.ts';

describe('ehNomeAntigoDoPsReader', () => {
  for (const nome of [
    'PS Reader-1.2.3 Setup.exe',
    'PS Reader-1.0.0 Setup.exe',
    'PS Reader-1.2.13 Setup.exe',
    'ps reader-1.2.3 setup.exe',
    'PS Reader-Setup.exe',
    'Leitor NF-e PS.exe',
    'Leitor NF-e PS-1.0.0 Setup.exe',
    'LEITOR NF-E PS.EXE',
  ]) {
    it(`apaga "${nome}"`, () =>
      assert.equal(ehNomeAntigoDoPsReader(nome), true));
  }

  for (const nome of [
    'PS Reader.exe',
    'msedge.exe',
    'MSOXMLED.EXE',
    'notepad.exe',
    'SistemaGestao.exe',
    'Outro Programa-2.0 Setup.exe',
    'Setup.exe',
    'PS Reader-1.2.3 Setup.exe.bak',
    'Meu PS Reader-1.2.3 Setup.exe',
    'C:\\Users\\Fulano\\Downloads\\PS Reader-1.2.3 Setup.exe',
    'PS Reader-1.2.3\\Setup.exe',
    'Leitor NF-e.exe',
    'Leitor NF-e PS.dll',
    'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
    '',
  ]) {
    it(`mantém "${nome}"`, () =>
      assert.equal(ehNomeAntigoDoPsReader(nome), false));
  }
});

describe('subchavesNaSaida', () => {
  it('lê só as subchaves diretas de Applications', () => {
    const saida = [
      '',
      'HKEY_CURRENT_USER\\Software\\Classes\\Applications',
      '    (Padrão)    REG_SZ    ',
      '',
      'HKEY_CURRENT_USER\\Software\\Classes\\Applications\\msedge.exe',
      'HKEY_CURRENT_USER\\Software\\Classes\\Applications\\PS Reader-1.2.3 Setup.exe',
      'HKEY_CURRENT_USER\\Software\\Classes\\Applications\\Leitor NF-e PS.exe',
      'HKEY_CURRENT_USER\\Software\\Classes\\Applications\\SistemaGestao.exe',
      '',
    ].join('\r\n');
    assert.deepEqual(subchavesNaSaida(saida, CHAVE_APPLICATIONS), [
      'msedge.exe',
      'PS Reader-1.2.3 Setup.exe',
      'Leitor NF-e PS.exe',
      'SistemaGestao.exe',
    ]);
  });

  it('as que casam são só as do PS Reader antigo', () => {
    const nomes = [
      'msedge.exe',
      'MSOXMLED.EXE',
      'PS Reader.exe',
      'PS Reader-1.2.3 Setup.exe',
      'Leitor NF-e PS.exe',
      'Outro Programa-2.0 Setup.exe',
      'SistemaGestao.exe',
    ];
    assert.deepEqual(nomes.filter(ehNomeAntigoDoPsReader), [
      'PS Reader-1.2.3 Setup.exe',
      'Leitor NF-e PS.exe',
    ]);
  });
});

describe('planoOpenWithList', () => {
  const saida = [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.xml\\OpenWithList',
    '    a    REG_SZ    msedge.exe',
    '    MRUList    REG_SZ    gfiabced',
    '    b    REG_SZ    MSOXMLED.EXE',
    '    c    REG_SZ    SistemaGestao.exe',
    '    d    REG_SZ    Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
    '    e    REG_SZ    Leitor NF-e PS.exe',
    '    f    REG_SZ    PS Reader.exe',
    '    g    REG_SZ    Outro Programa-2.0 Setup.exe',
    '    i    REG_SZ    PS Reader-1.2.3 Setup.exe',
    '',
  ].join('\r\n');

  it('lê os valores com espaço no conteúdo', () => {
    const v = valoresNaSaida(saida);
    assert.equal(v.length, 9);
    assert.deepEqual(v.at(-1), {
      nome: 'i',
      tipo: 'REG_SZ',
      dado: 'PS Reader-1.2.3 Setup.exe',
    });
  });

  it('apaga só as letras do PS Reader antigo e tira do MRUList', () => {
    const plano = planoOpenWithList(valoresNaSaida(saida));
    assert.deepEqual(plano.apagar, [
      { letra: 'e', dado: 'Leitor NF-e PS.exe' },
      { letra: 'i', dado: 'PS Reader-1.2.3 Setup.exe' },
    ]);
    assert.equal(plano.mruNovo, 'gfabcd');
  });

  it('sem nada antigo, não muda nada', () => {
    const plano = planoOpenWithList(
      valoresNaSaida(
        [
          '    a    REG_SZ    msedge.exe',
          '    b    REG_SZ    PS Reader.exe',
          '    MRUList    REG_SZ    ba',
        ].join('\r\n'),
      ),
    );
    assert.deepEqual(plano, { apagar: [], mruNovo: null });
  });

  it('ignora valor que não é de uma letra, mesmo com nome antigo', () => {
    const plano = planoOpenWithList([
      { nome: 'MRUList', tipo: 'REG_SZ', dado: 'a' },
      { nome: 'ab', tipo: 'REG_SZ', dado: 'PS Reader-1.2.3 Setup.exe' },
      { nome: '(Padrão)', tipo: 'REG_SZ', dado: 'Leitor NF-e PS.exe' },
      { nome: 'a', tipo: 'REG_SZ', dado: 'msedge.exe' },
    ]);
    assert.deepEqual(plano, { apagar: [], mruNovo: null });
  });

  it('sem MRUList, apaga a letra e não cria MRUList', () => {
    const plano = planoOpenWithList([
      { nome: 'a', tipo: 'REG_SZ', dado: 'PS Reader-1.2.3 Setup.exe' },
    ]);
    assert.deepEqual(plano.apagar, [
      { letra: 'a', dado: 'PS Reader-1.2.3 Setup.exe' },
    ]);
    assert.equal(plano.mruNovo, null);
  });

  it('MRUList que fica vazio vira texto vazio', () => {
    const plano = planoOpenWithList([
      { nome: 'a', tipo: 'REG_SZ', dado: 'Leitor NF-e PS.exe' },
      { nome: 'MRUList', tipo: 'REG_SZ', dado: 'a' },
    ]);
    assert.equal(plano.mruNovo, '');
  });

  it('olha o OpenWithList do .xml e do .psxml, no HKCU', () => {
    assert.deepEqual(CHAVES_OPEN_WITH_LIST, [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.xml\\OpenWithList',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.psxml\\OpenWithList',
    ]);
    assert.equal(CHAVE_APPLICATIONS, 'HKCU\\Software\\Classes\\Applications');
  });
});
