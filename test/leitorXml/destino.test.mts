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
/** O texto em UTF-8 com o BOM (EF BB BF) na frente. */
const comBomUtf8 = (s: string) =>
  new Uint8Array([0xef, 0xbb, 0xbf, ...bytes(s)]);
/** Começo de uma NF-e inventada (CNPJ e chave de mentira). */
const NFE_INVENTADA =
  '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe35990100000000000191550010000000011000000019"><ide><cUF>35</cUF><natOp>VENDA DE PARAFUSO INVENTADO</natOp>';
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

  it('BOM UTF-8 fica de fora do texto', () => {
    assert.equal(textoDoComeco(comBomUtf8('<NFe/>')), '<NFe/>');
    assert.equal(
      raizDoComeco(textoDoComeco(comBomUtf8(NFE_INVENTADA))),
      'nfeProc',
    );
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

  it('CT-e, NFS-e e evento da NF-e vão para o modo Documento', () => {
    for (const x of [
      '<?xml version="1.0"?><cteProc versao="4.00">',
      '<CTe xmlns="http://www.portalfiscal.inf.br/cte">',
      '<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse">',
      '<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse versao="2.02">',
      '<ns2:ConsultarNfseRpsResposta xmlns:ns2="http://www.abrasf.org.br/nfse.xsd"><ns2:CompNfse>',
      '<procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
      '<evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    ])
      assert.equal(destinoPeloComeco(XML, bytes(x)), 'documento', x);
  });

  it('outro XML vai para o leitor (MDF-e, catálogo, configuração)', () => {
    for (const x of [
      '<?xml version="1.0"?><mdfeProc versao="3.00">',
      '<evento versao="1.00" xmlns="urn:outro">',
      '<ConsultarNfseRpsResposta><ListaMensagemRetorno>',
      '<catalogo origem="teste">',
      '<!DOCTYPE c [ <!ENTITY e "x"> ]><configuracao/>',
    ])
      assert.equal(destinoPeloComeco(XML, bytes(x)), 'leitor', x);
  });

  it('BOM UTF-8: NF-e com e sem BOM na nota; NFS-e com BOM no Documento; outro XML com BOM no leitor', () => {
    assert.equal(destinoPeloComeco(XML, bytes(NFE_INVENTADA)), 'nota');
    assert.equal(destinoPeloComeco(XML, comBomUtf8(NFE_INVENTADA)), 'nota');
    assert.equal(
      destinoPeloComeco(
        XML,
        comBomUtf8('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'),
      ),
      'nota',
    );
    assert.equal(
      destinoPeloComeco(
        XML,
        comBomUtf8(
          '<?xml version="1.0" encoding="utf-8"?><CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd">',
        ),
      ),
      // Documento fiscal que não é NF-e: o BOM some e a raiz é reconhecida.
      'documento',
    );
    assert.equal(
      destinoPeloComeco(XML, comBomUtf8('<catalogo origem="teste"/>')),
      'leitor',
    );
    // Só o BOM, sem nada depois: o leitor explica (arquivo vazio).
    assert.equal(
      destinoPeloComeco(XML, new Uint8Array([0xef, 0xbb, 0xbf])),
      'leitor',
    );
  });

  it('BOM UTF-8 em CT-e, NFS-e e evento: modo Documento (as duas regras juntas)', () => {
    for (const x of [
      '<?xml version="1.0" encoding="UTF-8"?><cteProc versao="4.00">',
      '<?xml version="1.0" encoding="utf-8"?><CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse versao="2.02">',
      '<NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">',
      '<procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    ])
      assert.equal(destinoPeloComeco(XML, comBomUtf8(x)), 'documento', x);
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
