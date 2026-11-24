// Coluna "Código da casa": a situação de cada item (motor com confiança
// alta, média e baixa, ambíguo, sem sugestão), a decisão lembrada na frente
// do motor na nota seguinte, o "nenhum" lembrado, o fator editado, as
// escolhas gravadas no .psxml (e o .psxml antigo, sem elas), a coluna
// apagada sem cadastro, o contador do painel, a busca no cadastro e a lista
// das Configurações. Cadastro e notas inventados (test/fixtures/cadastro).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import {
  prepararCadastro,
  sugerirNota,
  type SugestaoItem,
} from '../../src/cadastro/casamento.ts';
import {
  atributosEscolha,
  buscarProdutos,
  chaveCodigoCasa,
  escolhaDeAtributos,
  estadoCodigoCasa,
  ID_CODIGO_CASA,
  lerDecisoesCodigoCasa,
  lerFator,
  proximoPendente,
  resumoCodigoCasa,
  TEXTO_NENHUM,
  textoCodigoCasa,
  textoConversao,
  type DecisaoCodigoCasa,
  type EscolhaCodigoCasa,
} from '../../src/cadastro/codigoCasa.ts';
import { validarTextoCadastro } from '../../src/cadastro/formato.ts';
import {
  contagemItens,
  filtrarItensDecisao,
  juntarDecisoes,
  textoItemDecisao,
} from '../../src/filtroDecisoes.ts';
import {
  colunaExiste,
  colunaPorId,
  colunasDaNota,
} from '../../src/nfe/colunas.ts';
import { configPadrao } from '../../src/nfe/config.ts';
import { lerArquivo, NS_PS } from '../../src/nfe/parser.ts';
import type { Nota } from '../../src/nfe/tipos.ts';
import { ligarDomMinimo } from '../apoioDom.mts';

const pasta = new URL('../fixtures/cadastro/', import.meta.url);
const ler = (nome: string) => readFileSync(new URL(nome, pasta), 'utf8');

const lido = validarTextoCadastro(ler('cadastro.json'));
if (!lido.ok) throw new Error('cadastro inventado inválido');
const indice = prepararCadastro(lido.cadastro);

let notas: Record<string, Nota>;
before(() => {
  ligarDomMinimo();
  notas = Object.fromEntries(
    ['nfe-1-alfa-matriz', 'nfe-2-alfa-filial', 'nfe-3-beta'].map((n) => [
      n,
      lerArquivo(ler(`${n}.xml`)).nota,
    ]),
  );
});

function sugestoes(nota: Nota): Map<string, SugestaoItem> {
  const r = sugerirNota(indice, {
    cnpjEmitente: nota.emitente.CNPJ,
    chave: nota.chave,
    itens: nota.itens.map((i) => ({
      nItem: Number(i.nItem),
      cProd: i.cProd,
      cEAN: i.cEAN,
      xProd: i.xProd,
      NCM: i.NCM,
      uCom: i.uCom,
    })),
  });
  return new Map(r.itens.map((s) => [String(s.nItem), s]));
}

/** Estado de cada item da nota, com as escolhas gravadas e as lembradas. */
function estados(
  nota: Nota,
  gravadas: Map<string, EscolhaCodigoCasa> = new Map(),
  lembradas: DecisaoCodigoCasa[] = [],
) {
  const s = sugestoes(nota);
  const l = new Map(
    lembradas.map((d) => [chaveCodigoCasa(d.raizCnpj, d.cProd), d]),
  );
  return nota.itens.map((i) => ({
    nItem: i.nItem,
    estado: estadoCodigoCasa(
      gravadas.get(i.nItem),
      l.get(chaveCodigoCasa(nota.emitente.CNPJ, i.cProd)),
      s.get(i.nItem),
      i.uCom,
    ),
  }));
}

function decisao(p: Partial<DecisaoCodigoCasa>): DecisaoCodigoCasa {
  return {
    raizCnpj: '11111111',
    fornecedor: 'Distribuidora Alfa (inventada)',
    cProd: 'ZZ-99',
    xProd: 'ITEM SEM CADASTRO',
    codigo: '102',
    descricao: 'BUCHA',
    unidade: 'UN',
    fator: 12,
    unidadeCompra: 'PCT',
    atualizadaEm: '2026-11-24T10:00:00.000Z',
    ...p,
  };
}

