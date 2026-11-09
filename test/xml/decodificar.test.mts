// Decodificação do leitor genérico de XML (src/xml/decodificar.ts), que roda
// no processo principal: BOM, declaração, lista fechada de codificações,
// reserva em windows-1252 e detecção de binário. T18 do plano de segurança.
// Notas e textos inventados; nada aqui toca disco nem rede.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodificarXml } from '../../src/xml/decodificar.ts';
import { MENSAGEM_BINARIO, MENSAGEM_VAZIO } from '../../src/xml/limites.ts';
import { lerXml } from '../../src/xml/leitor.ts';

// NF-e mínima inventada (chave do plano de segurança, de nenhuma nota real).
const nfe = (encoding: string) => `<?xml version="1.0" encoding="${encoding}"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe>
<infNFe Id="NFe35261100000000000191550010000000011000000010" versao="4.00">
<det nItem="1"><prod><xProd>PARAFUSO SEXTAVADO AÇO GALVANIZADO Ø 8 mm</xProd></prod></det>
<infAdic><infCpl>Observação: ação, coração, pão</infCpl></infAdic>
</infNFe></NFe></nfeProc>`;

/** Bytes UTF-16 LE com BOM. */
function utf16le(texto: string): Uint8Array {
  return Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(texto, 'utf16le'),
  ]);
}

/** Bytes UTF-16 LE sem BOM. */
function utf16leSemBom(texto: string): Uint8Array {
  return Buffer.from(texto, 'utf16le');
}

/** Bytes UTF-16 BE sem BOM. */
function utf16beSemBom(texto: string): Uint8Array {
  return utf16be(texto).subarray(2);
}

/** Bytes UTF-16 BE com BOM. */
function utf16be(texto: string): Uint8Array {
  const le = Buffer.from(texto, 'utf16le');
  for (let i = 0; i < le.length; i += 2) {
    const a = le[i];
    le[i] = le[i + 1];
    le[i + 1] = a;
  }
  return Buffer.concat([Buffer.from([0xfe, 0xff]), le]);
}

function ok(bytes: Uint8Array) {
  const r = decodificarXml(bytes);
  assert.equal(r.ok, true, 'devia decodificar');
  if (!r.ok) throw new Error('inalcançável');
  return r;
}

describe('T18: NF-e em UTF-16 e em Latin-1, e arquivo binário', () => {
  it('UTF-16 LE com BOM abre com os acentos certos', () => {
    const r = ok(utf16le(nfe('UTF-16')));
    assert.equal(r.codificacao, 'utf-16le');
    assert.equal(r.origem, 'bom');
    assert.equal(r.aviso, null);
    assert.equal(r.texto, nfe('UTF-16'));
    assert.match(r.texto, /AÇO GALVANIZADO Ø 8 mm/);
  });

  it('ISO-8859-1 declarado abre com os acentos certos', () => {
    const r = ok(Buffer.from(nfe('ISO-8859-1'), 'latin1'));
    assert.equal(r.codificacao, 'iso-8859-1');
    assert.equal(r.origem, 'declaracao');
    assert.equal(r.declarada, 'ISO-8859-1');
    assert.equal(r.aviso, null);
    assert.match(r.texto, /Observação: ação, coração, pão/);
    assert.equal(lerXml(r.texto).erro, null);
  });

  it('4 KB de bytes com zeros e extensão .xml: "não parece um XML"', () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 256;
    const r = decodificarXml(bytes);
    assert.deepEqual(r, {
      ok: false,
      motivo: 'binario',
      mensagem: MENSAGEM_BINARIO,
    });
    assert.equal(
      MENSAGEM_BINARIO,
      'Este arquivo não parece um XML (tem bytes de arquivo binário).',
    );
  });
});

