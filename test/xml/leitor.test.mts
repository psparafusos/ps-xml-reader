// Leitor de XML próprio do leitor genérico (src/xml/leitor.ts): árvore,
// erros com linha e coluna, CDATA, comentários, instruções, DOCTYPE só como
// texto, entidades (só as 5 predefinidas e &#...;), XXE e bomba de entidades
// sem expansão, profundidade (T8) e caracteres de controle (T10). Sem DOM,
// sem rede; os arquivos de ataque são os de test/seguranca/fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  MENSAGEM_PROFUNDIDADE,
  PROFUNDIDADE_MAXIMA,
} from '../../src/xml/limites.ts';
import {
  atributosDe,
  filhosDe,
  lerXml,
  marcarControles,
  NENHUM,
  nomeDe,
  noXml,
  tipoDe,
  posicaoNoTexto,
  trocarEntidades,
  valorDe,
  type NoXml,
} from '../../src/xml/leitor.ts';
import { ler, type LeituraTeste } from './apoio.mts';

const pastaAtaques = join(import.meta.dirname, '..', 'seguranca', 'fixtures');
const ataque = (nome: string) => readFileSync(join(pastaAtaques, nome), 'utf8');

/** Primeiro nó de um tipo (e nome, se dado). */
function primeiro(leitura: LeituraTeste, tipo: NoXml['tipo'], nome?: string) {
  const no = leitura.nos.find(
    (n) => n.tipo === tipo && (nome === undefined || n.nome === nome),
  );
  assert.ok(no, `sem nó ${tipo} ${nome ?? ''}`);
  return no;
}

/** Texto (valores) de todos os filhos de um elemento. */
function textoDe(leitura: LeituraTeste, no: NoXml): string {
  return (no.filhos ?? []).map((f) => leitura.nos[f].valor).join('');
}

const NFE = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="http://exemplo.invalid/x.xsl"?>
<!-- Nota inventada para teste -->
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35261100000000000191550010000000011000000010" versao="4.00">
      <det nItem="1"><prod><xProd>PARAFUSO &amp; PORCA &lt;M8&gt;</xProd></prod></det>
      <det nItem="2"><prod><xProd>ARRUELA &quot;LISA&quot; D&apos;ÁGUA</xProd></prod></det>
      <infAdic><infCpl><![CDATA[Texto <b>livre</b> & sem entidades]]></infCpl></infAdic>
    </infNFe>
  </NFe>
</nfeProc>
`;

describe('XML válido', () => {
  const leitura = ler(NFE);

  it('lê sem erro, sem marcas e sem limite de profundidade', () => {
    assert.equal(leitura.erro, null);
    assert.equal(leitura.profundidadeExcedida, false);
    assert.equal(leitura.controles, 0);
  });

  it('nível do documento: declaração, stylesheet, comentário e raiz', () => {
    const tipos = leitura.raizes.map((r) => {
      const n = leitura.nos[r];
      return `${n.tipo}:${n.nome}`;
    });
    assert.deepEqual(tipos, [
      'instrucao:xml',
      'instrucao:xml-stylesheet',
      'comentario:',
      'elemento:nfeProc',
    ]);
  });

  it('T6: a instrução xml-stylesheet aparece como texto', () => {
    const pi = primeiro(leitura, 'instrucao', 'xml-stylesheet');
    assert.equal(
      pi.valor,
      'type="text/xsl" href="http://exemplo.invalid/x.xsl"',
    );
  });

  it('atributos com nome e valor, na ordem', () => {
    const inf = primeiro(leitura, 'elemento', 'infNFe');
    assert.deepEqual(inf.atributos, [
      { nome: 'Id', valor: 'NFe35261100000000000191550010000000011000000010' },
      { nome: 'versao', valor: '4.00' },
    ]);
  });

  it('as 5 entidades predefinidas viram caractere', () => {
    const xprods = leitura.nos.filter((n) => n.nome === 'xProd');
    assert.equal(textoDe(leitura, xprods[0]), 'PARAFUSO & PORCA <M8>');
    assert.equal(textoDe(leitura, xprods[1]), `ARRUELA "LISA" D'ÁGUA`);
  });

  it('CDATA guarda o conteúdo como está', () => {
    const cdata = primeiro(leitura, 'cdata');
    assert.equal(cdata.valor, 'Texto <b>livre</b> & sem entidades');
    assert.equal(leitura.nos[cdata.pai].nome, 'infCpl');
  });

  it('comentário guarda o conteúdo sem os delimitadores', () => {
    assert.equal(
      primeiro(leitura, 'comentario').valor,
      ' Nota inventada para teste ',
    );
  });

  it('texto só de espaços entre elementos não vira nó', () => {
    assert.ok(
      leitura.nos.every((n) => n.tipo !== 'texto' || n.valor.trim() !== ''),
    );
  });

  it('pais, filhos e posições conferem com o texto', () => {
    for (let i = 0; i < leitura.nos.length; i++) {
      const no = leitura.nos[i];
      for (const f of no.filhos ?? []) assert.equal(leitura.nos[f].pai, i);
      assert.ok(no.inicio < no.fim);
    }
    const raiz = primeiro(leitura, 'elemento', 'nfeProc');
    assert.ok(NFE.slice(raiz.inicio, raiz.fim).startsWith('<nfeProc '));
    assert.ok(NFE.slice(raiz.inicio, raiz.fim).endsWith('</nfeProc>'));
  });

  it('elemento vazio <a/> e aspas simples', () => {
    const r = ler(`<a><b x='1' y = "2"/><c></c></a>`);
    assert.equal(r.erro, null);
    const b = primeiro(r, 'elemento', 'b');
    assert.deepEqual(b.atributos, [
      { nome: 'x', valor: '1' },
      { nome: 'y', valor: '2' },
    ]);
    assert.equal(b.filhos, null);
  });
});

