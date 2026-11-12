// Linhas da vista Texto do leitor genérico (src/xml/texto.ts): indentação,
// elemento curto numa linha, quebras, linhas longas, malformado e o limite
// de linhas. Dados inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONTINUACAO,
  formatarTexto,
  LARGURA_LINHA,
  LINHA_CDATA,
  LINHA_COMENTARIO,
  LINHA_DOCTYPE,
  LINHA_INSTRUCAO,
  LINHA_MARCACAO,
  LINHA_MARCACAO_PARTE,
  LINHA_TEXTO,
  linhaDaPosicao,
  numeroDaLinha,
  pedacosDaLinha,
  pedacosDaMarcacao,
  totalNumerado,
  type LinhasTexto,
} from '../../src/xml/texto.ts';

/** Cada linha como "  " por nível + o trecho. */
function mostrar(texto: string, l: LinhasTexto): string[] {
  const saida: string[] = [];
  for (let i = 0; i < l.quantidade; i++) {
    saida.push('  '.repeat(l.nivel[i]) + texto.slice(l.inicio[i], l.fim[i]));
  }
  return saida;
}

describe('formatarTexto', () => {
  it('indenta um XML de uma linha só e junta elemento com texto curto', () => {
    const xml =
      '<?xml version="1.0"?><pedido numero="88"><cliente><nome>Loja Inventada</nome><cnpj>00000000000191</cnpj></cliente><vazio/><itens></itens></pedido>';
    const l = formatarTexto(xml);
    assert.equal(l.indentado, true);
    assert.deepEqual(mostrar(xml, l), [
      '<?xml version="1.0"?>',
      '<pedido numero="88">',
      '  <cliente>',
      '    <nome>Loja Inventada</nome>',
      '    <cnpj>00000000000191</cnpj>',
      '  </cliente>',
      '  <vazio/>',
      '  <itens></itens>',
      '</pedido>',
    ]);
    assert.equal(l.tipo[0], LINHA_INSTRUCAO);
    assert.equal(l.tipo[1], LINHA_MARCACAO);
  });

  it('refaz a indentação de um arquivo já indentado e some com os espaços entre marcações', () => {
    const xml = '<a>\r\n\t\t<b>x</b>\r\n      <c>\n<d/>\n</c>\n</a>\n';
    assert.deepEqual(mostrar(xml, formatarTexto(xml)), [
      '<a>',
      '  <b>x</b>',
      '  <c>',
      '    <d/>',
      '  </c>',
      '</a>',
    ]);
  });

  it('comentário, CDATA e DOCTYPE com quebras viram várias linhas do mesmo tipo', () => {
    const xml =
      '<!DOCTYPE r [\n<!ENTITY e "x">\n]><r><!-- um\n  dois --><![CDATA[a\n\nb]]></r>';
    const l = formatarTexto(xml);
    assert.deepEqual(mostrar(xml, l), [
      '<!DOCTYPE r [',
      '<!ENTITY e "x">',
      ']>',
      '<r>',
      '  <!-- um',
      '  dois -->',
      '  <![CDATA[a',
      '  ',
      '  b]]>',
      '</r>',
    ]);
    assert.equal(l.tipo[0], LINHA_DOCTYPE);
    assert.equal(l.tipo[4], LINHA_COMENTARIO);
    assert.equal(l.tipo[6], LINHA_CDATA);
    assert.equal(l.tipo[7], LINHA_CDATA);
  });

  it('texto misturado com elementos fica em linhas próprias', () => {
    const xml = '<p>Olá <b>mundo</b> fim</p>';
    const l = formatarTexto(xml);
    assert.deepEqual(mostrar(xml, l), [
      '<p>',
      '  Olá',
      '  <b>mundo</b>',
      '  fim',
      '</p>',
    ]);
    assert.equal(l.tipo[1], LINHA_TEXTO);
  });

  it('marcação com atributos em várias linhas: o resto vem um nível abaixo', () => {
    const xml = '<a\n  x="1"\n  y="2">\n<b/></a>';
    const l = formatarTexto(xml);
    assert.deepEqual(mostrar(xml, l), [
      '<a',
      '  x="1"',
      '  y="2">',
      '  <b/>',
      '</a>',
    ]);
    assert.equal(l.tipo[1], LINHA_MARCACAO_PARTE);
  });

  it('texto longo: elemento não junta e a linha quebra em continuações', () => {
    const longo = 'x'.repeat(LARGURA_LINHA * 2 + 5);
    const xml = `<a>${longo}</a>`;
    const l = formatarTexto(xml);
    assert.equal(l.quantidade, 5);
    assert.equal(l.fim[1] - l.inicio[1], LARGURA_LINHA);
    assert.equal(l.tipo[2], LINHA_TEXTO | CONTINUACAO);
    assert.equal(l.tipo[3], LINHA_TEXTO | CONTINUACAO);
    assert.deepEqual([...l.continuacoes], [2, 3]);
    // Numeração: continuações não têm número; a seguinte continua a conta.
    assert.deepEqual(
      [0, 1, 2, 3, 4].map((i) => numeroDaLinha(l, i)),
      [1, 2, 0, 0, 3],
    );
    assert.equal(totalNumerado(l), 3);
  });

  it('malformado não trava nem deixa a indentação negativa', () => {
    const xml = '</x></y><a><b attr="1 <c>texto';
    const l = formatarTexto(xml);
    assert.equal(l.indentado, true);
    for (let i = 0; i < l.quantidade; i++) assert.ok(l.nivel[i] >= 0);
    assert.ok(l.quantidade >= 4);
    // Cobre o texto todo, em ordem.
    for (let i = 1; i < l.quantidade; i++)
      assert.ok(l.inicio[i] >= l.fim[i - 1]);
  });

  it('"<" sozinho no fim e marcação sem fechamento não travam', () => {
    for (const xml of [
      '<',
      '<a',
      '<a x="1',
      '<!--',
      '<![CDATA[',
      '<?pi',
      '<!DOCTYPE',
    ]) {
      const l = formatarTexto(xml);
      assert.ok(l.quantidade >= 1, xml);
    }
    assert.equal(formatarTexto('').quantidade, 0);
  });

  it('sem indentação, linha comprida quebra no primeiro ">" depois de 160 caracteres', () => {
    const det = '<det><x>PARAFUSO INVENTADO</x></det>';
    const xml = `<lista>${det.repeat(40)}</lista>`;
    const l = formatarTexto(xml, 10);
    assert.equal(l.indentado, false);
    assert.equal(l.cortado, false);
    assert.ok(l.quantidade > 5 && l.quantidade < 20);
    for (let i = 0; i < l.quantidade - 1; i++) {
      assert.equal(xml[l.fim[i] - 1], '>', `linha ${i} termina no meio`);
      assert.ok(l.fim[i] - l.inicio[i] >= 160);
      assert.equal(l.inicio[i + 1], l.fim[i]);
    }
    assert.equal(l.fim[l.quantidade - 1], xml.length);
    assert.equal(l.continuacoes.length, 0);
  });

  it('acima do limite de linhas cai no texto sem indentação', () => {
    const xml = '<a>\n<b/>\n<b/>\n<b/>\n</a>';
    const l = formatarTexto(xml, 4);
    assert.equal(l.indentado, false);
    assert.equal(l.cortado, true);
    assert.equal(l.quantidade, 4);
    assert.deepEqual(mostrar(xml, l), ['<a>', '<b/>', '<b/>', '<b/>']);
  });

  it('linhaDaPosicao acha a linha de uma posição do texto', () => {
    const xml = '<a>\n  <b>x</b>\n</a>';
    const l = formatarTexto(xml);
    assert.equal(linhaDaPosicao(l, 0), 0);
    assert.equal(linhaDaPosicao(l, xml.indexOf('x')), 1);
    // Posição num espaço que sumiu: a linha seguinte.
    assert.equal(linhaDaPosicao(l, 4), 1);
    assert.equal(linhaDaPosicao(l, xml.length + 10), 2);
  });
});

