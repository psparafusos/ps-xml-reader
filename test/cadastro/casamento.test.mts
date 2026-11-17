// Motor de casamento contra o cadastro inventado de test/fixtures/cadastro
// (o mesmo que o medidor usa com as 6 NF-e inventadas). Cada caso difícil
// tem o seu item: filial com código diferente, códigos que só diferem por
// zeros, mesmo código em filiais apontando para produtos diferentes, EAN
// repetido, produto inativo e código reaproveitado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  chaveExata,
  normalizarCodigo,
  pareceGtin,
  prepararCadastro,
  sugerirNota,
  type ItemNota,
  type SugestaoItem,
} from '../../src/cadastro/casamento.ts';
import {
  validarCadastro,
  validarTextoCadastro,
} from '../../src/cadastro/formato.ts';

const lido = validarTextoCadastro(
  readFileSync(
    new URL('../fixtures/cadastro/cadastro.json', import.meta.url),
    'utf8',
  ),
);
if (!lido.ok)
  throw new Error(`cadastro inventado inválido: ${lido.erros.join(' ')}`);
const indice = prepararCadastro(lido.cadastro);

const ALFA = '11111111000191';
const ALFA_FILIAL = '11111111000272';
const BETA = '22222222000191';
const GAMA3 = '33333333000353';
const DELTA = '44444444000191';

let n = 0;
function item(p: Partial<ItemNota>): ItemNota {
  return {
    nItem: ++n,
    cProd: '',
    cEAN: 'SEM GTIN',
    xProd: 'ITEM',
    NCM: '',
    uCom: 'UN',
    ...p,
  };
}

function um(
  cnpj: string | null,
  p: Partial<ItemNota>,
  extra: { cpf?: string } = {},
): SugestaoItem {
  return sugerirNota(indice, {
    cnpjEmitente: cnpj,
    cpfEmitente: extra.cpf,
    itens: [item(p)],
  }).itens[0];
}

const tipos = (s: SugestaoItem) => s.avisos.map((a) => a.tipo);

describe('códigos: comparação', () => {
  it('exato ignora maiúsculas e espaços das pontas; normalizado tira espaços e zeros', () => {
    assert.equal(chaveExata(' psx-16 '), 'PSX-16');
    assert.equal(normalizarCodigo(' 00 94 5a'), '945A');
    assert.equal(normalizarCodigo('0000'), '0');
    assert.equal(normalizarCodigo('   '), '');
  });

  it('cara de GTIN: só dígitos com 8, 12, 13 ou 14 posições; SEM GTIN não', () => {
    assert.ok(pareceGtin('7890000001007'));
    assert.ok(pareceGtin('07890000001007'));
    assert.ok(pareceGtin('12345678'));
    assert.ok(!pareceGtin('SEM GTIN'));
    assert.ok(!pareceGtin('123456789'));
    assert.ok(!pareceGtin(''));
  });
});

describe('caminho (a): vínculo exato do emitente', () => {
  it('acha o produto, confiança alta, fator da mesma unidade', () => {
    const s = um(ALFA, { cProd: 'PSX-14', uCom: 'CX', vUnCom: 42 });
    assert.equal(s.caminho, 'vinculo-emitente');
    assert.equal(s.codigo, '100');
    assert.equal(s.confianca, 'alta');
    assert.equal(s.candidatos[0].fornecedor, ALFA);
    assert.deepEqual(s.fator, {
      fator: 100,
      unidadeCompra: 'CX',
      ultimaEntrada: '2026-10-20',
      fornecedor: ALFA,
      deFilial: false,
      unidadeConfere: true,
    });
    assert.deepEqual(s.avisos, []);
  });

  it('com o mesmo produto em duas unidades, o fator é o da unidade da nota', () => {
    const s = um(ALFA, { cProd: 'PSX-14', uCom: 'un' });
    assert.equal(s.fator?.fator, 1);
    assert.equal(s.fator?.unidadeCompra, 'UN');
  });

  it('sem diferenciar maiúsculas e sem os espaços do fim', () => {
    const s = um(ALFA, { cProd: 'psx-16 ', uCom: 'CX' });
    assert.equal(s.caminho, 'vinculo-emitente');
    assert.equal(s.codigo, '101');
  });
});

