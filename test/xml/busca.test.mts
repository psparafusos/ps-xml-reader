// Busca na árvore do leitor genérico (src/xml/busca.ts): nomes, atributos e
// textos, com o caminho da raiz até cada achado. Dados inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buscar, caminhoLegivel } from '../../src/xml/busca.ts';
import { ler } from './apoio.mts';

const XML = `<?xml version="1.0"?>
<?xml-stylesheet href="parafuso.xsl"?>
<nfeProc versao="4.00">
  <!-- comentário sobre arruela -->
  <NFe>
    <infNFe Id="NFe35261100000000000191550010000000011000000010">
      <det nItem="1"><prod><xProd>PARAFUSO SEXTAVADO</xProd><CFOP>5102</CFOP></prod></det>
      <det nItem="2"><prod><xProd>Arruela lisa</xProd><CFOP>5405</CFOP></prod></det>
      <det nItem="3" obs="parafuso de reposição"><prod><xProd><![CDATA[Porca <M8>]]></xProd></prod></det>
    </infNFe>
  </NFe>
</nfeProc>`;

const leitura = ler(XML);

describe('Busca', () => {
  it('o XML de teste lê sem erro', () => {
    assert.equal(leitura.erro, null);
  });

  it('acha em texto, valor de atributo e instrução, sem diferenciar maiúsculas', () => {
    const { achados, truncado } = buscar(leitura, 'parafuso');
    assert.equal(truncado, false);
    const resumo = achados.map(
      (a) => `${a.lugar} ${caminhoLegivel(leitura, a.no)}`,
    );
    assert.deepEqual(resumo, [
      'texto /instrucao(xml-stylesheet)',
      'texto /nfeProc/NFe/infNFe/det[1]/prod/xProd/texto()',
      'valorAtributo /nfeProc/NFe/infNFe/det[3]',
    ]);
  });

  it('o caminho vai da raiz do documento até o nó', () => {
    const { achados } = buscar(leitura, 'Arruela lisa');
    assert.equal(achados.length, 1);
    const nomes = achados[0].caminho.map(
      (i) => leitura.nos[i].nome || leitura.nos[i].tipo,
    );
    assert.deepEqual(nomes, [
      'nfeProc',
      'NFe',
      'infNFe',
      'det',
      'prod',
      'xProd',
      'texto',
    ]);
    assert.equal(achados[0].caminho.at(-1), achados[0].no);
  });

  it('acha nomes de elementos e de atributos', () => {
    const elementos = buscar(leitura, 'cfop').achados;
    assert.equal(elementos.length, 2);
    assert.ok(elementos.every((a) => a.lugar === 'nome'));

    const atributos = buscar(leitura, 'nItem').achados;
    assert.equal(atributos.length, 3);
    assert.ok(
      atributos.every((a) => a.lugar === 'atributo' && a.atributo === 0),
    );
  });

  it('acha em comentário e em CDATA', () => {
    const lugares = (termo: string) =>
      buscar(leitura, termo).achados.map((a) => leitura.nos[a.no].tipo);
    assert.deepEqual(lugares('arruela'), ['comentario', 'texto']);
    assert.deepEqual(lugares('<M8>'), ['cdata']);
  });

  it('diferenciar maiúsculas quando pedido', () => {
    assert.equal(
      buscar(leitura, 'PARAFUSO', { diferenciarMaiusculas: true }).achados
        .length,
      1,
    );
    assert.equal(
      buscar(leitura, 'parafuso', { diferenciarMaiusculas: true }).achados
        .length,
      2,
    );
  });

  it('termo vazio ou ausente não acha nada', () => {
    assert.deepEqual(buscar(leitura, ''), { achados: [], truncado: false });
    assert.deepEqual(buscar(leitura, 'inexistente'), {
      achados: [],
      truncado: false,
    });
  });

  it('para no limite de achados e avisa', () => {
    const muitos = ler(`<a>${'<b>x</b>'.repeat(50)}</a>`);
    const r = buscar(muitos, 'x', { limite: 10 });
    assert.equal(r.achados.length, 10);
    assert.equal(r.truncado, true);
    assert.equal(buscar(muitos, 'x', { limite: 50 }).truncado, false);
  });

  it('busca em árvore parcial de XML malformado', () => {
    const parcial = ler('<a><b>achado</b><c>');
    assert.ok(parcial.erro);
    assert.equal(buscar(parcial, 'achado').achados.length, 1);
  });
});
