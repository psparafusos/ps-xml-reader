// XML de importação (src/nfe/importacao.ts) contra a NF-e e o cadastro
// inventados de test/fixtures/importacao: um item por regra (vínculo que
// concorda, vínculo para outro produto, sem vínculo e só código de barras,
// produto sem código de barras, fator 12 de CX para UN, sem fator com
// unidade diferente, item sem produto), campo a campo, os totais iguais ao
// original, o original intacto, a cópia sem a assinatura e com a marca, e a
// leitura da cópia reconhecendo a marca.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  prepararCadastro,
  vinculosDoCodigo,
} from '../src/cadastro/casamento.ts';
import type { EscolhaCodigoCasa } from '../src/cadastro/codigoCasa.ts';
import { validarTextoCadastro } from '../src/cadastro/formato.ts';
import {
  cProdComPrefixo,
  ehCopiaImportacao,
  montarImportacao,
  planejarImportacao,
  type DadosCadastroItem,
  type ItemParaImportacao,
} from '../src/nfe/importacao.ts';
import { lerArquivo } from '../src/nfe/parser.ts';
import { ligarDomMinimo } from './apoioDom.mts';

ligarDomMinimo();

const PASTA = new URL('./fixtures/importacao/', import.meta.url);
const ARQ_NOTA = new URL('nfe-importacao.xml', PASTA);
const bytesOriginais = readFileSync(ARQ_NOTA);
const hashOriginal = createHash('sha256').update(bytesOriginais).digest('hex');
const ORIGINAL = bytesOriginais.toString('utf8');

const lido = validarTextoCadastro(
  readFileSync(new URL('cadastro.json', PASTA), 'utf8'),
);
if (!lido.ok) throw new Error(`cadastro inventado inválido: ${lido.erros}`);
const indice = prepararCadastro(lido.cadastro);
const EMITENTE = '55555555000191';

const nota = lerArquivo(ORIGINAL).nota;

function escolha(
  codigo: string,
  origem: EscolhaCodigoCasa['origem'],
  fator: number | null = null,
  unidadeCompra = 'UN',
): EscolhaCodigoCasa {
  return {
    codigo,
    descricao: indice.produtos.get(codigo)?.descricao ?? '',
    unidade: indice.produtos.get(codigo)?.unidade ?? '',
    fator,
    unidadeCompra,
    origem,
    confianca: origem === 'motor' ? 'alta' : null,
  };
}

/** O mesmo que o processo principal devolve (cadastroGestao.dadosImportacao). */
function dadosDe(
  itens: readonly ItemParaImportacao[],
  escolhas: ReadonlyMap<string, EscolhaCodigoCasa>,
  emitente = EMITENTE,
): Map<string, DadosCadastroItem> {
  const r = new Map<string, DadosCadastroItem>();
  for (const i of itens) {
    const e = escolhas.get(i.nItem);
    if (!e?.codigo) continue;
    const p = indice.produtos.get(e.codigo);
    r.set(i.nItem, {
      existe: p !== undefined,
      codigoBarras: p?.codigoBarras ?? null,
      unidade: p?.unidade ?? '',
      vinculosCProd: vinculosDoCodigo(indice, emitente, i.cProd),
    });
  }
  return r;
}

const ESCOLHAS = new Map<string, EscolhaCodigoCasa>([
  ['1', escolha('2001', 'motor')],
  ['2', escolha('2006', 'pessoa')],
  ['3', escolha('2002', 'lembrada')],
  ['4', escolha('2003', 'motor')],
  ['5', escolha('2004', 'motor', 12, 'CX')],
  ['6', escolha('2005', 'pessoa', null, 'CX')],
]);

const plano = planejarImportacao(
  nota.itens,
  ESCOLHAS,
  dadosDe(nota.itens, ESCOLHAS),
);
const AGORA = new Date(2026, 10, 26, 14, 30, 5);
const COPIA = montarImportacao(ORIGINAL, plano, AGORA);
const lidaCopia = lerArquivo(COPIA);
const itemCopia = (n: string) =>
  lidaCopia.nota.itens.find((i) => i.nItem === n)!;