describe('caminho (b): filial com a mesma raiz', () => {
  it('filial com código próprio: o vínculo da filial vale para a filial (a)', () => {
    const s = um(ALFA_FILIAL, { cProd: 'F-100' });
    assert.equal(s.caminho, 'vinculo-emitente');
    assert.equal(s.codigo, '100');
  });

  it('código que só a matriz tem: (b), confiança média, fator da matriz marcado como de filial', () => {
    const s = um(ALFA_FILIAL, { cProd: 'PSX-16', uCom: 'CX' });
    assert.equal(s.caminho, 'vinculo-raiz');
    assert.equal(s.codigo, '101');
    assert.equal(s.confianca, 'media');
    assert.equal(s.candidatos[0].fornecedor, ALFA);
    assert.equal(s.fator?.fator, 50);
    assert.equal(s.fator?.deFilial, true);
  });

  it('código da filial na nota da matriz também vai pela raiz', () => {
    const s = um(ALFA, { cProd: 'BN-8' });
    assert.equal(s.caminho, 'vinculo-raiz');
    assert.equal(s.codigo, '102');
  });

  it('mesmo código em filiais apontando para produtos diferentes: ambíguo, com a lista', () => {
    const s = um(GAMA3, { cProd: 'AB-1' });
    assert.equal(s.caminho, 'vinculo-raiz');
    assert.equal(s.ambiguo, true);
    assert.equal(s.codigo, null);
    assert.equal(s.confianca, 'nenhuma');
    assert.deepEqual(
      s.candidatos.map((c) => [c.codigo, c.fornecedor]),
      [
        ['300', '33333333000191'],
        ['301', '33333333000272'],
      ],
    );
    assert.equal(s.fator, null);
  });

  it('CPF não tem raiz: nada de filial', () => {
    const s = um(null, { cProd: 'PSX-16' }, { cpf: '12345678909' });
    assert.equal(s.caminho, null);
  });
});

describe('caminho (c): código sem espaços e sem zeros à esquerda', () => {
  it('códigos que só diferem por zeros: o exato decide quando existe', () => {
    const s = um(BETA, { cProd: '9381' });
    assert.equal(s.caminho, 'vinculo-emitente');
    assert.equal(s.codigo, '201');
  });

  it('sem o exato, os dois viram candidatos: ambíguo', () => {
    const s = um(BETA, { cProd: '09381' });
    assert.equal(s.caminho, 'codigo-emitente');
    assert.equal(s.ambiguo, true);
    assert.deepEqual(
      s.candidatos.map((c) => c.codigo),
      ['200', '201'],
    );
  });

  it('com zeros a menos que o vínculo: acha, confiança média', () => {
    const s = um(BETA, { cProd: '450', uCom: 'CX' });
    assert.equal(s.caminho, 'codigo-emitente');
    assert.equal(s.codigo, '202');
    assert.equal(s.confianca, 'media');
    assert.equal(s.fator?.fator, 10);
  });

  it('espaço no meio do código', () => {
    const s = um(BETA, { cProd: '7 001', uCom: 'CX' });
    assert.equal(s.caminho, 'codigo-emitente');
    assert.equal(s.codigo, '203');
    assert.ok(
      tipos(s).includes('unidade-diferente'),
      'fator conhecido é de UN, nota em CX',
    );
    assert.equal(s.fator?.unidadeConfere, false);
  });

  it('na raiz: confiança baixa', () => {
    const s = um(ALFA_FILIAL, { cProd: '0PSX-16' });
    assert.equal(s.caminho, 'codigo-raiz');
    assert.equal(s.codigo, '101');
    assert.equal(s.confianca, 'baixa');
  });
});

describe('caminhos (d) e (e): código de barras', () => {
  it('(d) cEAN contra o código de barras', () => {
    const s = um(ALFA, { cProd: 'ARP-14', cEAN: '7890000001052' });
    assert.equal(s.caminho, 'cean');
    assert.equal(s.codigo, '105');
    assert.equal(s.confianca, 'media');
    assert.equal(s.candidatos[0].fornecedor, null);
  });

  it('(d) GTIN-14 com zero na frente casa com o EAN-13', () => {
    const s = um(GAMA3, { cProd: 'VR-18', cEAN: '07890000004022' });
    assert.equal(s.caminho, 'cean');
    assert.equal(s.codigo, '402');
  });

  it('(d) EAN repetido em dois produtos: ambíguo', () => {
    const s = um(GAMA3, { cProd: 'FI-19', cEAN: '7890000004008' });
    assert.equal(s.caminho, 'cean');
    assert.equal(s.ambiguo, true);
    assert.deepEqual(
      s.candidatos.map((c) => c.codigo),
      ['400', '401'],
    );
  });

  it('(e) cProd com cara de EAN, confiança baixa', () => {
    const s = um(GAMA3, { cProd: '7890000004039' });
    assert.equal(s.caminho, 'cprod-ean');
    assert.equal(s.codigo, '403');
    assert.equal(s.confianca, 'baixa');
  });

  it('SEM GTIN é ignorado: sem vínculo, fica sem sugestão', () => {
    const s = um(ALFA, { cProd: 'ZZ-99', cEAN: 'SEM GTIN' });
    assert.equal(s.caminho, null);
    assert.equal(s.codigo, null);
    assert.equal(s.confianca, 'nenhuma');
    assert.deepEqual(s.candidatos, []);
  });

  it('o vínculo vem antes do código de barras', () => {
    const s = um(ALFA, { cProd: 'PSX-14', cEAN: '7890000004039' });
    assert.equal(s.caminho, 'vinculo-emitente');
    assert.equal(s.codigo, '100');
  });
});