describe('Entidades', () => {
  it('desconhecida fica literal', () => {
    const r = ler('<a>R&eacute;gua &nbsp; &foo; &amp; fim</a>');
    assert.equal(r.erro, null);
    assert.equal(textoDe(r, r.nos[0]), 'R&eacute;gua &nbsp; &foo; & fim');
  });

  it('numéricas decimal e hexadecimal viram caractere', () => {
    assert.equal(trocarEntidades('&#65;&#x42;&#x1F600;'), 'AB😀');
  });

  it('& solto, sem ponto e vírgula ou fora do Unicode fica literal', () => {
    assert.equal(trocarEntidades('A & B'), 'A & B');
    assert.equal(trocarEntidades('&amp'), '&amp');
    assert.equal(trocarEntidades('&#x110000;'), '&#x110000;');
    assert.equal(trocarEntidades('&#xZZ;'), '&#xZZ;');
  });

  it('entidade em atributo', () => {
    const r = ler('<a t="x &lt; y &foo;"/>');
    assert.equal(r.nos[0].atributos?.[0].valor, 'x < y &foo;');
  });
});

describe('DOCTYPE, XXE e bomba de entidades: só texto, nunca expandidos', () => {
  const casos = [
    ['T1, arquivo do PC', 'xxe-arquivo.xml'],
    ['T2, rede por http', 'xxe-http.xml'],
    ['T3, compartilhamento UNC', 'xxe-unc.xml'],
    ['T4, bomba de entidades', 'bomba-entidades.xml'],
    ['T5, entidades recursivas e de parâmetro', 'entidade-recursiva.xml'],
  ] as const;

  for (const [nome, arquivo] of casos) {
    it(`${nome} (${arquivo})`, () => {
      const texto = ataque(arquivo);
      const inicio = performance.now();
      const r = ler(texto);
      const ms = performance.now() - inicio;
      assert.equal(r.erro, null, JSON.stringify(r.erro));
      assert.ok(ms < 100, `levou ${ms} ms`);

      // O DOCTYPE inteiro é um nó de texto, igual ao arquivo.
      const doctype = primeiro(r, 'doctype');
      assert.equal(doctype.valor, texto.slice(doctype.inicio, doctype.fim));
      assert.match(doctype.valor, /^<!DOCTYPE nfeProc \[/);
      assert.match(doctype.valor, /\]>$/);

      // Nenhum valor da árvore ficou maior que o arquivo (nada expandiu) e
      // as referências às entidades continuam literais.
      const total = r.nos.reduce((s, n) => s + n.valor.length, 0);
      assert.ok(total <= texto.length);
      for (const n of r.nos) {
        assert.doesNotMatch(n.valor, /\[fonts\]|\[extensions\]|lollol/i);
      }
      const literais = r.nos
        .filter((n) => n.tipo === 'texto')
        .map((n) => n.valor)
        .filter((v) => /&[a-z0-9]+;/.test(v));
      assert.ok(literais.length >= 1, 'a referência devia ficar literal');
    });
  }

  it('bomba: &lol9; aparece literal no xProd', () => {
    const r = ler(ataque('bomba-entidades.xml'));
    assert.equal(textoDe(r, primeiro(r, 'elemento', 'xProd')), '&lol9;');
  });

  it('DOCTYPE com ">" dentro de aspas e de comentário', () => {
    const texto = `<!DOCTYPE a [<!-- > --><!ENTITY x "a>b">]><a>&x;</a>`;
    const r = ler(texto);
    assert.equal(r.erro, null);
    assert.equal(
      primeiro(r, 'doctype').valor,
      texto.slice(0, texto.indexOf('<a>')),
    );
    assert.equal(textoDe(r, primeiro(r, 'elemento', 'a')), '&x;');
  });

  it('DOCTYPE depois da raiz é erro', () => {
    const r = ler('<a/><!DOCTYPE a>');
    assert.match(r.erro?.motivo ?? '', /DOCTYPE só pode vir antes/);
  });
});

