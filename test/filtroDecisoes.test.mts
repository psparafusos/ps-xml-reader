import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DecisaoLembrada } from '../src/fiscal/entrada.ts';
import {
  contagemPorTipo,
  filtrarDecisoes,
  textoDecisao,
  tiposDaDecisao,
} from '../src/filtroDecisoes.ts';

// Decisões inventadas: fornecedores, produtos e NCMs fictícios.
const base = {
  finalidade: 'revenda',
  atualizadaEm: '2026-10-20T10:00:00.000Z',
} as const;
const decisoes: DecisaoLembrada[] = [
  {
    ...base,
    raizCnpj: '11222333',
    fornecedor: 'Ferragens Exemplo Ltda',
    cProd: 'PAR-001',
    xProd: 'Parafuso sextavado 1/4',
    ncm: '73181500',
    escolha: {
      tipo: 'candidato',
      segmento: 'Autopeças',
      linhaPlanilha: 12,
      cest: '01.001.00',
    },
  },
  {
    ...base,
    raizCnpj: '44555666',
    fornecedor: 'Óleos Fictícios S.A.',
    cProd: 'LUB-20',
    xProd: 'Óleo lubrificante 20W50',
    ncm: '27101932',
    escolha: { tipo: 'apendice-xiv', lubrificante: 'derivado' },
  },
  {
    ...base,
    raizCnpj: '11222333',
    fornecedor: 'Ferragens Exemplo Ltda',
    cProd: 'LUV-9',
    xProd: 'Luva de vaqueta',
    ncm: '42032100',
    escolha: { tipo: 'sem-st' },
    origem: 'histórico',
  },
  {
    ...base,
    raizCnpj: '77888999',
    fornecedor: 'Distribuidora Modelo',
    cProd: 'TIN-3',
    xProd: 'Tinta acrílica branca',
    ncm: '32091010',
    escolha: { tipo: 'manual', cfop: '2556', mva: null, motivo: 'uso interno' },
  },
];

const nomes = (l: DecisaoLembrada[]) => l.map((d) => d.cProd);

describe('decisões lembradas: filtro por tipo', () => {
  it('cada tipo pega as suas; a do histórico entra também no tipo da escolha', () => {
    const por = (tipo: Parameters<typeof filtrarDecisoes>[1]['tipo']) =>
      nomes(filtrarDecisoes(decisoes, { busca: '', tipo }));
    assert.deepEqual(por(null), ['PAR-001', 'LUB-20', 'LUV-9', 'TIN-3']);
    assert.deepEqual(por('linha'), ['PAR-001']);
    assert.deepEqual(por('apendice-xiv'), ['LUB-20']);
    assert.deepEqual(por('sem-st'), ['LUV-9']);
    assert.deepEqual(por('manual'), ['TIN-3']);
    assert.deepEqual(por('historico'), ['LUV-9']);
    assert.deepEqual(tiposDaDecisao(decisoes[2]), ['sem-st', 'historico']);
  });

  it('contagem por tipo para os rótulos do filtro', () => {
    assert.deepEqual(contagemPorTipo(decisoes), {
      linha: 1,
      'sem-st': 1,
      manual: 1,
      'apendice-xiv': 1,
      historico: 1,
    });
  });
});

describe('decisões lembradas: busca', () => {
  const busca = (texto: string, tipo: 'sem-st' | null = null) =>
    nomes(filtrarDecisoes(decisoes, { busca: texto, tipo }));

  it('acha por fornecedor sem contar acento e maiúscula', () => {
    assert.deepEqual(busca('oleos ficticios'), ['LUB-20']);
    assert.deepEqual(busca('FERRAGENS'), ['PAR-001', 'LUV-9']);
  });

  it('acha por código e descrição do produto', () => {
    assert.deepEqual(busca('par-001'), ['PAR-001']);
    assert.deepEqual(busca('luva vaqueta'), ['LUV-9']);
  });

  it('acha por NCM, com ou sem os pontos', () => {
    assert.deepEqual(busca('7318.15.00'), ['PAR-001']);
    assert.deepEqual(busca('2710'), ['LUB-20']);
  });

  it('acha pela raiz do CNPJ', () => {
    assert.deepEqual(busca('77.888.999'), ['TIN-3']);
  });

  it('busca e filtro juntos; nada encontrado dá lista vazia', () => {
    assert.deepEqual(busca('ferragens', 'sem-st'), ['LUV-9']);
    assert.deepEqual(busca('parafuso', 'sem-st'), []);
    assert.deepEqual(busca('nada parecido'), []);
  });

  it('texto de cada decisão para a tabela', () => {
    assert.equal(
      textoDecisao(decisoes[2]),
      'Sem ST · Revenda · pelo histórico',
    );
    assert.match(textoDecisao(decisoes[0]), /^Autopeças, CEST 01\.001\.00 · /);
  });
});