describe('BOM e declaração', () => {
  it('UTF-8 sem BOM e sem declaração usa UTF-8 por padrão', () => {
    const r = ok(Buffer.from('<a>ação</a>', 'utf8'));
    assert.equal(r.codificacao, 'utf-8');
    assert.equal(r.origem, 'padrao');
    assert.equal(r.texto, '<a>ação</a>');
  });

  it('UTF-8 com BOM tira o BOM do texto', () => {
    const r = ok(
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(nfe('UTF-8')),
      ]),
    );
    assert.equal(r.codificacao, 'utf-8');
    assert.equal(r.origem, 'bom');
    assert.equal(r.texto.charCodeAt(0), 0x3c);
  });

  it('UTF-16 BE com BOM', () => {
    const r = ok(utf16be(nfe('UTF-16')));
    assert.equal(r.codificacao, 'utf-16be');
    assert.equal(r.texto, nfe('UTF-16'));
  });

  it('o BOM vale mais que a declaração', () => {
    const r = ok(
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(nfe('ISO-8859-1')),
      ]),
    );
    assert.equal(r.codificacao, 'utf-8');
    assert.equal(r.declarada, 'ISO-8859-1');
    assert.match(r.texto, /coração/);
  });

  it('windows-1252 declarado, com aspas simples e minúsculas', () => {
    const texto =
      "<?xml version='1.0' encoding='windows-1252'?><a>€ – ação</a>";
    // € e – só existem em windows-1252 (0x80 e 0x96).
    const bytes = Buffer.from(
      texto.replace('€', '\u0080').replace('–', '\u0096'),
      'latin1',
    );
    const r = ok(bytes);
    assert.equal(r.codificacao, 'windows-1252');
    assert.match(r.texto, /<a>€ – ação<\/a>/);
  });

  it('us-ascii declarado com texto só ASCII', () => {
    const r = ok(
      Buffer.from('<?xml version="1.0" encoding="US-ASCII"?><a>x</a>'),
    );
    assert.equal(r.codificacao, 'us-ascii');
    assert.equal(r.aviso, null);
  });

  it('a declaração só é lida nos primeiros 1 KB', () => {
    const texto = `<?xml version="1.0"${' '.repeat(1100)}encoding="ISO-8859-1"?><a>ação</a>`;
    const r = ok(Buffer.from(texto, 'latin1'));
    // Fora do primeiro 1 KB: vale UTF-8, que falha com o "ç" em Latin-1.
    assert.equal(r.declarada, null);
    assert.equal(r.origem, 'reserva');
  });
});

describe('Codificação que não confere: windows-1252 com aviso', () => {
  it('UTF-8 declarado com bytes Latin-1', () => {
    const r = ok(Buffer.from(nfe('UTF-8'), 'latin1'));
    assert.equal(r.codificacao, 'windows-1252');
    assert.equal(r.origem, 'reserva');
    assert.equal(
      r.aviso,
      'A codificação declarada (UTF-8) não confere com o conteúdo; mostrando como windows-1252.',
    );
    assert.match(r.texto, /coração/);
  });

  it('sem declaração e com bytes Latin-1', () => {
    const r = ok(Buffer.from('<a>ação</a>', 'latin1'));
    assert.equal(r.origem, 'reserva');
    assert.match(r.aviso ?? '', /não confere com o conteúdo/);
    assert.equal(r.texto, '<a>ação</a>');
  });

  it('codificação desconhecida (fora da lista fechada)', () => {
    const r = ok(
      Buffer.from('<?xml version="1.0" encoding="EBCDIC-XYZ"?><a/>'),
    );
    assert.equal(r.codificacao, 'windows-1252');
    assert.equal(r.declarada, 'EBCDIC-XYZ');
    assert.match(
      r.aviso ?? '',
      /^A codificação declarada \(EBCDIC-XYZ\) não confere/,
    );
  });

  it('UTF-16 declarado sem BOM', () => {
    const r = ok(Buffer.from('<?xml version="1.0" encoding="UTF-16"?><a/>'));
    assert.equal(r.origem, 'reserva');
  });

  it('us-ascii declarado com byte acima de 0x7F', () => {
    const r = ok(
      Buffer.from(
        '<?xml version="1.0" encoding="us-ascii"?><a>é</a>',
        'latin1',
      ),
    );
    assert.equal(r.origem, 'reserva');
    assert.match(r.texto, /<a>é<\/a>/);
  });

  it('rótulo com mais de 40 caracteres não é aceito como declaração', () => {
    const r = ok(
      Buffer.from(`<?xml version="1.0" encoding="${'x'.repeat(60)}"?><a/>`),
    );
    // Mais de 40 caracteres: a declaração não é reconhecida.
    assert.equal(r.declarada, null);
  });
});

