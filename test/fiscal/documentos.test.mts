import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ErroFormato,
  resumoST,
  resumoTipi,
  situacaoDocumento,
  textoRodapeBase,
  type InfoDocumento,
} from '../../src/fiscal/documentos.ts';
import type { LinhaST, TabelaST } from '../../src/fiscal/st.ts';
import type { TabelaTipi } from '../../src/fiscal/tipi.ts';

const linha = {} as LinhaST;

function tabelaST(
  p: Partial<TabelaST['relatorio']>,
  linhas = [linha],
): TabelaST {
  return {
    linhas,
    relatorio: {
      versao: '0019',
      vigencia: '01/07/2023',
      abas: [
        {
          aba: 'Tintas',
          linhaCabecalho: 4,
          linhasProduto: 1,
          linhasNcm: 1,
          linhasSemNcm: 0,
          notas: [],
        },
      ],
      problemas: [],
      totalLinhas: linhas.length,
      ...p,
    },
  };
}

describe('documentos: resumo da planilha de ST', () => {
  it('conversão de MVA é observação, não ponto não entendido', () => {
    const r = resumoST(
      tabelaST({
        problemas: [
          {
            aba: 'Bebidas',
            celula: 'K7',
            valor: '69.7',
            motivo: 'MVA 69.7 lida como percentual (69.7% = 0.697)',
          },
          { aba: 'Autopecas', celula: 'D138', valor: '', motivo: 'NCM vazio' },
        ],
      }),
    );
    assert.equal(r.totalNaoEntendidos, 1);
    assert.equal(r.naoEntendidos[0].celula, 'D138');
    assert.match(r.observacoes[0], /^1 MVA escrita em percentual/);
  });

  it('nada lido: formato não reconhecido', () => {
    assert.throws(
      () => resumoST(tabelaST({ abas: [] }, [])),
      (e: unknown) => e instanceof ErroFormato && /ITEM e CEST/.test(e.message),
    );
  });
});

describe('documentos: resumo da TIPI', () => {
  const tipi = (p: Partial<TabelaTipi['relatorio']>): TabelaTipi => ({
    porNcm: new Map(),
    relatorio: {
      totalNcm: 10,
      totalLinhas: 100,
      semAliquota: [],
      ignoradas: [],
      ...p,
    },
  });

  it('notas e exceções são esperadas; texto solto e NCM sem alíquota não', () => {
    const r = resumoTipi(
      tipi({
        versao: '2022',
        atualizacao: 'Ato Declaratório Executivo RFB nº 1',
        semAliquota: ['9999.99.99'],
        ignoradas: [
          {
            motivo: 'título e notas de capítulo ou seção',
            total: 40,
            exemplos: [],
          },
          {
            motivo: 'texto solto fora de um código',
            total: 9,
            exemplos: [{ linha: 812, texto: 'xyz' }],
          },
        ],
      }),
      'txt',
    );
    assert.equal(r.versao, '2022');
    assert.equal(r.totalNaoEntendidos, 10);
    assert.deepEqual(r.naoEntendidos[1], {
      aba: '',
      celula: 'linha 812',
      valor: 'xyz',
      motivo: 'texto solto fora de um código (9 ao todo; exemplos)',
    });
    assert.deepEqual(r.observacoes, [
      '40 linhas ignoradas: título e notas de capítulo ou seção.',
    ]);
  });

  it('nenhum NCM: formato não reconhecido', () => {
    assert.throws(() => resumoTipi(tipi({ totalNcm: 0 }), 'txt'), ErroFormato);
  });
});

describe('documentos: situação e rodapé', () => {
  const doc = (n: number) => ({ totalNaoEntendidos: n }) as InfoDocumento;
  it('faltando, carregado e com pontos não entendidos', () => {
    assert.equal(situacaoDocumento(null), 'faltando');
    assert.equal(situacaoDocumento(doc(0)), 'carregado');
    assert.equal(situacaoDocumento(doc(3)), 'com-pontos');
  });
  it('rodapé do painel', () => {
    assert.equal(textoRodapeBase(doc(0), doc(2)), 'Base: ST ✓ · TIPI ✓');
    assert.equal(textoRodapeBase(null, doc(0)), 'Base: ST faltando · TIPI ✓');
  });
});