describe('código da casa: situação de cada item pelo motor', () => {
  it('alta é definido, com a conversão do fator', () => {
    const [um] = estados(notas['nfe-1-alfa-matriz']);
    assert.equal(um.estado.situacao, 'definido');
    assert.equal(um.estado.precisaDeVoce, false);
    assert.equal(um.estado.escolha?.codigo, '100');
    assert.equal(um.estado.escolha?.origem, 'motor');
    assert.equal(um.estado.escolha?.confianca, 'alta');
    assert.equal(textoConversao(um.estado.escolha!), '100 UN por CX');
  });

  it('média e baixa trazem o produto, mas precisam de você', () => {
    const media = estados(notas['nfe-1-alfa-matriz'])[2].estado;
    assert.equal(media.situacao, 'confirmar');
    assert.equal(media.escolha?.confianca, 'media');
    assert.ok(media.precisaDeVoce);
    const baixa = estados(notas['nfe-2-alfa-filial'])[3].estado;
    assert.equal(baixa.escolha?.confianca, 'baixa');
    assert.ok(baixa.precisaDeVoce);
  });

  it('ambíguo e sem sugestão ficam sem produto', () => {
    const ambiguo = estados(notas['nfe-3-beta'])[1].estado;
    assert.equal(ambiguo.situacao, 'ambiguo');
    assert.equal(ambiguo.escolha, null);
    assert.equal(textoCodigoCasa(ambiguo), '');
    const sem = estados(notas['nfe-1-alfa-matriz'])[4].estado;
    assert.equal(sem.situacao, 'sem-sugestao');
    assert.ok(sem.precisaDeVoce);
  });

  it('fator 1 não mostra conversão', () => {
    const [um] = estados(notas['nfe-2-alfa-filial']);
    assert.equal(um.estado.escolha?.fator, 1);
    assert.equal(textoConversao(um.estado.escolha!), '');
    assert.equal(textoCodigoCasa(um.estado).split(' · ')[0], '100');
  });
});

describe('código da casa: decisões lembradas', () => {
  it('a escolha lembrada vale na nota seguinte, na frente do motor', () => {
    // Na primeira nota a pessoa escolheu 102 para o ZZ-99 (sem sugestão) e
    // trocou o 100 sugerido com confiança alta do PSX-14 pelo 105.
    const lembradas = [
      decisao({}),
      decisao({
        cProd: 'PSX-14',
        codigo: '105',
        fator: 1,
        unidadeCompra: 'CX',
      }),
    ];
    const e = estados(notas['nfe-1-alfa-matriz'], new Map(), lembradas);
    assert.equal(e[4].estado.escolha?.codigo, '102');
    assert.equal(e[4].estado.escolha?.origem, 'lembrada');
    assert.equal(e[4].estado.situacao, 'definido');
    assert.equal(e[0].estado.escolha?.codigo, '105');
    assert.equal(e[0].estado.escolha?.origem, 'lembrada');
  });

  it('a raiz do CNPJ vale para as filiais', () => {
    const filial = notas['nfe-2-alfa-filial'];
    const e = estados(filial, new Map(), [
      decisao({ cProd: '0PSX-16', codigo: '101', fator: 48 }),
    ]);
    assert.equal(e[3].estado.escolha?.fator, 48);
    assert.equal(e[3].estado.precisaDeVoce, false);
  });

  it('"nenhum" lembrado conta como definido', () => {
    const e = estados(notas['nfe-1-alfa-matriz'], new Map(), [
      decisao({ codigo: null, descricao: '', unidade: '', fator: null }),
    ]);
    assert.equal(e[4].estado.escolha?.codigo, null);
    assert.equal(e[4].estado.situacao, 'definido');
    assert.equal(textoCodigoCasa(e[4].estado), TEXTO_NENHUM);
  });

  it('a escolha gravada no .psxml passa na frente da lembrada', () => {
    const gravada: EscolhaCodigoCasa = {
      codigo: '103',
      descricao: 'ARRUELA',
      unidade: 'UN',
      fator: 10,
      unidadeCompra: 'PCT',
      origem: 'pessoa',
      confianca: null,
    };
    const e = estados(notas['nfe-1-alfa-matriz'], new Map([['5', gravada]]), [
      decisao({}),
    ]);
    assert.equal(e[4].estado.escolha?.codigo, '103');
    assert.equal(textoConversao(e[4].estado.escolha!), '10 UN por PCT');
  });

  it('o arquivo de decisões: só as válidas e com a chave certa', () => {
    const boa = decisao({});
    const r = lerDecisoesCodigoCasa({
      versao: 1,
      decisoes: {},
      codigosCasa: {
        '11111111|ZZ-99': { ...boa, extra: 'fica de fora' },
        '11111111|OUTRO': boa,
        '11111111|X': { ...boa, cProd: 'X', fator: 0 },
        '11111111|N': { ...boa, cProd: 'N', codigo: null, fator: null },
      },
    });
    assert.deepEqual(Object.keys(r).sort(), ['11111111|N', '11111111|ZZ-99']);
    assert.equal('extra' in r['11111111|ZZ-99'], false);
    assert.deepEqual(lerDecisoesCodigoCasa({ decisoes: {} }), {});
  });

  it('o fator digitado', () => {
    assert.equal(lerFator('12'), 12);
    assert.equal(lerFator('0,5'), 0.5);
    assert.equal(lerFator('1.000'), 1000);
    assert.equal(lerFator('2,25'), 2.25);
    assert.equal(lerFator('0'), null);
    assert.equal(lerFator('-3'), null);
    assert.equal(lerFator('doze'), null);
  });
});

