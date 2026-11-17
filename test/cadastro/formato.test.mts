import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  LIMITE_ERROS_CADASTRO,
  validarCadastro,
  validarTextoCadastro,
} from '../../src/cadastro/formato.ts';

/** Cadastro mínimo válido (inventado); cada teste estraga uma parte. */
function base(): Record<string, any> {
  return {
    meta: { versao: 1, origem: 'Teste', extraido_em: '2026-11-14' },
    fornecedores: [
      { cnpj_cpf: '11111111000191', nome: 'Fornecedor Um', ativo: true },
    ],
    produtos: [
      { codigo: '10', descricao: 'PRODUTO DEZ', unidade: 'UN', ativo: true },
      { codigo: 20, descricao: 'PRODUTO VINTE', unidade: 'CX', ativo: false },
    ],
    vinculos: [
      { fornecedor: '11111111000191', codigo_fornecedor: '007', produto: '10' },
    ],
  };
}

function recusa(dados: unknown): string[] {
  const r = validarCadastro(dados);
  assert.equal(r.ok, false, 'deveria recusar');
  return r.ok ? [] : r.erros;
}

describe('formato do cadastro: o que é aceito', () => {
  it('aceita o mínimo, sem as seções opcionais, e normaliza os campos', () => {
    const r = validarCadastro(base());
    assert.ok(r.ok);
    assert.equal(
      r.cadastro.produtos[1].codigo,
      '20',
      'código numérico vira texto',
    );
    assert.equal(r.cadastro.produtos[0].codigoBarras, null);
    assert.equal(r.cadastro.vinculos[0].codigoFornecedor, '007');
    assert.deepEqual(r.cadastro.fatores, []);
    assert.deepEqual(r.relatorio.quantidades, {
      fornecedores: 1,
      produtos: 2,
      produtosAtivos: 1,
      vinculos: 1,
      fatores: 0,
      notasLancadas: 0,
    });
    assert.equal(r.relatorio.totalPontos, 0);
    assert.ok(
      r.relatorio.observacoes.some((o) => o.includes('Sem a seção fatores')),
    );
    assert.ok(
      r.relatorio.observacoes.some((o) => o.includes('notas_lancadas')),
    );
  });

  it('o exemplo do docs/formato-cadastro.md passa', () => {
    const md = readFileSync(
      new URL('../../docs/formato-cadastro.md', import.meta.url),
      'utf8',
    );
    const json = /```json\n([\s\S]*?)```/.exec(md)?.[1];
    assert.ok(json, 'exemplo não achado');
    const r = validarTextoCadastro(json);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.relatorio.totalPontos, 0);
    assert.deepEqual(r.relatorio.observacoes, []);
  });

  it('tolera campos e seções a mais e cita nas observações', () => {
    const d = base();
    d.produtos[0].cor = 'azul';
    d.meta.sistema = 'qualquer';
    d.estoque = [];
    const r = validarCadastro(d);
    assert.ok(r.ok);
    assert.ok(
      r.relatorio.observacoes.includes('Seções a mais, ignoradas: estoque.'),
    );
    assert.ok(
      r.relatorio.observacoes.includes(
        'Campos a mais em produtos, ignorados: cor.',
      ),
    );
    assert.ok(
      r.relatorio.observacoes.includes(
        'Campos a mais em meta, ignorados: sistema.',
      ),
    );
  });

  it('aceita data e hora em extraido_em e BOM no começo do texto', () => {
    const d = base();
    d.meta.extraido_em = '2026-11-14T12:30:00';
    assert.ok(validarTextoCadastro(`﻿${JSON.stringify(d)}`).ok);
  });

  it('pontos de atenção: produto repetido, vínculo e fator para produto inexistente, NCM inválido', () => {
    const d = base();
    d.produtos.push({
      codigo: '10',
      descricao: 'DE NOVO',
      unidade: 'UN',
      ativo: true,
    });
    d.produtos[0].ncm = '7318.15.00';
    d.vinculos.push({
      fornecedor: '11111111000191',
      codigo_fornecedor: 'X',
      produto: '99',
    });
    d.fatores = [
      {
        fornecedor: '11111111000191',
        produto: '98',
        unidade_compra: 'CX',
        fator: 10,
      },
    ];
    const r = validarCadastro(d);
    assert.ok(r.ok);
    assert.equal(r.relatorio.totalPontos, 4);
    const motivos = r.relatorio.pontos.map((p) => `${p.onde}: ${p.motivo}`);
    assert.deepEqual(motivos, [
      'produtos, registro 1: NCM sem 8 dígitos (o valor ficou de fora)',
      'produtos, registro 3: código de produto repetido (ficou o primeiro)',
      'vinculos, registro 2: vínculo para produto que não está em produtos (ficou de fora)',
      'fatores, registro 1: fator para produto que não está em produtos (ficou de fora)',
    ]);
    assert.equal(r.cadastro.produtos.length, 2);
    assert.equal(r.cadastro.produtos[0].descricao, 'PRODUTO DEZ');
    assert.equal(r.cadastro.produtos[0].ncm, null);
    assert.equal(r.cadastro.vinculos.length, 1);
  });

  it('CNPJ fora de fornecedores e repetições viram observação, não ponto', () => {
    const d = base();
    d.vinculos.push({
      fornecedor: '22222222000191',
      codigo_fornecedor: 'A',
      produto: '10',
    });
    d.vinculos.push({
      fornecedor: '11111111000191',
      codigo_fornecedor: '007',
      produto: '10',
    });
    const chave = '1'.repeat(44);
    d.notas_lancadas = [{ chave }, { chave, entrada: '2026-01-02' }];
    const r = validarCadastro(d);
    assert.ok(r.ok);
    assert.equal(r.relatorio.totalPontos, 0);
    assert.equal(r.cadastro.vinculos.length, 2);
    assert.equal(r.cadastro.notasLancadas.length, 1);
    const obs = r.relatorio.observacoes.join(' | ');
    assert.match(
      obs,
      /1 CNPJ ou CPF aparece em vinculos ou fatores sem estar em fornecedores/,
    );
    assert.match(obs, /1 vínculo repetido igual/);
    assert.match(obs, /1 chave de nota repetida/);
  });

  it('o mesmo código do fornecedor para dois produtos fica (é o caso ambíguo do motor)', () => {
    const d = base();
    d.vinculos.push({
      fornecedor: '11111111000191',
      codigo_fornecedor: '007',
      produto: '20',
    });
    const r = validarCadastro(d);
    assert.ok(r.ok);
    assert.equal(r.cadastro.vinculos.length, 2);
  });
});

