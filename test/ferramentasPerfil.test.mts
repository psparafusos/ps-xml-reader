import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executarPlano } from '../src/fiscal/entrada.ts';
import {
  ferramentasDoPerfil,
  ferramentasPadrao,
  ferramentasVisiveis,
  ID_FERRAMENTA_CFOPS,
  ID_FERRAMENTA_ST,
  lerFerramentas,
  lerFerramentasPorPerfil,
  moverFerramenta,
  planoDoAplicar,
  semPerfisExcluidos,
  type FerramentasPerfil,
} from '../src/nfe/ferramentasPerfil.ts';
import type { LinhaPrevia } from '../src/previaST.ts';

/** Ida e volta pelo config.json (texto JSON), como o processo principal faz. */
const pelaConfig = (
  porPerfil: Record<string, FerramentasPerfil>,
  ids: string[],
) =>
  lerFerramentasPorPerfil(
    JSON.parse(JSON.stringify({ ferramentasPerfis: porPerfil }))
      .ferramentasPerfis,
    ids,
  );

describe('ferramentas por perfil: ordem e visibilidade', () => {
  it('padrão: as duas ferramentas, ST primeiro, os dois campos à mostra', () => {
    const f = ferramentasPadrao();
    assert.deepEqual(ferramentasVisiveis(f), [
      ID_FERRAMENTA_ST,
      ID_FERRAMENTA_CFOPS,
    ]);
    assert.deepEqual(f.camposST, { mva: true, aliquota: true });
  });

  it('ordem e visibilidade de cada perfil são salvas e lidas de volta', () => {
    const conferente = moverFerramenta(
      ferramentasPadrao(),
      ID_FERRAMENTA_CFOPS,
      -1,
    );
    const fiscal: FerramentasPerfil = {
      ...ferramentasPadrao(),
      ordem: ferramentasPadrao().ordem.map((x) =>
        x.id === ID_FERRAMENTA_CFOPS ? { ...x, visivel: false } : x,
      ),
      camposST: { mva: false, aliquota: true },
    };
    const lido = pelaConfig({ 'p-aaa111': conferente, 'p-bbb222': fiscal }, [
      'p-aaa111',
      'p-bbb222',
    ]);
    assert.deepEqual(ferramentasVisiveis(lido['p-aaa111']), [
      ID_FERRAMENTA_CFOPS,
      ID_FERRAMENTA_ST,
    ]);
    assert.deepEqual(ferramentasVisiveis(lido['p-bbb222']), [ID_FERRAMENTA_ST]);
    assert.deepEqual(lido['p-bbb222'].camposST, { mva: false, aliquota: true });
    assert.deepEqual(lido['p-aaa111'], conferente);
    assert.deepEqual(lido['p-bbb222'], fiscal);
  });

  it('perfil sem nada salvo usa o padrão; perfil excluído sai da leitura', () => {
    const lido = pelaConfig(
      { 'p-velho': ferramentasPadrao(), 'p-aaa111': ferramentasPadrao() },
      ['p-aaa111', 'p-novo'],
    );
    assert.deepEqual(Object.keys(lido), ['p-aaa111']);
    assert.deepEqual(ferramentasDoPerfil(lido, 'p-novo'), ferramentasPadrao());
  });

  it('id desconhecido ou repetido sai; ferramenta que faltou entra no fim', () => {
    const f = lerFerramentas({
      ordem: [
        { id: ID_FERRAMENTA_CFOPS, visivel: false },
        { id: 'ferramenta-que-nao-existe', visivel: true },
        { id: ID_FERRAMENTA_CFOPS, visivel: true },
      ],
      camposST: { mva: 'sim', aliquota: false },
    });
    assert.deepEqual(f.ordem, [
      { id: ID_FERRAMENTA_CFOPS, visivel: false },
      { id: ID_FERRAMENTA_ST, visivel: true },
    ]);
    assert.deepEqual(f.camposST, { mva: true, aliquota: false });
    assert.deepEqual(lerFerramentas('lixo'), ferramentasPadrao());
  });

  it('mover pelo teclado não passa das pontas e não muda o original', () => {
    const f = ferramentasPadrao();
    assert.deepEqual(moverFerramenta(f, ID_FERRAMENTA_ST, -1).ordem, f.ordem);
    const desceu = moverFerramenta(f, ID_FERRAMENTA_ST, 1);
    assert.deepEqual(ferramentasVisiveis(desceu), [
      ID_FERRAMENTA_CFOPS,
      ID_FERRAMENTA_ST,
    ]);
    assert.equal(f.ordem[0].id, ID_FERRAMENTA_ST);
  });
});