describe('código da casa: no .psxml', () => {
  const escolhas: [string, EscolhaCodigoCasa][] = [
    [
      '1',
      {
        codigo: '100',
        descricao: 'PARAFUSO "SEXTAVADO" & CIA',
        unidade: 'UN',
        fator: 100,
        unidadeCompra: 'CX',
        origem: 'motor',
        confianca: 'alta',
      },
    ],
    [
      '3',
      {
        codigo: '102',
        descricao: 'BUCHA',
        unidade: 'UN',
        fator: 10,
        unidadeCompra: 'UN',
        origem: 'pessoa',
        confianca: null,
      },
    ],
    [
      '5',
      {
        codigo: null,
        descricao: '',
        unidade: '',
        fator: null,
        unidadeCompra: 'PCT',
        origem: 'lembrada',
        confianca: null,
      },
    ],
  ];

  const xmlAtributo = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function psxml(casa: string): string {
    const nfe = ler('nfe-1-alfa-matriz.xml').replace(/^<\?xml[^>]*>\s*/, '');
    return `<?xml version="1.0" encoding="UTF-8"?>
<psCopiaEditada xmlns="${NS_PS}" versao="2">
  <aviso>Cópia de uso interno.</aviso>
  <original>${nfe}</original>
  <anotacoes titulo="Anotação"><anotacao nItem="2">conferido</anotacao></anotacoes>
  <ordem criterio="nota" direcao="asc"/>${casa}
</psCopiaEditada>`;
  }

  it('grava e lê o produto, a origem (com a confiança) e o fator de cada item', () => {
    const itens = escolhas
      .map(
        ([n, e]) =>
          `<item nItem="${n}" ${atributosEscolha(e)
            .map(([k, v]) => `${k}="${xmlAtributo(v)}"`)
            .join(' ')}/>`,
      )
      .join('');
    const r = lerArquivo(psxml(`<codigosCasa>${itens}</codigosCasa>`));
    assert.deepEqual([...r.codigosCasa], escolhas);
    assert.equal(r.anotacoes.get('anotacao')?.get('2'), 'conferido');
  });

  it('.psxml antigo (sem codigosCasa) abre com o mapa vazio', () => {
    const r = lerArquivo(psxml(''));
    assert.equal(r.codigosCasa.size, 0);
    assert.equal(r.nota.itens.length, 5);
  });

  it('item malformado fica de fora sem derrubar a leitura', () => {
    const r = lerArquivo(
      psxml(
        '<codigosCasa><item nItem="1" codigo="100" origem="motor"/><item nItem="2" origem="pessoa"/><item nItem="3" codigo="9" origem="estranha"/><item nItem="4" codigo="9" origem="pessoa" fator="-1"/><item nItem="5" codigo="9" origem="pessoa" fator="2"/></codigosCasa>',
      ),
    );
    assert.deepEqual([...r.codigosCasa.keys()], ['5']);
  });

  it('escolhaDeAtributos devolve o mesmo que atributosEscolha gravou', () => {
    for (const [, e] of escolhas) {
      const m = new Map(atributosEscolha(e));
      assert.deepEqual(
        escolhaDeAtributos((k) => m.get(k) ?? null),
        e,
      );
    }
  });
});