describe('Binário', () => {
  it('um byte zero no começo do arquivo', () => {
    assert.equal(
      decodificarXml(Buffer.from('<a>\u0000</a>', 'latin1')).ok,
      false,
    );
  });

  it('mais de 10% de bytes de controle nos primeiros 64 KB', () => {
    const bytes = Buffer.alloc(1000, 0x41);
    bytes[0] = 0x3c;
    for (let i = 1; i <= 101; i++) bytes[i * 9] = 0x01;
    assert.equal(decodificarXml(bytes).ok, false);
  });

  it('até 10% de bytes de controle ainda é texto', () => {
    const bytes = Buffer.alloc(1000, 0x41);
    bytes[0] = 0x3c;
    for (let i = 1; i <= 100; i++) bytes[i * 9] = 0x01;
    assert.equal(decodificarXml(bytes).ok, true);
  });

  it('nenhum "<" depois do BOM e dos espaços', () => {
    assert.equal(decodificarXml(Buffer.from('  \r\n\tola, mundo')).ok, false);
    assert.equal(
      decodificarXml(Buffer.from([0xef, 0xbb, 0xbf, 0x20, 0x78])).ok,
      false,
    );
  });

  it('PDF renomeado para .xml', () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x00, 0x01]),
    ]);
    assert.equal(decodificarXml(pdf).ok, false);
  });

  it('UTF-16 com BOM e caractere U+0000 é binário', () => {
    assert.equal(decodificarXml(utf16le('<a>\u0000</a>')).ok, false);
  });

  it('espaços antes do "<" são aceitos', () => {
    const r = ok(Buffer.from('\r\n  \t<a/>'));
    assert.equal(r.texto, '\r\n  \t<a/>');
  });
});

describe('UTF-16 sem BOM, pelos dois primeiros bytes', () => {
  it('"<" e zero: UTF-16 LE, com acentos certos', () => {
    const r = ok(utf16leSemBom(nfe('UTF-16')));
    assert.equal(r.codificacao, 'utf-16le');
    assert.equal(r.origem, 'inicio');
    assert.equal(r.aviso, null);
    assert.equal(r.texto, nfe('UTF-16'));
    assert.equal(lerXml(r.texto).erro, null);
  });

  it('zero e "<": UTF-16 BE, com acentos certos', () => {
    const r = ok(utf16beSemBom(nfe('UTF-16')));
    assert.equal(r.codificacao, 'utf-16be');
    assert.equal(r.origem, 'inicio');
    assert.match(r.texto, /Observação: ação, coração, pão/);
  });

  it('espaço antes do "<" não bate com o começo: continua binário', () => {
    const r = decodificarXml(utf16leSemBom(' <a/>'));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.motivo, 'binario');
  });

  it('outro começo com byte zero continua binário', () => {
    assert.equal(
      decodificarXml(Buffer.from([0x00, 0x00, 0x3c, 0x00])).ok,
      false,
    );
    assert.equal(
      decodificarXml(Buffer.from([0x41, 0x00, 0x3c, 0x00])).ok,
      false,
    );
  });

  it('"<" e zero com bytes que não formam UTF-16: binário', () => {
    // Número ímpar de bytes e par substituto solto: o TextDecoder recusa.
    const bytes = Buffer.concat([
      utf16leSemBom('<a>'),
      Buffer.from([0x00, 0xd8, 0x41]),
    ]);
    const r = decodificarXml(bytes);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.motivo, 'binario');
  });

  it('"<" e zero seguido de muitos controles: binário', () => {
    const texto = '<' + '\u0001'.repeat(200);
    const r = decodificarXml(utf16leSemBom(texto));
    assert.equal(r.ok, false);
  });
});

describe('Arquivo vazio', () => {
  const vazio = (bytes: Uint8Array) => {
    const r = decodificarXml(bytes);
    assert.deepEqual(r, {
      ok: false,
      motivo: 'vazio',
      mensagem: MENSAGEM_VAZIO,
    });
  };

  it('0 bytes', () => {
    vazio(new Uint8Array(0));
    assert.equal(MENSAGEM_VAZIO, 'O arquivo está vazio.');
  });

  it('só espaços, tabs e quebras de linha', () => {
    vazio(Buffer.from('  \r\n\t \n'));
  });

  it('só o BOM, ou BOM e espaços (UTF-8 e UTF-16)', () => {
    vazio(Buffer.from([0xef, 0xbb, 0xbf]));
    vazio(Buffer.from([0xef, 0xbb, 0xbf, 0x20, 0x0a]));
    vazio(utf16le('  \r\n'));
    vazio(utf16be(' '));
  });

  it('texto sem "<" não é vazio: continua binário', () => {
    const r = decodificarXml(Buffer.from('  ola'));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.motivo, 'binario');
  });
});
