// Catálogo dos campos de item da NF-e (src/nfe/catalogo.ts) e as colunas
// fiscais da Conferência: cobertura dos grupos do leiaute, leitura dos
// campos do det, campo fora do catálogo, coluna que some na nota sem o
// campo, perfil e ordenação. Notas inventadas (test/janela/notasFiscais.cjs).
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  CATALOGO,
  GRUPOS,
  camposForaDoCatalogo,
  caminhoNoCatalogo,
  combinaBusca,
  formatarValor,
  lerCamposItem,
  textoDeBusca,
} from '../src/nfe/catalogo.ts';
import {
  colunaPorId,
  colunasDaConfig,
  colunasDaNota,
  classeColuna,
} from '../src/nfe/colunas.ts';
import { configPadrao, validarConfig } from '../src/nfe/config.ts';
import { ordenarItens } from '../src/nfe/ordem.ts';
import { lerArquivo } from '../src/nfe/parser.ts';
import type { Item } from '../src/nfe/tipos.ts';
import { ligarDomMinimo } from './apoioDom.mts';
import notas from './janela/notasFiscais.cjs';

const xml = (id: string) => `xml:${id}`;

describe('catálogo dos campos de item', () => {
  it('ids e caminhos únicos; todo campo com nome, rótulo, tag, grupo e tipo', () => {
    const ids = CATALOGO.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'id repetido');
    const caminhos = CATALOGO.filter((c) => c.caminhos.length === 1).map(
      (c) => c.caminhos[0],
    );
    assert.equal(new Set(caminhos).size, caminhos.length, 'caminho repetido');
    for (const c of CATALOGO) {
      assert.ok(c.nome && c.rotulo && c.tecnico && c.local, c.id);
      assert.ok(GRUPOS.includes(c.grupo), `${c.id}: grupo ${c.grupo}`);
      assert.ok(
        ['texto', 'numero', 'dinheiro', 'porcentagem', 'data'].includes(c.tipo),
        c.id,
      );
    }
  });

  it('cada grupo do leiaute do item tem campos no catálogo', () => {
    const grupos = [
      'prod',
      'prod/gCred',
      'prod/DI',
      'prod/DI/adi',
      'prod/detExport',
      'prod/detExport/exportInd',
      'prod/rastro',
      'prod/infProdNFF',
      'prod/infProdEmb',
      'prod/veicProd',
      'prod/med',
      'prod/arma',
      'prod/comb',
      'prod/comb/CIDE',
      'prod/comb/encerrante',
      'prod/comb/origComb',
      'imposto',
      'imposto/ICMS',
      'imposto/ICMSUFDest',
      'imposto/IPI',
      'imposto/II',
      'imposto/ISSQN',
      'imposto/PIS',
      'imposto/PISST',
      'imposto/COFINS',
      'imposto/COFINSST',
      'imposto/IS',
      'imposto/IBSCBS',
      'imposto/IBSCBS/gIBSCBS',
      'imposto/IBSCBS/gIBSCBS/gIBSUF',
      'imposto/IBSCBS/gIBSCBS/gIBSUF/gDif',
      'imposto/IBSCBS/gIBSCBS/gIBSUF/gDevTrib',
      'imposto/IBSCBS/gIBSCBS/gIBSUF/gRed',
      'imposto/IBSCBS/gIBSCBS/gIBSMun',
      'imposto/IBSCBS/gIBSCBS/gCBS',
      'imposto/IBSCBS/gIBSCBS/gCBS/gALCZFMCBS',
      'imposto/IBSCBS/gIBSCBS/gTribRegular',
      'imposto/IBSCBS/gIBSCBS/gTribCompraGov',
      'imposto/IBSCBS/gIBSCBSMono',
      'imposto/IBSCBS/gIBSCBSMono/gIBSMonoAdRem/gMonoPadrao',
      'imposto/IBSCBS/gIBSCBSMono/gIBSMonoAdValorem/gMonoReten',
      'imposto/IBSCBS/gIBSCBSMono/gCBSMonoAdRem/gMonoRet',
      'imposto/IBSCBS/gIBSCBSMono/gCBSMonoAdValorem/gpBioDiferenca',
      'imposto/IBSCBS/gTransfCred',
      'imposto/IBSCBS/gAjusteCompet',
      'imposto/IBSCBS/gEstornoCred',
      'imposto/IBSCBS/gCredPresOper',
      'imposto/IBSCBS/gCredPresOper/gIBSCredPres',
      'imposto/IBSCBS/gCredPresOper/gCBSCredPres',
      'imposto/IBSCBS/gCredPresIBSZFM',
      'impostoDevol',
      'impostoDevol/IPI',
      'DFeReferenciado',
      'obsItem/obsCont',
      'obsItem/obsFisco',
    ];
    for (const g of grupos) {
      const dele = CATALOGO.filter((c) =>
        c.caminhos.some((k) => k.slice(0, k.lastIndexOf('/')) === g),
      );
      assert.ok(dele.length > 0, `sem campos de ${g}`);
    }
    for (const k of ['infAdProd', 'vItem', 'obsItem/obsCont/@xCampo'])
      assert.ok(caminhoNoCatalogo(k), k);
  });

  it('cada grupo do editor (menos cadastro, anotações e outros) tem campos', () => {
    // O grupo Cadastro tem só a coluna Código da casa, que não é do XML.
    for (const g of GRUPOS.filter(
      (x) => x !== 'anotacoes' && x !== 'outros' && x !== 'cadastro',
    ))
      assert.ok(
        CATALOGO.some((c) => c.grupo === g),
        `grupo ${g} vazio`,
      );
  });

  it('colunas comuns com nome curto', () => {
    const rotulo = (id: string) => colunaPorId(id)?.rotulo;
    assert.equal(rotulo(xml('imposto/ICMS/pICMS')), 'Alíq. ICMS');
    assert.equal(rotulo(xml('imposto/IPI/pIPI')), 'Alíq. IPI');
    assert.equal(rotulo(xml('imposto/ICMS/CST+CSOSN')), 'CST/CSOSN');
    assert.equal(rotulo(xml('imposto/ICMS/pMVAST')), '% MVA');
    assert.equal(rotulo(xml('imposto/ICMS/vBCST')), 'BC ST');
    assert.equal(rotulo(xml('prod/vOutro')), 'Outras desp.');
    assert.equal(rotulo(xml('infAdProd')), 'Inf. adicional');
    // As colunas de antes continuam com o id antigo e o mesmo título.
    assert.equal(rotulo('icms'), 'ICMS');
    assert.equal(colunaPorId('icms')?.caminhos?.[0], 'imposto/ICMS/vICMS');
  });

  it('formatação por tipo, sem calcular nada', () => {
    assert.equal(formatarValor('12.0000', 'porcentagem'), '12,00%');
    assert.equal(formatarValor('4.00', 'porcentagem'), '4,00%');
    assert.equal(formatarValor('33.3333', 'porcentagem'), '33,3333%');
    assert.equal(formatarValor('1234.5', 'dinheiro'), '1.234,50');
    assert.equal(formatarValor('0.5000', 'numero'), '0,5');
    assert.equal(formatarValor('2028-01-15', 'data'), '15/01/2028');
    assert.equal(formatarValor('abc', 'porcentagem'), 'abc');
    assert.equal(
      formatarValor('0', 'texto', { '0': 'Nacional' }),
      '0 - Nacional',
    );
    assert.equal(formatarValor('0012', 'auto'), '0012');
    assert.equal(formatarValor('3.5', 'auto'), '3,5');
  });

  it('busca pelo nome, pela tag e por siglas comuns', () => {
    const acha = (id: string, termo: string) => {
      const c = CATALOGO.find((x) => x.id === id);
      assert.ok(c, id);
      return combinaBusca(textoDeBusca(c), c.tecnico, termo);
    };
    const pICMS = xml('imposto/ICMS/pICMS');
    assert.ok(acha(pICMS, 'aliq'));
    assert.ok(acha(pICMS, 'alíquota'));
    assert.ok(acha(pICMS, 'Aliquota icms'));
    assert.ok(acha(pICMS, 'picms'));
    assert.ok(acha(xml('imposto/ICMS/pMVAST'), 'mva'));
    assert.ok(acha(xml('imposto/ICMS/vICMSST'), 'st'));
    assert.ok(acha(xml('imposto/ICMS/vBC'), 'bc'));
    assert.ok(acha(xml('imposto/ICMS/CST'), 'cst'));
    assert.ok(acha(xml('imposto/ICMS/pFCP'), 'fcp'));
    assert.ok(!acha(xml('prod/vFrete'), 'aliq'));
  });
});