const itemOriginal = (n: string) => nota.itens.find((i) => i.nItem === n)!;

/** O <prod> de um item no texto. */
function prodDe(texto: string, nItem: string): string {
  const m = new RegExp(
    `<det nItem="${nItem}">\\s*<prod>([\\s\\S]*?)</prod>`,
  ).exec(texto);
  assert.ok(m, `sem o prod do item ${nItem}`);
  return m[1];
}
const valor = (prod: string, tag: string) =>
  new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(prod)?.[1] ?? null;

describe('XML de importação: plano item a item', () => {
  const sit = (n: string) => plano.itens.find((i) => i.nItem === n)!;

  it('conta vinculados, convertidos e os que ficam como vieram, por motivo', () => {
    assert.equal(plano.vinculados, 4);
    assert.equal(plano.convertidos, 1);
    assert.equal(plano.comoVieram, 3);
    assert.deepEqual(plano.porMotivo, {
      'sem-produto': 1,
      'sem-codigo-barras': 1,
      'sem-fator': 1,
    });
    assert.deepEqual(
      plano.itens.map((i) => i.situacao),
      [
        'vinculado',
        'vinculado',
        'vinculado',
        'sem-codigo-barras',
        'convertido',
        'sem-fator',
        'sem-produto',
      ],
    );
  });

  it('vínculo do emitente para o mesmo produto: mantém o cProd', () => {
    assert.equal(sit('1').troca?.cProd, 'PF-320');
    assert.equal(sit('1').troca?.cProdTrocado, false);
  });

  it('vínculo do emitente para outro produto: cProd com PSR-', () => {
    assert.equal(sit('2').troca?.cProd, 'PSR-FT-1');
    assert.equal(sit('2').troca?.cProdTrocado, true);
    assert.match(sit('2').detalhe, /vinculado a outro produto/);
  });

  it('sem vínculo do emitente para o cProd: mantém o cProd', () => {
    assert.deepEqual(vinculosDoCodigo(indice, EMITENTE, 'PC-14'), []);
    assert.equal(sit('3').troca?.cProd, 'PC-14');
    assert.equal(sit('3').troca?.cProdTrocado, false);
  });

  it('o vínculo pelo código de barras (caminho d) não muda a regra do cProd', () => {
    // O emitente tem o GTIN do item vinculado a outro produto, mas não tem
    // vínculo para o cProd: o cProd fica.
    const c = validarTextoCadastro(
      JSON.stringify({
        ...JSON.parse(readFileSync(new URL('cadastro.json', PASTA), 'utf8')),
        vinculos: [
          {
            fornecedor: EMITENTE,
            codigo_fornecedor: '7890000020023',
            produto: '2001',
          },
        ],
      }),
    );
    assert.ok(c.ok);
    const ind = prepararCadastro(c.cadastro);
    assert.deepEqual(vinculosDoCodigo(ind, EMITENTE, 'PC-14'), []);
  });

  it('cProd com prefixo corta o fim do original em 60 caracteres', () => {
    const longo = 'A'.repeat(58) + 'XYZ';
    const r = cProdComPrefixo(longo);
    assert.equal(r.length, 60);
    assert.equal(r, `PSR-${'A'.repeat(56)}`);
    assert.equal(cProdComPrefixo('FT-1'), 'PSR-FT-1');
  });

  it('sem fator e com unidade diferente da de venda: fica todo como veio', () => {
    assert.equal(sit('6').situacao, 'sem-fator');
    assert.equal(sit('6').troca, null);
  });

  it('fator 1 ou mesma unidade: vincula sem converter', () => {
    const itens: ItemParaImportacao[] = [
      { nItem: '1', cProd: 'Q-1', xProd: 'X', uCom: 'CX' },
      { nItem: '2', cProd: 'Q-2', xProd: 'Y', uCom: 'un' },
    ];
    const esc = new Map([
      ['1', escolha('2004', 'pessoa', 1, 'CX')],
      ['2', escolha('2004', 'pessoa', 12, 'CX')],
    ]);
    const p = planejarImportacao(itens, esc, dadosDe(itens, esc));
    assert.deepEqual(
      p.itens.map((i) => [i.situacao, i.troca?.conversao ?? null]),
      [
        ['vinculado', null],
        ['vinculado', null],
      ],
    );
  });

  it('fator para outra unidade de compra: conta como sem fator', () => {
    const itens: ItemParaImportacao[] = [
      { nItem: '1', cProd: 'BC-6', xProd: 'X', uCom: 'PCT' },
    ];
    const esc = new Map([['1', escolha('2004', 'motor', 12, 'CX')]]);
    const p = planejarImportacao(itens, esc, dadosDe(itens, esc));
    assert.equal(p.itens[0].situacao, 'sem-fator');
  });

  it('"nenhum" e produto fora do cadastro: sem produto', () => {
    const itens: ItemParaImportacao[] = [
      { nItem: '1', cProd: 'A', xProd: 'X', uCom: 'UN' },
      { nItem: '2', cProd: 'B', xProd: 'Y', uCom: 'UN' },
    ];
    const esc = new Map<string, EscolhaCodigoCasa>([
      ['1', { ...escolha('2001', 'pessoa'), codigo: null }],
      ['2', escolha('9999', 'lembrada')],
    ]);
    const p = planejarImportacao(itens, esc, dadosDe(itens, esc));
    assert.deepEqual(
      p.itens.map((i) => i.situacao),
      ['sem-produto', 'sem-produto'],
    );
    assert.match(p.itens[1].detalhe, /não está no cadastro/);
  });
});

