// Para onde vai um arquivo pedido para abrir (src/leitorXml/destino.ts): a
// tela da nota (NF-e ou cópia editada) ou o leitor genérico (outro XML).
// Arquivos inventados, em memória; disco de mentira.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  destinoDoArquivo,
  destinoPeloComeco,
  raizDoComeco,
  textoDoComeco,
} from '../../src/leitorXml/destino.ts';

const XML = 'C:\\Notas\\arquivo inventado.xml';
const PSXML = 'C:\\Notas\\arquivo inventado.psxml';
const bytes = (s: string) => new TextEncoder().encode(s);
const utf16le = (s: string, bom = true) => {
  const b = Buffer.from(s, 'utf16le');
  return new Uint8Array(
    bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), b]) : b,
  );
};
const utf16be = (s: string) => {
  const le = Buffer.from(s, 'utf16le');
  const be = Buffer.alloc(le.length);
  for (let i = 0; i < le.length; i += 2) {
    be[i] = le[i + 1];
    be[i + 1] = le[i];
  }
  return new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
};

describe('raizDoComeco', () => {
  it('acha a raiz depois da declaração, de comentários e de instruções', () => {
    assert.equal(
      raizDoComeco(
        '\uFEFF<?xml version="1.0"?>\n<!-- nota -->\n<?estilo x?>\n<nfeProc versao="4.00">',
      ),
      'nfeProc',
    );
  });

  it('tira o prefixo do nome', () => {
    assert.equal(raizDoComeco('<nfe:NFe xmlns:nfe="x">'), 'NFe');
  });

  it('pula o DOCTYPE, com ou sem a parte entre colchetes', () => {
    assert.equal(raizDoComeco('<!DOCTYPE catalogo>\n<catalogo/>'), 'catalogo');
    assert.equal(
      raizDoComeco(
        '<!DOCTYPE catalogo [\n  <!ENTITY marca "Inventada">\n]>\n<catalogo>',
      ),
      'catalogo',
    );
  });

  it('começo que não chega à raiz, ou que não é XML: null', () => {
    assert.equal(raizDoComeco('<?xml version="1.0"'), null);
    assert.equal(raizDoComeco('<!-- sem fim'), null);
    assert.equal(raizDoComeco('texto qualquer'), null);
    assert.equal(raizDoComeco(''), null);
  });
});

describe('textoDoComeco', () => {
  it('UTF-16 pela marca BOM e pelos zeros alternados', () => {
    assert.equal(raizDoComeco(textoDoComeco(utf16le('<NFe/>'))), 'NFe');
    assert.equal(raizDoComeco(textoDoComeco(utf16le('<NFe/>', false))), 'NFe');
    assert.equal(raizDoComeco(textoDoComeco(utf16be('<pedido/>'))), 'pedido');
  });
});

describe('destinoPeloComeco', () => {
  it('NF-e, NF-e com prefixo e cópia editada vão para a nota', () => {
    for (const x of [
      '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00">',
      '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">',
      '<nfe:NFe xmlns:nfe="http://www.portalfiscal.inf.br/nfe">',
      '<psCopiaEditada versao="1">',
    ])
      assert.equal(destinoPeloComeco(XML, bytes(x)), 'nota', x);
  });

  it('outro XML vai para o leitor (CT-e, catálogo, configuração)', () => {
    for (const x of [
      '<?xml version="1.0"?><cteProc versao="4.00">',
      '<catalogo origem="teste">',
      '<!DOCTYPE c [ <!ENTITY e "x"> ]><configuracao/>',
    ])
      assert.equal(destinoPeloComeco(XML, bytes(x)), 'leitor', x);
  });

  it('UTF-16: NF-e na nota, outro no leitor', () => {
    assert.equal(destinoPeloComeco(XML, utf16le('<nfeProc>')), 'nota');
    assert.equal(destinoPeloComeco(XML, utf16le('<pedido>')), 'leitor');
  });

  it('vazio ou binário vai para o leitor, que explica a recusa', () => {
    assert.equal(destinoPeloComeco(XML, new Uint8Array(0)), 'leitor');
    assert.equal(
      destinoPeloComeco(XML, new Uint8Array([0x3c, 0x61, 0, 1, 2, 3])),
      'leitor',
    );
  });

  it('.psxml sempre na nota; começo que não deu para ler, também', () => {
    assert.equal(destinoPeloComeco(PSXML, bytes('<catalogo/>')), 'nota');
    assert.equal(destinoPeloComeco(XML, null), 'nota');
  });
});

describe('destinoDoArquivo', () => {
  it('lê só o começo e decide', async () => {
    const lidos: string[] = [];
    const ler = async (c: string) => {
      lidos.push(c);
      return bytes('<catalogo/>');
    };
    assert.equal(await destinoDoArquivo(XML, ler), 'leitor');
    assert.deepEqual(lidos, [XML]);
  });

  it('.psxml nem lê o arquivo', async () => {
    let leu = false;
    const ler = async () => {
      leu = true;
      return bytes('<catalogo/>');
    };
    assert.equal(await destinoDoArquivo(PSXML, ler), 'nota');
    assert.equal(leu, false);
  });

  it('arquivo em uso, sumido ou sem resposta: nota (a leitura de sempre explica)', async () => {
    assert.equal(
      await destinoDoArquivo(XML, () => Promise.reject(new Error('EBUSY'))),
      'nota',
    );
    const inicio = Date.now();
    assert.equal(
      await destinoDoArquivo(XML, () => new Promise(() => {})),
      'nota',
    );
    assert.ok(Date.now() - inicio < 5000, 'esperou demais');
  });
});