describe('código da casa: coluna e painel', () => {
  it('sem cadastro a coluna fica apagada; com cadastro aparece', () => {
    const c = colunaPorId(ID_CODIGO_CASA)!;
    assert.equal(c.grupo, 'cadastro');
    assert.equal(colunaExiste(c, null, false), false);
    assert.equal(colunaExiste(c, null, true), true);
    const config = configPadrao();
    config.colunas = config.colunas.map((x) =>
      x.id === ID_CODIGO_CASA ? { ...x, visivel: true } : x,
    );
    const itens = notas['nfe-1-alfa-matriz'].itens;
    const ver = (comCadastro: boolean) =>
      colunasDaNota(config, itens, comCadastro).find(
        (x) => x.id === ID_CODIGO_CASA,
      )?.visivel;
    assert.equal(ver(false), false);
    assert.equal(ver(true), true);
  });

  it('o perfil padrão já tem a coluna, desligada', () => {
    const c = configPadrao().colunas.find((x) => x.id === ID_CODIGO_CASA);
    assert.deepEqual(c, { id: ID_CODIGO_CASA, visivel: false });
  });

  it('contador: N de M definidos e os pendentes na ordem, dando a volta', () => {
    const r = resumoCodigoCasa(estados(notas['nfe-1-alfa-matriz']));
    assert.deepEqual(r, { definidos: 2, total: 5, pendentes: ['3', '4', '5'] });
    assert.equal(proximoPendente(r.pendentes, null), '3');
    assert.equal(proximoPendente(r.pendentes, '3'), '4');
    assert.equal(proximoPendente(r.pendentes, '5'), '3');
    assert.equal(proximoPendente([], null), null);
    const beta = resumoCodigoCasa(estados(notas['nfe-3-beta']));
    assert.equal(beta.definidos, 1);
    assert.equal(beta.pendentes.length, 4);
  });

  it('escolha da pessoa e "nenhum" contam como definidos', () => {
    const nota = notas['nfe-1-alfa-matriz'];
    const pessoa: EscolhaCodigoCasa = {
      codigo: '102',
      descricao: 'BUCHA',
      unidade: 'UN',
      fator: null,
      unidadeCompra: 'UN',
      origem: 'pessoa',
      confianca: null,
    };
    const r = resumoCodigoCasa(
      estados(
        nota,
        new Map([
          ['3', pessoa],
          ['4', { ...pessoa, codigo: null }],
        ]),
      ),
    );
    assert.deepEqual(r.pendentes, ['5']);
  });
});

describe('código da casa: busca no cadastro', () => {
  const produtos = lido.ok ? lido.cadastro.produtos : [];

  it('pelo código igual primeiro, depois o que começa com ele', () => {
    const r = buscarProdutos(produtos, '10');
    assert.ok(r.length > 1);
    // Os códigos que começam com "10" vêm antes das descrições com "10".
    const prefixo = r.map((p) => p.codigo.startsWith('10'));
    assert.ok(prefixo[0]);
    assert.ok(
      prefixo.indexOf(false) === -1 ||
        !prefixo.slice(prefixo.indexOf(false)).includes(true),
    );
    assert.equal(buscarProdutos(produtos, '100')[0].codigo, '100');
  });

  it('pelo código de barras, com ou sem zeros à esquerda', () => {
    const comBarras = produtos.find((p) => p.codigoBarras)!;
    const r = buscarProdutos(produtos, `0${comBarras.codigoBarras}`);
    assert.equal(r[0].codigo, comBarras.codigo);
  });

  it('pela descrição, sem acento e com as palavras em qualquer ordem', () => {
    const p = produtos.find((x) => x.descricao.split(' ').length >= 2)!;
    const [a, b] = p.descricao.toLowerCase().split(' ');
    const r = buscarProdutos(produtos, `${b} ${a}`);
    assert.ok(r.some((x) => x.codigo === p.codigo));
    assert.deepEqual(buscarProdutos(produtos, '   '), []);
    assert.equal(buscarProdutos(produtos, 'nada assim existe xyz').length, 0);
  });
});

describe('código da casa: Configurações, decisões lembradas', () => {
  it('entram na lista com tipo próprio, no filtro e na busca', () => {
    const casa = [
      decisao({}),
      decisao({ cProd: 'N', codigo: null, descricao: '' }),
    ];
    const itens = juntarDecisoes([], casa);
    assert.equal(itens.length, 2);
    assert.ok(itens.every((i) => i.chave.startsWith('casa:')));
    assert.equal(contagemItens(itens)['codigo-casa'], 2);
    assert.equal(
      filtrarItensDecisao(itens, { busca: '', tipo: 'codigo-casa' }).length,
      2,
    );
    assert.equal(
      filtrarItensDecisao(itens, { busca: '', tipo: 'sem-st' }).length,
      0,
    );
    assert.equal(
      filtrarItensDecisao(itens, { busca: 'bucha', tipo: null }).length,
      1,
    );
    assert.equal(
      textoItemDecisao(itens.find((i) => i.d.cProd === 'ZZ-99')!),
      'Código da casa 102 · BUCHA · 12 UN por PCT',
    );
    assert.equal(
      textoItemDecisao(itens.find((i) => i.d.cProd === 'N')!),
      `Código da casa: ${TEXTO_NENHUM}`,
    );
  });
});