describe('XML de importação: o texto da cópia', () => {
  it('item 1 (vínculo que concorda): código de barras do cadastro, cProd original', () => {
    const i = itemCopia('1');
    assert.equal(i.cProd, 'PF-320');
    assert.equal(i.cEAN, '7890000020016');
    assert.equal(valor(prodDe(COPIA, '1'), 'cEANTrib'), '7890000020016');
    assert.equal(i.uCom, 'UN');
    assert.equal(i.qCom, '100.0000');
    assert.equal(i.vUnCom, '0.1000');
  });

  it('item 2 (vínculo para outro produto): PSR- no cProd', () => {
    const i = itemCopia('2');
    assert.equal(i.cProd, 'PSR-FT-1');
    assert.equal(i.cEAN, '7890000020061');
    assert.equal(valor(prodDe(COPIA, '2'), 'cEANTrib'), '7890000020061');
  });

  it('item 3 (só código de barras): código interno com zeros à esquerda, como está no cadastro', () => {
    const i = itemCopia('3');
    assert.equal(i.cProd, 'PC-14');
    assert.equal(i.cEAN, '000123456');
    assert.equal(valor(prodDe(COPIA, '3'), 'cEANTrib'), '000123456');
  });

  it('itens 4, 6 e 7 (sem código de barras, sem fator, sem produto): como vieram', () => {
    for (const n of ['4', '6', '7'])
      assert.equal(prodDe(COPIA, n), prodDe(ORIGINAL, n), `item ${n}`);
  });

  it('item 5 (fator 12 de CX para UN): quantidade e unitário na unidade de venda', () => {
    const p = prodDe(COPIA, '5');
    assert.equal(valor(p, 'cProd'), 'BC-6');
    assert.equal(valor(p, 'cEAN'), '7890000020047');
    assert.equal(valor(p, 'cEANTrib'), '7890000020047');
    assert.equal(valor(p, 'uCom'), 'UN');
    assert.equal(valor(p, 'qCom'), '36.0000');
    assert.equal(valor(p, 'vUnCom'), '1.5000000000');
    assert.equal(valor(p, 'uTrib'), 'UN');
    assert.equal(valor(p, 'qTrib'), '36.0000');
    assert.equal(valor(p, 'vUnTrib'), '1.5000000000');
    assert.equal(valor(p, 'vProd'), '54.00');
  });

  it('casas decimais do leiaute: qCom com 4, vUnCom com 10', () => {
    for (const i of lidaCopia.nota.itens) {
      assert.match(i.qCom, /^\d+(\.\d{1,4})?$/);
      assert.match(i.vUnCom, /^\d+(\.\d{1,10})?$/);
    }
  });

  it('vProd, impostos, totais, frete e duplicatas iguais ao original', () => {
    const soma = (itens: typeof nota.itens, campo: 'vProd' | 'vICMS') =>
      itens.reduce((s, i) => s + Number(i[campo]), 0).toFixed(2);
    assert.equal(
      soma(lidaCopia.nota.itens, 'vProd'),
      soma(nota.itens, 'vProd'),
    );
    assert.equal(
      soma(lidaCopia.nota.itens, 'vICMS'),
      soma(nota.itens, 'vICMS'),
    );
    assert.deepEqual(lidaCopia.nota.totais, nota.totais);
    assert.equal(lidaCopia.nota.totais.vNF, '215.00');
    assert.deepEqual(lidaCopia.nota.transporte, nota.transporte);
    assert.deepEqual(lidaCopia.nota.duplicatas, nota.duplicatas);
    assert.deepEqual(lidaCopia.nota.emitente, nota.emitente);
    assert.deepEqual(lidaCopia.nota.destinatario, nota.destinatario);
    assert.deepEqual(lidaCopia.nota.infAdic, nota.infAdic);
    assert.deepEqual(lidaCopia.nota.protocolo, nota.protocolo);
    assert.equal(lidaCopia.nota.chave, nota.chave);
    for (const n of ['1', '2', '3', '4', '5', '6', '7']) {
      const a = itemCopia(n);
      const b = itemOriginal(n);
      assert.equal(a.vProd, b.vProd, `vProd do item ${n}`);
      assert.equal(a.xProd, b.xProd, `xProd do item ${n}`);
      assert.equal(a.NCM, b.NCM, `NCM do item ${n}`);
      assert.equal(a.CFOP, b.CFOP, `CFOP do item ${n}`);
    }
  });

  it('fora dos <prod> trocados, o texto é o original sem a assinatura', () => {
    const semProd = (t: string) =>
      t.replace(/<prod>[\s\S]*?<\/prod>/g, '<prod/>');
    const semMarca = COPIA.replace(/\n<\?ps-reader [^?]*\?>/, '');
    const semAssinatura = ORIGINAL.replace(
      /[ \t]*<Signature[\s\S]*?<\/Signature>\r?\n/,
      '',
    );
    assert.equal(semProd(semMarca), semProd(semAssinatura));
  });

  it('a cópia não tem Signature e tem a marca do app no topo', () => {
    assert.doesNotMatch(COPIA, /Signature/);
    assert.ok(
      COPIA.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<?ps-reader copia="importacao" gerado-em="2026-11-26T14:30:05"',
      ),
    );
    assert.ok(ehCopiaImportacao(COPIA));
    assert.ok(!ehCopiaImportacao(ORIGINAL));
  });

  it('o original fica intacto byte a byte', () => {
    const depois = readFileSync(ARQ_NOTA);
    assert.equal(
      createHash('sha256').update(depois).digest('hex'),
      hashOriginal,
    );
    assert.ok(ORIGINAL.includes('<Signature'));
    assert.ok(ORIGINAL.includes('<cProd>FT-1</cProd>'));
  });

  it('abrir a cópia: a leitura reconhece a cópia de importação', () => {
    assert.equal(lidaCopia.copiaImportacao, true);
    assert.equal(lidaCopia.copiaEditada, false);
    assert.equal(lerArquivo(ORIGINAL).copiaImportacao, false);
  });
});