describe('avisos', () => {
  it('produto inativo: marcado e com a confiança rebaixada', () => {
    const s = um(BETA, { cProd: 'B-500' });
    assert.equal(s.codigo, '500');
    assert.equal(s.candidatos[0].ativo, false);
    assert.deepEqual(tipos(s), ['inativo']);
    assert.equal(s.confianca, 'media');
  });

  it('código reaproveitado sem compra do fornecedor depois: aviso e confiança rebaixada', () => {
    const s = um(DELTA, { cProd: 'D-600' });
    assert.equal(s.codigo, '600');
    assert.deepEqual(tipos(s), ['reaproveitado']);
    assert.equal(s.confianca, 'media');
    assert.match(
      s.avisos[0].texto,
      /reaproveitado em 01\/05\/2026 e a última compra deste fornecedor é de 10\/12\/2025/,
    );
  });

  it('código reaproveitado com compra depois: sem aviso', () => {
    const s = um(DELTA, { cProd: 'D-601' });
    assert.equal(s.codigo, '601');
    assert.deepEqual(s.avisos, []);
    assert.equal(s.confianca, 'alta');
  });

  it('NCM diferente do cadastro', () => {
    const s = um(DELTA, { cProd: 'D-602', NCM: '84669200' });
    assert.deepEqual(tipos(s), ['ncm-diferente']);
    assert.equal(
      s.avisos[0].texto,
      'NCM do cadastro 96039000, na nota 84669200.',
    );
  });

  it('custo fora do padrão, pela unidade de venda', () => {
    const s = um(ALFA_FILIAL, { cProd: 'F-103', vUnCom: 0.09 });
    assert.deepEqual(tipos(s), ['custo-fora']);
    assert.match(s.avisos[0].texto, /80% acima do cadastro/);
    const dentro = um(ALFA, { cProd: 'PSX-14', uCom: 'CX', vUnCom: 45 });
    assert.deepEqual(
      dentro.avisos,
      [],
      'CX de 100 a 45,00 dá 0,45 por UN contra 0,42',
    );
  });

  it('ambíguo em que só um candidato está ativo', () => {
    const r = validarCadastro({
      meta: { versao: 1, origem: 'x', extraido_em: '2026-01-01' },
      fornecedores: [],
      produtos: [
        { codigo: '1', descricao: 'A', unidade: 'UN', ativo: true },
        { codigo: '2', descricao: 'B', unidade: 'UN', ativo: false },
      ],
      vinculos: [
        { fornecedor: ALFA, codigo_fornecedor: 'X', produto: '1' },
        { fornecedor: ALFA, codigo_fornecedor: 'x ', produto: '2' },
      ],
    });
    assert.ok(r.ok);
    const s = sugerirNota(prepararCadastro(r.cadastro), {
      cnpjEmitente: ALFA,
      itens: [item({ cProd: 'X' })],
    }).itens[0];
    assert.equal(s.ambiguo, true);
    assert.deepEqual(tipos(s), ['ambiguo-um-ativo']);
  });
});

describe('a nota', () => {
  it('já lançada, pela chave, com a data da entrada', () => {
    const r = sugerirNota(indice, {
      cnpjEmitente: ALFA,
      chave: '28261111111111000191550010000012011000012013',
      itens: [],
    });
    assert.deepEqual(r.notaLancada, { entrada: '2026-11-12' });
    assert.equal(r.emitenteConhecido, true);
  });

  it('não lançada e emitente fora do cadastro', () => {
    const r = sugerirNota(indice, {
      cnpjEmitente: '55555555000191',
      chave: '28261155555555000191550010000003101000003103',
      itens: [item({ cProd: '100' })],
    });
    assert.equal(r.notaLancada, null);
    assert.equal(r.emitenteConhecido, false);
    assert.equal(r.itens[0].caminho, null);
  });

  it('filial que não está em fornecedores mas tem a raiz conhecida conta como conhecida', () => {
    const r = sugerirNota(indice, {
      cnpjEmitente: '11111111000353',
      itens: [],
    });
    assert.equal(r.emitenteConhecido, true);
  });
});