describe('campos lidos do det', () => {
  before(ligarDomMinimo);

  const lida = () => lerArquivo(notas.notaVariada()).nota;
  const campo = (i: Item, k: string) => i.campos?.[k];

  it('ICMS de cada CST e do Simples sem o nível da variante', () => {
    const itens = lida().itens;
    assert.deepEqual(campo(itens[0], 'imposto/ICMS/pICMS'), ['12.00']);
    assert.deepEqual(campo(itens[1], 'imposto/ICMS/pICMS'), ['4.00']);
    assert.deepEqual(campo(itens[1], 'imposto/ICMS/pFCP'), ['2.00']);
    assert.deepEqual(campo(itens[2], 'imposto/ICMS/pMVAST'), ['40.00']);
    assert.deepEqual(campo(itens[2], 'imposto/ICMS/vICMSST'), ['13.20']);
    assert.deepEqual(campo(itens[3], 'imposto/ICMS/pRedBC'), ['33.33']);
    assert.deepEqual(campo(itens[4], 'imposto/ICMS/vICMSSTRet'), ['9.60']);
    assert.deepEqual(campo(itens[5], 'imposto/ICMS/CST'), ['90']);
    assert.deepEqual(campo(itens[6], 'imposto/ICMS/CSOSN'), ['101']);
    assert.deepEqual(campo(itens[6], 'imposto/ICMS/pCredSN'), ['2.56']);
    assert.deepEqual(campo(itens[7], 'imposto/ICMS/CSOSN'), ['102']);
    for (const i of itens)
      for (const k of Object.keys(i.campos ?? {}))
        assert.ok(
          !k
            .split('/')
            .some((g) =>
              /^(ICMS\d+|ICMSSN\d+|IPITrib|IPINT|PISAliq|COFINSAliq)$/.test(g),
            ),
          k,
        );
  });

  it('IPI tributado, não tributado e item sem IPI', () => {
    const itens = lida().itens;
    assert.deepEqual(campo(itens[0], 'imposto/IPI/pIPI'), ['5.00']);
    assert.deepEqual(campo(itens[0], 'imposto/IPI/CST'), ['50']);
    assert.deepEqual(campo(itens[1], 'imposto/IPI/CST'), ['53']);
    assert.equal(campo(itens[1], 'imposto/IPI/pIPI'), undefined);
    assert.equal(campo(itens[3], 'imposto/IPI/CST'), undefined);
  });

  it('ICMSUFDest, rastro repetido, IBS e CBS, PIS e COFINS', () => {
    const itens = lida().itens;
    assert.deepEqual(campo(itens[5], 'imposto/ICMSUFDest/pICMSInter'), [
      '12.00',
    ]);
    assert.deepEqual(campo(itens[7], 'prod/rastro/nLote'), [
      'L-0001',
      'L-0002',
    ]);
    assert.deepEqual(campo(itens[8], 'imposto/IBSCBS/gIBSCBS/gCBS/pCBS'), [
      '0.90',
    ]);
    assert.deepEqual(campo(itens[8], 'imposto/IBSCBS/gIBSCBS/vIBS'), ['0.10']);
    assert.deepEqual(campo(itens[0], 'imposto/PIS/pPIS'), ['1.65']);
    assert.deepEqual(campo(itens[0], 'imposto/COFINS/vCOFINS'), ['7.60']);
    // Todo campo da nota variada está no catálogo, menos o inventado.
    const fora = camposForaDoCatalogo(itens).map((f) => f.caminho);
    assert.deepEqual(fora, ['prod/nomeDoCachorro']);
  });

  it('campo inventado fora do catálogo vai para Outros campos do XML', () => {
    const itens = lida().itens;
    const [fora] = camposForaDoCatalogo(itens);
    assert.equal(fora.id, 'xml:prod/nomeDoCachorro');
    assert.equal(fora.rotulo, 'nomeDoCachorro (prod)');
    const col = colunaPorId(fora.id);
    assert.ok(col);
    assert.equal(col.grupo, 'outros');
    assert.equal(col.foraDoCatalogo, true);
    assert.equal(col.valor(itens[8]), 'Rex');
    assert.equal(col.valor(itens[0]), '');
    assert.match(classeColuna(col), /^col-xml col-xml-prod-nomeDoCachorro$/);
  });

  it('atributo do obsItem e lerCamposItem sem o nItem do det', () => {
    const det = {
      localName: 'det',
      textContent: '',
      getAttribute: (n: string) => (n === 'nItem' ? '1' : null),
      getAttributeNames: () => ['nItem'],
      children: [
        {
          localName: 'obsItem',
          textContent: '',
          getAttribute: () => null,
          getAttributeNames: () => [],
          children: [
            {
              localName: 'obsCont',
              textContent: '',
              getAttribute: (n: string) => (n === 'xCampo' ? 'Lote' : null),
              getAttributeNames: () => ['xCampo'],
              children: [
                {
                  localName: 'xTexto',
                  textContent: ' L-99 ',
                  getAttribute: () => null,
                  getAttributeNames: () => [],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    assert.deepEqual(lerCamposItem(det), {
      'obsItem/obsCont/@xCampo': ['Lote'],
      'obsItem/obsCont/xTexto': ['L-99'],
    });
  });
});

describe('colunas fiscais na Conferência', () => {
  before(ligarDomMinimo);

  it('padrão: as colunas de antes mais as alíquotas ao lado dos valores', () => {
    const ids = configPadrao().colunas.map((c) => c.id);
    const i = ids.indexOf('ipi');
    const j = ids.indexOf('icms');
    assert.equal(ids[i + 1], xml('imposto/IPI/pIPI'));
    assert.equal(ids[j + 1], xml('imposto/ICMS/pICMS'));
    assert.deepEqual(validarConfig(configPadrao()), configPadrao());
  });

  it('perfil gravado antes não ganha as alíquotas sozinho', () => {
    const antigo = configPadrao();
    antigo.colunas = antigo.colunas.filter((c) => !c.id.startsWith('xml:'));
    const lido = validarConfig(JSON.parse(JSON.stringify(antigo)));
    assert.ok(!lido.colunas.some((c) => c.id.startsWith('xml:')));
  });

  it('perfil aceita campo do catálogo e descarta o que está fora dele', () => {
    const c = configPadrao();
    c.colunas.push({ id: xml('imposto/ICMS/pMVAST'), visivel: true });
    c.colunas.push({ id: 'xml:prod/nomeDoCachorro', visivel: true });
    const lido = validarConfig(c);
    assert.ok(lido.colunas.some((x) => x.id === xml('imposto/ICMS/pMVAST')));
    assert.ok(!lido.colunas.some((x) => x.id === 'xml:prod/nomeDoCachorro'));
    assert.throws(() =>
      validarConfig({ ...c, colunas: [{ id: 'inventada', visivel: true }] }),
    );
  });

  it('Alíq. ICMS 12,00% e 4,00% na mesma nota; Alíq. IPI vazia sem IPI', () => {
    const { nota } = lerArquivo(notas.notaVariada());
    const cols = colunasDaNota(configPadrao(), nota.itens);
    const aliq = cols.find((c) => c.id === xml('imposto/ICMS/pICMS'));
    const ipi = cols.find((c) => c.id === xml('imposto/IPI/pIPI'));
    assert.ok(aliq?.visivel && ipi?.visivel);
    assert.equal(aliq.valor(nota.itens[0]), '12,00%');
    assert.equal(aliq.valor(nota.itens[1]), '4,00%');
    assert.equal(ipi.valor(nota.itens[0]), '5,00%');
    assert.equal(ipi.valor(nota.itens[3]), '');
  });

  it('coluna ligada some na nota sem o campo e volta na que tem', () => {
    const config = configPadrao();
    config.colunas.push({ id: xml('imposto/ICMS/pMVAST'), visivel: true });
    const visiveis = (x: string) =>
      colunasDaNota(config, lerArquivo(x).nota.itens)
        .filter((c) => c.visivel)
        .map((c) => c.id);
    const com = visiveis(notas.notaVariada());
    const sem = visiveis(notas.notaSemAliquota());
    assert.ok(com.includes(xml('imposto/ICMS/pMVAST')));
    assert.ok(!sem.includes(xml('imposto/ICMS/pMVAST')));
    assert.ok(!sem.includes(xml('imposto/ICMS/pICMS')));
    assert.ok(!sem.includes('ipi'));
    // Nº, Código e Descrição continuam; a configuração não muda.
    assert.ok(sem.includes('nItem') && sem.includes('descricao'));
    assert.ok(
      colunasDaConfig(config).find((c) => c.id === xml('imposto/ICMS/pMVAST'))
        ?.visivel,
    );
    assert.ok(
      visiveis(notas.nota25Itens()).includes(xml('imposto/ICMS/pMVAST')),
    );
  });

  it('ordena por coluna nova (número) e por campo fora do catálogo', () => {
    const { nota } = lerArquivo(notas.notaVariada());
    const config = configPadrao();
    config.colunas.push({ id: 'xml:prod/nomeDoCachorro', visivel: true });
    config.colunas.push({ id: xml('prod/rastro/dVal'), visivel: true });
    const cols = colunasDaConfig(config);
    const ordem = (criterio: string, direcao: 'asc' | 'desc') =>
      ordenarItens(nota.itens, { criterio, direcao }, new Map(), cols).map(
        (i) => i.nItem,
      );
    // pICMS: 4 < 12 (como número, não como texto); sem alíquota vai pro fim.
    const asc = ordem(xml('imposto/ICMS/pICMS'), 'asc');
    assert.equal(asc[0], '2');
    assert.equal(asc[asc.length - 1], '8');
    const desc = ordem(xml('imposto/ICMS/pICMS'), 'desc');
    assert.deepEqual(desc.slice(0, 3), ['1', '3', '4']);
    assert.equal(ordem('xml:prod/nomeDoCachorro', 'asc')[0], '9');
    assert.equal(ordem(xml('prod/rastro/dVal'), 'asc')[0], '8');
  });
});