describe('formato do cadastro: o que é recusado', () => {
  it('JSON quebrado, com o erro do leitor', () => {
    const r = validarTextoCadastro('{"meta": ');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.erros[0], /^O arquivo não é um JSON válido \(/);
  });

  it('lista, texto ou objeto sem nenhuma seção conhecida', () => {
    assert.match(recusa([])[0], /esperado um objeto JSON/);
    assert.match(
      recusa({ itens: [] })[0],
      /não parece o cadastro do sistema de gestão/,
    );
  });

  it('seção obrigatória que falta', () => {
    const d = base();
    delete d.vinculos;
    assert.deepEqual(recusa(d), ['Falta a seção vinculos.']);
  });

  it('meta: versão desconhecida, origem vazia, data que não existe', () => {
    const d = base();
    d.meta = { versao: 2, origem: ' ', extraido_em: '2026-02-30' };
    assert.deepEqual(recusa(d), [
      'meta.versao 2 não é conhecida: este app lê a versão 1.',
      'meta.origem deve ser um texto com o nome da origem (veio " ").',
      'meta.extraido_em deve ser a data da extração, AAAA-MM-DD ou AAAA-MM-DDTHH:MM:SS (veio "2026-02-30").',
    ]);
  });

  it('seção que não é lista e registro que não é objeto', () => {
    const d = base();
    d.fornecedores = {};
    d.produtos.push('PRODUTO');
    assert.deepEqual(recusa(d), [
      'fornecedores deve ser uma lista (veio um objeto).',
      'produtos, registro 3: deve ser um objeto (veio "PRODUTO").',
    ]);
  });

  it('campo obrigatório ausente ou de outro tipo, com o registro e o valor', () => {
    const d = base();
    d.produtos[0].ativo = 'S';
    delete d.produtos[1].descricao;
    d.fornecedores[0].cnpj_cpf = '11.111.111/0001-91';
    d.vinculos[0].codigo_fornecedor = 7;
    const erros = recusa(d);
    assert.deepEqual(erros, [
      'fornecedores, registro 1: cnpj_cpf deve ser o CNPJ (14 dígitos) ou o CPF (11), só os dígitos, como texto (veio "11.111.111/0001-91").',
      'produtos, registro 1: ativo é obrigatório e deve ser true ou false (veio "S").',
      'produtos, registro 2: descricao é obrigatório e deve ser um texto não vazio (veio nada).',
      'vinculos, registro 1: codigo_fornecedor deve ser texto entre aspas, como veio na nota (número perde os zeros à esquerda) (veio 7).',
    ]);
  });

  it('fatores e notas: fator zero, custo negativo, data e chave inválidas', () => {
    const d = base();
    d.produtos[0].custo = -1;
    d.fatores = [
      {
        fornecedor: '11111111000191',
        produto: '10',
        unidade_compra: 'CX',
        fator: 0,
      },
      {
        fornecedor: '11111111000191',
        produto: '10',
        unidade_compra: 'CX',
        fator: 2,
        ultima_entrada: '20/10/2026',
      },
    ];
    d.notas_lancadas = [{ chave: '123' }];
    const erros = recusa(d);
    assert.equal(erros.length, 4);
    assert.match(
      erros[0],
      /produtos, registro 1: custo deve ser um número maior ou igual a zero/,
    );
    assert.match(
      erros[1],
      /fatores, registro 1: fator é obrigatório e deve ser um número maior que zero \(veio 0\)/,
    );
    assert.match(
      erros[2],
      /fatores, registro 2: ultima_entrada deve ser uma data AAAA-MM-DD ou null \(veio "20\/10\/2026"\)/,
    );
    assert.match(
      erros[3],
      /notas_lancadas, registro 1: chave deve ser a chave de acesso com 44 dígitos/,
    );
  });

  it('produtos vazio', () => {
    const d = base();
    d.produtos = [];
    d.vinculos = [];
    assert.deepEqual(recusa(d), [
      'A seção produtos está vazia: sem produtos não há o que sugerir.',
    ]);
  });

  it('muitos erros: os primeiros e a contagem do resto', () => {
    const d = base();
    d.produtos = Array.from({ length: 30 }, (_, i) => ({
      codigo: String(i),
      descricao: 'X',
      unidade: 'UN',
    }));
    const r = validarCadastro(d);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.totalErros, 30);
    assert.equal(r.erros.length, LIMITE_ERROS_CADASTRO + 1);
    assert.equal(r.erros.at(-1), '... e mais 10.');
  });
});