describe('pedacosDaLinha', () => {
  it('separa sinais, nomes, atributos, valores e texto', () => {
    assert.deepEqual(pedacosDaMarcacao('<nome a="1" b=\'x>y\'>Loja</nome>'), [
      { classe: 'sinal', texto: '<' },
      { classe: 'nome', texto: 'nome' },
      { classe: 'texto', texto: ' ' },
      { classe: 'atributo', texto: 'a' },
      { classe: 'sinal', texto: '=' },
      { classe: 'valor', texto: '"1"' },
      { classe: 'texto', texto: ' ' },
      { classe: 'atributo', texto: 'b' },
      { classe: 'sinal', texto: '=' },
      { classe: 'valor', texto: "'x>y'" },
      { classe: 'sinal', texto: '>' },
      { classe: 'texto', texto: 'Loja' },
      { classe: 'sinal', texto: '</' },
      { classe: 'nome', texto: 'nome' },
      { classe: 'sinal', texto: '>' },
    ]);
  });

  it('pedaço de marcação quebrada começa nos atributos', () => {
    assert.deepEqual(pedacosDaMarcacao('y="2">', true), [
      { classe: 'atributo', texto: 'y' },
      { classe: 'sinal', texto: '=' },
      { classe: 'valor', texto: '"2"' },
      { classe: 'sinal', texto: '>' },
    ]);
  });

  it('linhas de outros tipos saem inteiras, com a cor do tipo', () => {
    assert.deepEqual(pedacosDaLinha('<!-- <a> -->', LINHA_COMENTARIO), [
      { classe: 'comentario', texto: '<!-- <a> -->' },
    ]);
    assert.deepEqual(pedacosDaLinha('<b>', LINHA_TEXTO), [
      { classe: 'texto', texto: '<b>' },
    ]);
  });

  it('texto com cara de HTML continua sendo só texto', () => {
    const pedacos = pedacosDaMarcacao('<x>&lt;script&gt;alert(1)</x>');
    assert.equal(
      pedacos.map((p) => p.texto).join(''),
      '<x>&lt;script&gt;alert(1)</x>',
    );
  });
});