describe('XML malformado: linha, coluna e árvore até onde deu', () => {
  const casos: [string, string, number, number, RegExp][] = [
    [
      'fechamento trocado',
      '<a>\n  <b>x</c>\n</a>',
      2,
      7,
      /<\/c> não corresponde ao elemento aberto <b>/,
    ],
    [
      'fim com elemento aberto',
      '<a>\n<b>',
      2,
      4,
      /terminou com o elemento <b> aberto/,
    ],
    ['texto fora da raiz', '<a/>\nsobra', 2, 1, /texto fora do elemento raiz/],
    ['duas raízes', '<a/>\n<b/>', 2, 1, /mais de um elemento raiz/],
    ['atributo sem aspas', '<a x=1/>', 1, 6, /precisa de aspas/],
    ['atributo repetido', '<a x="1" x="2"/>', 1, 10, /x aparece repetido/],
    ['"<" em atributo', '<a x="1<2"/>', 1, 8, /tem "<"/],
    ['sem espaço entre atributos', '<a x="1"y="2"/>', 1, 9, /Falta espaço/],
    [
      'sem "=" no atributo',
      '<a x "1"/>',
      1,
      6,
      /Falta "=" depois do atributo x/,
    ],
    ['nome inválido', '<a>< b/></a>', 1, 5, /Falta o nome do elemento/],
    ['comentário sem fechar', '<a><!-- x', 1, 4, /comentário não foi fechado/],
    ['CDATA sem fechar', '<a><![CDATA[x', 1, 4, /CDATA não foi fechado/],
    [
      'instrução sem fechar',
      '<?xml version="1.0"\n<a/>',
      1,
      1,
      /instrução de processamento/,
    ],
    ['marcação sem ">"', '<a>\n<b x="1"', 2, 1, /<b> não foi fechada/],
    [
      'sem nenhum elemento',
      '<!-- só comentário -->',
      1,
      23,
      /não tem nenhum elemento/,
    ],
    ['fechamento sem abertura', '</a>', 1, 1, /<\/a> não tem elemento aberto/],
    [
      'CRLF conta como uma quebra',
      '<a>\r\n\r\n<b></a>',
      3,
      4,
      /não corresponde/,
    ],
  ];

  for (const [nome, texto, linha, coluna, motivo] of casos) {
    it(nome, () => {
      const r = ler(texto);
      assert.ok(r.erro, 'devia dar erro');
      assert.equal(r.erro.linha, linha, `linha de ${JSON.stringify(r.erro)}`);
      assert.equal(
        r.erro.coluna,
        coluna,
        `coluna de ${JSON.stringify(r.erro)}`,
      );
      assert.match(r.erro.motivo, motivo);
    });
  }

  it('devolve a árvore lida antes do erro', () => {
    const r = ler('<a><b>um</b><c>dois</c><d>tr</x></a>');
    assert.deepEqual(
      r.nos.filter((n) => n.tipo === 'elemento').map((n) => n.nome),
      ['a', 'b', 'c', 'd'],
    );
    assert.equal(textoDe(r, primeiro(r, 'elemento', 'c')), 'dois');
  });

  it('posicaoNoTexto com LF, CRLF e CR', () => {
    assert.deepEqual(posicaoNoTexto('ab\ncd', 4), { linha: 2, coluna: 2 });
    assert.deepEqual(posicaoNoTexto('ab\r\ncd', 5), { linha: 2, coluna: 2 });
    assert.deepEqual(posicaoNoTexto('ab\rcd', 3), { linha: 2, coluna: 1 });
  });
});

describe('T8: profundidade', () => {
  it('100 mil níveis: para em 1.000, sem estouro de pilha, rápido', () => {
    const texto = '<a>'.repeat(100000) + '</a>'.repeat(100000);
    const inicio = performance.now();
    const r = ler(texto);
    const ms = performance.now() - inicio;
    assert.equal(r.profundidadeExcedida, true);
    assert.equal(r.erro, null);
    assert.equal(r.nos.length, PROFUNDIDADE_MAXIMA);
    assert.ok(ms < 2000, `levou ${ms} ms`);
    assert.equal(
      MENSAGEM_PROFUNDIDADE,
      'O arquivo tem mais de 1.000 níveis; mostrando como texto.',
    );
  });

  it('exatamente 1.000 níveis ainda é árvore', () => {
    const texto = '<a>'.repeat(1000) + '</a>'.repeat(1000);
    const r = ler(texto);
    assert.equal(r.profundidadeExcedida, false);
    assert.equal(r.erro, null);
    assert.equal(r.nos.length, 1000);
  });

  it('1.001 níveis passa do limite', () => {
    const texto = '<a>'.repeat(1001) + '</a>'.repeat(1001);
    assert.equal(ler(texto).profundidadeExcedida, true);
  });

  it('a árvore lida não tem caminhos maiores que o limite', () => {
    const r = ler('<a>'.repeat(5000));
    let maior = 0;
    for (let i = 0; i < r.nos.length; i++) {
      let nivel = 0;
      for (let p = i; p !== -1; p = r.nos[p].pai) nivel++;
      maior = Math.max(maior, nivel);
    }
    assert.equal(maior, PROFUNDIDADE_MAXIMA);
  });
});

