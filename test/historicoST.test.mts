import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AnaliseItem } from '../src/fiscal/analise.ts';
import type { DecisaoLembrada, EscolhaST } from '../src/fiscal/entrada.ts';
import {
  observacaoMvaFornecedor,
  sugestaoHistorico,
} from '../src/historicoST.ts';

// Decisões e itens inventados. Só os campos que a contagem usa.
const NCM = '39249000';
const LINHA_12: EscolhaST = {
  tipo: 'candidato',
  segmento: 'MATERIAIS DE CONSTRUÇÃO',
  linhaPlanilha: 12,
  cest: '10.006.00',
};
const SEM_ST: EscolhaST = { tipo: 'sem-st' };

const analise = (ncm = NCM): AnaliseItem =>
  ({
    nItem: '1',
    ncm,
    candidatos: [
      {
        segmento: 'MATERIAIS DE CONSTRUÇÃO',
        linhaPlanilha: 12,
        cest: '10.006.00',
      },
    ],
    apendiceXIV: null,
  }) as unknown as AnaliseItem;

let seq = 0;
const decisao = (
  escolha: EscolhaST | null,
  xProd: string,
  ncm = NCM,
  raizCnpj = '11222333',
  cProd = `P${++seq}`,
): DecisaoLembrada => ({
  escolha,
  finalidade: 'revenda',
  raizCnpj,
  fornecedor: 'Fornecedor Inventado',
  cProd,
  xProd,
  ncm,
  atualizadaEm: '2026-11-01T10:00:00.000Z',
});

const CHAVE_ITEM = '99888777|ITEM-NOVO';

describe('sugestão pelo histórico', () => {
  it('2 de 2 na mesma escolha: sugere, com as descrições', () => {
    const h = [decisao(SEM_ST, 'Lixeira plástica'), decisao(SEM_ST, 'Balde')];
    const s = sugestaoHistorico(analise(), h, CHAVE_ITEM);
    assert.equal(s?.tipo, 'sugere');
    assert.ok(s?.tipo === 'sugere');
    assert.deepEqual(s.escolha, SEM_ST);
    assert.equal(s.vezes, 2);
    assert.equal(s.total, 2);
    assert.equal(
      s.texto,
      'Pelo histórico: Sem ST. Você escolheu isso em 2 de 2 itens com o NCM 3924.90.00 (Lixeira plástica; Balde).',
    );
  });

  it('3 de 4 (75%): não sugere, mostra o histórico dividido', () => {
    const h = [
      decisao(LINHA_12, 'Caixa d’água'),
      decisao(LINHA_12, 'Tampa de caixa'),
      decisao(LINHA_12, 'Ralo'),
      decisao(SEM_ST, 'Pote'),
    ];
    const s = sugestaoHistorico(analise(), h, CHAVE_ITEM);
    assert.equal(s?.tipo, 'dividido');
    assert.equal(
      s?.texto,
      'Histórico dividido: MATERIAIS DE CONSTRUÇÃO, CEST 10.006.00 (linha 12) 3x, Sem ST 1x',
    );
  });

  it('4 de 5 (80%) sugere; até 3 descrições', () => {
    const h = [
      decisao(LINHA_12, 'A'),
      decisao(LINHA_12, 'B'),
      decisao(LINHA_12, 'C'),
      decisao(LINHA_12, 'D'),
      decisao(SEM_ST, 'E'),
    ];
    const s = sugestaoHistorico(analise(), h, CHAVE_ITEM);
    assert.ok(s?.tipo === 'sugere');
    assert.deepEqual(s.descricoes, ['A', 'B', 'C']);
    assert.match(s.texto, /em 4 de 5 itens/);
  });

  it('NCM diferente não conta', () => {
    const h = [
      decisao(SEM_ST, 'Lixeira'),
      decisao(SEM_ST, 'Outro NCM', '39241000'),
      decisao(LINHA_12, 'Outro NCM 2', '39241000'),
    ];
    // Só 1 decisão no NCM do item: menos de 2, nada.
    assert.equal(sugestaoHistorico(analise(), h, CHAVE_ITEM), null);
  });

  it('CFOP manual: mesma escolha é o mesmo CFOP', () => {
    const manual = (cfop: string): EscolhaST => ({
      tipo: 'manual',
      cfop,
      mva: null,
      motivo: 'teste',
    });
    const h = [decisao(manual('2102'), 'X'), decisao(manual('2102'), 'Y')];
    const s = sugestaoHistorico(analise(), h, CHAVE_ITEM);
    assert.ok(s?.tipo === 'sugere');
    assert.match(s.texto, /^Pelo histórico: CFOP 2102\./);
    const h2 = [decisao(manual('2102'), 'X'), decisao(manual('2403'), 'Y')];
    assert.equal(
      sugestaoHistorico(analise(), h2, CHAVE_ITEM)?.tipo,
      'dividido',
    );
  });

  it('decisão própria do item tem prioridade', () => {
    const h = [
      decisao(SEM_ST, 'Lixeira'),
      decisao(SEM_ST, 'Balde'),
      decisao(LINHA_12, 'Item novo', NCM, '99888777', 'ITEM-NOVO'),
    ];
    assert.equal(sugestaoHistorico(analise(), h, CHAVE_ITEM), null);
  });

  it('a decisão do próprio item sem escolha não conta nem bloqueia', () => {
    const h = [
      decisao(SEM_ST, 'Lixeira'),
      decisao(SEM_ST, 'Balde'),
      decisao(null, 'Item novo', NCM, '99888777', 'ITEM-NOVO'),
    ];
    const s = sugestaoHistorico(analise(), h, CHAVE_ITEM);
    assert.ok(s?.tipo === 'sugere');
    assert.equal(s.total, 2);
  });

  it('linha que saiu da planilha: não sugere', () => {
    const outra: EscolhaST = { ...LINHA_12, linhaPlanilha: 99 } as EscolhaST;
    const h = [decisao(outra, 'A'), decisao(outra, 'B')];
    assert.equal(sugestaoHistorico(analise(), h, CHAVE_ITEM), null);
  });
});

describe('MVA do fornecedor x planilha', () => {
  it('igual (até 0,01 ponto): nada', () => {
    assert.equal(observacaoMvaFornecedor('56.94', 0.5694), null);
    assert.equal(observacaoMvaFornecedor('56.9400', 0.5694), null);
    assert.equal(observacaoMvaFornecedor('56.95', 0.5694), null);
  });

  it('diferente: observação para conferir', () => {
    assert.equal(
      observacaoMvaFornecedor('40.00', 0.5694),
      'MVA do fornecedor 40% difere da planilha 56,94%: conferir',
    );
    assert.equal(
      observacaoMvaFornecedor('56.96', 0.5694),
      'MVA do fornecedor 56,96% difere da planilha 56,94%: conferir',
    );
  });

  it('sem pMVAST ou sem MVA da planilha: nada', () => {
    assert.equal(observacaoMvaFornecedor(undefined, 0.5694), null);
    assert.equal(observacaoMvaFornecedor('', 0.5694), null);
    assert.equal(observacaoMvaFornecedor('40.00', null), null);
  });
});
