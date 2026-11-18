// Que documento fiscal é o XML (src/docfiscal/tipo.ts): pelo começo do
// arquivo (processo principal) e pela árvore (tela). XML inventados, só com
// a estrutura de cada tipo.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOMParserMinimo } from '../apoioDom.mts';
import {
  identificar,
  MOTIVO_DESCONHECIDO,
  NOME_AUXILIAR,
  tipoPeloComeco,
  type ElementoXml,
} from '../../src/docfiscal/tipo.ts';

const raiz = (xml: string) =>
  new DOMParserMinimo().parseFromString(xml).documentElement as ElementoXml;

const NFE = (mod: string) =>
  `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe1"><ide><mod>${mod}</mod></ide></infNFe></NFe></nfeProc>`;

describe('tipoPeloComeco', () => {
  const casos: [string, string, string | null][] = [
    ['nfeProc', '<nfeProc versao="4.00">', 'nfe'],
    ['cteProc', '<cteProc versao="4.00">', 'cte'],
    ['CTe', '<CTe xmlns="http://www.portalfiscal.inf.br/cte">', 'cte'],
    [
      'NFSe',
      '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">',
      'nfse-nacional',
    ],
    ['CompNfse', '<CompNfse><Nfse versao="2.02">', 'nfse-abrasf'],
    ['Nfse', '<Nfse versao="2.02">', 'nfse-abrasf'],
    [
      'ConsultarNfseFaixaResposta',
      '<ConsultarNfseFaixaResposta><ListaNfse><CompNfse>',
      'nfse-abrasf',
    ],
    [
      'ConsultarNfseFaixaResposta',
      '<ConsultarNfseFaixaResposta><ListaMensagemRetorno>',
      null,
    ],
    ['procEventoNFe', '<procEventoNFe versao="1.00">', 'evento-nfe'],
    [
      'evento',
      '<evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
      'evento-nfe',
    ],
    ['evento', '<evento xmlns="urn:agenda">', null],
    ['mdfeProc', '<mdfeProc>', null],
    ['catalogo', '<catalogo>', null],
  ];
  for (const [r, comeco, tipo] of casos)
    it(`${comeco} -> ${tipo}`, () => {
      assert.equal(tipoPeloComeco(r, comeco), tipo);
    });
});

describe('identificar pela árvore', () => {
  it('NF-e modelo 55 e NFC-e modelo 65', () => {
    const a = identificar(raiz(NFE('55')));
    const b = identificar(raiz(NFE('65')));
    assert.equal(a.tipo, 'nfe');
    assert.equal(b.tipo, 'nfce');
  });

  it('CT-e com e sem protocolo', () => {
    for (const xml of [
      '<cteProc><CTe><infCte Id="CTe1"/></CTe><protCTe/></cteProc>',
      '<CTe xmlns="http://www.portalfiscal.inf.br/cte"><infCte Id="CTe1"/></CTe>',
    ]) {
      const id = identificar(raiz(xml));
      assert.equal(id.tipo, 'cte');
    }
  });

  it('NFS-e Nacional', () => {
    const id = identificar(
      raiz(
        '<NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS1"/></NFSe>',
      ),
    );
    assert.equal(id.tipo, 'nfse-nacional');
  });

  it('ABRASF: CompNfse sozinha e uma lista com duas notas', () => {
    const uma = identificar(
      raiz(
        '<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse versao="2.02"><InfNfse/></Nfse></CompNfse>',
      ),
    );
    assert.equal(uma.tipo, 'nfse-abrasf');
    const lista = identificar(
      raiz(
        '<ns2:ConsultarNfseFaixaResposta xmlns:ns2="http://www.abrasf.org.br/nfse.xsd"><ns2:ListaNfse>' +
          '<ns2:CompNfse><ns2:Nfse><ns2:InfNfse/></ns2:Nfse></ns2:CompNfse>' +
          '<ns2:CompNfse><ns2:Nfse><ns2:InfNfse/></ns2:Nfse></ns2:CompNfse>' +
          '</ns2:ListaNfse></ns2:ConsultarNfseFaixaResposta>',
      ),
    );
    assert.equal(lista.tipo, 'nfse-abrasf');
    assert.equal(lista.tipo === 'nfse-abrasf' && lista.elementos.length, 2);
  });

  it('evento da NF-e (com e sem o retorno)', () => {
    for (const xml of [
      '<procEventoNFe><evento><infEvento><chNFe>1</chNFe></infEvento></evento><retEvento/></procEventoNFe>',
      '<evento><infEvento><chNFe>1</chNFe></infEvento></evento>',
    ])
      assert.equal(identificar(raiz(xml)).tipo, 'evento-nfe');
  });

  it('documento fiscal sem documento auxiliar: o motivo diz qual', () => {
    const id = identificar(raiz('<mdfeProc><MDFe/></mdfeProc>'));
    assert.equal(id.tipo, null);
    assert.match(id.tipo === null ? id.motivo : '', /MDF-e/);
  });

  it('outro XML: motivo genérico', () => {
    const id = identificar(raiz('<catalogo/>'));
    assert.deepEqual(id, { tipo: null, motivo: MOTIVO_DESCONHECIDO });
  });

  it('nomes dos documentos auxiliares', () => {
    assert.deepEqual(Object.values(NOME_AUXILIAR), [
      'DANFE',
      'DANFE NFC-e',
      'DACTE',
      'DANFSe',
      'DANFSe',
      'Evento',
    ]);
  });
});