describe('T10: caracteres de controle marcados e contados', () => {
  it('&#x1; no texto vira [U+0001] e é contado', () => {
    const r = ler('<xProd>PARAFUSO&#x1;M8</xProd>');
    assert.equal(r.erro, null);
    assert.equal(textoDe(r, r.nos[0]), 'PARAFUSO[U+0001]M8');
    assert.equal(r.controles, 1);
  });

  it('controles crus no texto, no atributo e no comentário', () => {
    const r = ler('<a t="x\u0002"><!--\u001F-->y\u0001z\u0008</a>');
    assert.equal(r.erro, null);
    assert.equal(r.nos[0].atributos?.[0].valor, 'x[U+0002]');
    assert.equal(primeiro(r, 'comentario').valor, '[U+001F]');
    assert.equal(primeiro(r, 'texto').valor, 'y[U+0001]z[U+0008]');
    assert.equal(r.controles, 4);
  });

  it('tab, LF, CR, U+202E e U+200B não são marcados', () => {
    const texto = 'a\tb\nc\rd‮e​f';
    assert.equal(marcarControles(texto), texto);
    assert.equal(ler(`<a>${texto}</a>`).controles, 0);
  });

  it('U+FFFE, U+FFFF e substituto solto são marcados; par válido não', () => {
    assert.equal(marcarControles('￾￿'), '[U+FFFE][U+FFFF]');
    assert.equal(marcarControles('x\uD800y'), 'x[U+D800]y');
    assert.equal(marcarControles('😀'), '😀');
  });
});

describe('Árvore compacta', () => {
  it('colunas em typed arrays, nomes sem repetição, valores numa string', () => {
    const r = lerXml('<a x="1"><b>um</b><b>dois</b><c x="2"/></a>');
    assert.ok(r.tipo instanceof Uint8Array);
    assert.ok(r.pai instanceof Int32Array);
    assert.equal(r.tipo.length, r.quantidade);
    assert.deepEqual(r.nomes, ['a', 'x', 'b', 'c']);
    assert.equal(r.valores, '1umdois2');
  });

  it('passa por structuredClone (o que o postMessage faz) sem perder nada', () => {
    const r = lerXml(NFE);
    const copia = structuredClone(r);
    assert.deepEqual(copia, r);
    assert.deepEqual(noXml(copia, 3), noXml(r, 3));
  });

  it('filhosDe, atributosDe e o nível do documento', () => {
    const r = lerXml('<?pi x?><a k="v"><b/>t</a>');
    assert.deepEqual(
      filhosDe(r, NENHUM).map((n) => nomeDe(r, n)),
      ['pi', 'a'],
    );
    const a = filhosDe(r, NENHUM)[1];
    assert.deepEqual(atributosDe(r, a), [{ nome: 'k', valor: 'v' }]);
    assert.deepEqual(
      filhosDe(r, a).map((n) => tipoDe(r, n)),
      ['elemento', 'texto'],
    );
    assert.equal(valorDe(r, filhosDe(r, a)[1]), 't');
  });

  it('nomes parecidos (mesmo tamanho e mesmas pontas) não se confundem', () => {
    const nomes = ['abca', 'abda', 'aXca', 'abcb', 'bbca', 'a1c2', 'a2c1'];
    const xml = `<r>${nomes.map((n) => `<${n} ${n}="1"/>`).join('')}${nomes.map((n) => `<${n}/>`).join('')}</r>`;
    const r = ler(xml);
    assert.equal(r.erro, null);
    const elementos = r.nos
      .filter((n) => n.tipo === 'elemento')
      .map((n) => n.nome);
    assert.deepEqual(elementos, ['r', ...nomes, ...nomes]);
    const atributos = r.nos
      .flatMap((n) => n.atributos ?? [])
      .map((a) => a.nome);
    assert.deepEqual(atributos, nomes);
  });

  it('fechamento confere o nome mesmo com o cache de nomes', () => {
    const r = ler('<abca><abda></abca></abda>');
    assert.match(
      r.erro?.motivo ?? '',
      /<\/abca> não corresponde ao elemento aberto <abda>/,
    );
  });
});