describe('ferramenta ST: campos ocultos não são gravados no Aplicar', () => {
  // Duas linhas inventadas da prévia: uma com ST (MVA e alíquota interna),
  // uma sem ST.
  const linhas = [
    {
      nItem: '1',
      cfop: '2403',
      st: 'sim',
      mva: 0.5203,
      aliquotaInterna: { texto: '25% + 1%' },
    },
    {
      nItem: '2',
      cfop: '2102',
      st: 'nao',
      mva: null,
      aliquotaInterna: null,
    },
  ] as unknown as LinhaPrevia[];
  const colunas = {
    cfop: 'anotacao-cfop-de-entrada',
    mva: 'anotacao-mva',
    aliquota: 'anotacao-aliquota-interna',
  };
  const colunasGravadas = (campos: { mva: boolean; aliquota: boolean }) => {
    const anotacoes = new Map<string, Map<string, string>>();
    const plano = planoDoAplicar(linhas, anotacoes, colunas, campos);
    executarPlano(plano, anotacoes, false);
    return {
      anotacoes,
      colunas: [...new Set(plano.gravacoes.map((g) => g.coluna))],
    };
  };

  it('com os dois campos à mostra, grava CFOP, MVA e alíquota', () => {
    const r = colunasGravadas({ mva: true, aliquota: true });
    assert.deepEqual(r.colunas, [colunas.cfop, colunas.mva, colunas.aliquota]);
    assert.equal(r.anotacoes.get(colunas.aliquota)?.get('1'), '25% + 1%');
  });

  it('MVA oculta: nem com a coluna escolhida ela é gravada', () => {
    const r = colunasGravadas({ mva: false, aliquota: true });
    assert.deepEqual(r.colunas, [colunas.cfop, colunas.aliquota]);
    assert.equal(r.anotacoes.has(colunas.mva), false);
    assert.equal(r.anotacoes.get(colunas.cfop)?.get('1'), '2403');
  });

  it('alíquota oculta: só CFOP e MVA', () => {
    const r = colunasGravadas({ mva: true, aliquota: false });
    assert.deepEqual(r.colunas, [colunas.cfop, colunas.mva]);
    assert.equal(r.anotacoes.has(colunas.aliquota), false);
  });

  it('os dois ocultos: só o CFOP', () => {
    const r = colunasGravadas({ mva: false, aliquota: false });
    assert.deepEqual(r.colunas, [colunas.cfop]);
    assert.deepEqual(
      [...(r.anotacoes.get(colunas.cfop) ?? new Map()).entries()],
      [
        ['1', '2403'],
        ['2', '2102'],
      ],
    );
  });
});

describe('ferramentas por perfil: perfil excluído', () => {
  it('a entrada do perfil excluído sai; as outras ficam como estavam', () => {
    const fiscal = { ...ferramentasPadrao(), aberturaNotas: 'protegida' };
    const r = semPerfisExcluidos(
      { 'p-aaa111': ferramentasPadrao(), 'p-bbb222': fiscal },
      ['p-bbb222'],
    );
    assert.deepEqual(r, { 'p-bbb222': fiscal });
    assert.deepEqual(semPerfisExcluidos('lixo', ['p-bbb222']), {});
  });
});
