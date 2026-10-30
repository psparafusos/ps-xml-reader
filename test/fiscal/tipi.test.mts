import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { consultarTipi, lerTipi } from '../../src/fiscal/tipi.ts';

// Trecho do texto extraído do PDF da TIPI 2022 (capítulos 32, 60, 73, 87 e
// 95), com quebras de página, notas e uma tabela de Nota Complementar.
const trecho = readFileSync(new URL('./fixtures/tipi-trecho.txt', import.meta.url), 'utf8');
const tabela = lerTipi(trecho);

describe('tipi: leitura', () => {
  it('3208.10.20 = Vernizes, IPI 3,25', () => {
    const r = consultarTipi(tabela, '3208.10.20');
    assert.equal(r.existe, true);
    assert.equal(r.descricao, 'Vernizes');
    assert.equal(r.aliquotaIpi, 3.25);
  });

  it('a descrição completa traz a posição e a subposição', () => {
    const r = consultarTipi(tabela, '32081020');
    assert.match(r.descricaoCompleta ?? '', /^Tintas e vernizes, à base de polímeros sintéticos .* > À base de poliésteres > Vernizes$/);
  });

  it('aceita o NCM com ou sem pontos', () => {
    assert.deepEqual(consultarTipi(tabela, '7318.15.00'), consultarTipi(tabela, '73181500'));
  });

  it('NCM que não está na tabela não existe', () => {
    const r = consultarTipi(tabela, '3208.10.99');
    assert.equal(r.existe, false);
    assert.equal(r.aliquotaIpi, null);
  });

  it('descrição que atravessa a quebra de página e alíquota numa linha só', () => {
    const r = consultarTipi(tabela, '3208.20.11');
    assert.equal(r.aliquotaIpi, 3.25);
    assert.match(r.descricao ?? '', /Nota 3 da Seção VI, do tipo utilizado para a fabricação de circuitos impressos$/);
  });

  it('o cabeçalho de página no meio da subposição não quebra a hierarquia', () => {
    const r = tabela.porNcm.get('32089021');
    assert.deepEqual(
      r?.hierarquia.map((h) => h.codigo),
      ['32.08', '3208.90', '3208.90.2'],
    );
  });

  it('parafuso 7318.15.00 tem IPI 6,5', () => {
    const r = consultarTipi(tabela, '73181500');
    assert.equal(r.aliquotaIpi, 6.5);
    assert.match(r.descricao ?? '', /^Outros parafusos e pinos ou pernos/);
  });

  it('NT vira "NT"', () => {
    const t = lerTipi('Capítulo 1\r\n(%)\r\n01.01 Cavalos, asininos e muares, vivos.\r\n0101.21.00 -- Reprodutores de raça pura NT\r\n');
    assert.equal(consultarTipi(t, '0101.21.00').aliquotaIpi, 'NT');
  });

  it('código citado dentro de uma descrição quebrada não vira NCM novo', () => {
    const r = consultarTipi(tabela, '9503.00.50');
    assert.equal(r.aliquotaIpi, 6.5);
    assert.match(r.descricao ?? '', /exceto os do item 9503\.00\.40$/);
    assert.equal(consultarTipi(tabela, '9503.00.40').descricao, 'Trens elétricos, incluindo os trilhos, sinais e outros acessórios');
  });

  it('alíquota e traço colados pelo PDF ("6006.90.00- Outros0")', () => {
    assert.equal(consultarTipi(tabela, '6006.32.20').aliquotaIpi, 0);
    assert.equal(consultarTipi(tabela, '6006.32.20').descricao, 'De poliésteres');
    assert.equal(consultarTipi(tabela, '6006.90.00').descricao, 'Outros');
  });

  it('tabela de Nota Complementar não sobrescreve a alíquota da listagem', () => {
    assert.equal(consultarTipi(tabela, '8703.40.00').aliquotaIpi, 18.81);
    assert.equal(consultarTipi(tabela, '8703.60.00').aliquotaIpi, 18.81);
  });

  it('nota que começa com código ("60.06 e outras.") fica nas notas', () => {
    assert.equal(tabela.porNcm.get('60061000')?.aliquotaIpi, 0);
    assert.equal(tabela.porNcm.get('60061000')?.hierarquia[0].descricao, 'Outros tecidos de malha.');
  });
});

describe('tipi: relatório', () => {
  it('conta os NCMs e não deixa nenhum sem alíquota', () => {
    assert.equal(tabela.relatorio.totalNcm, tabela.porNcm.size);
    // 58 linhas com código de 8 dígitos no trecho, menos 3 citações: as duas
    // da tabela da NC (87-6) e o "9503.00.40" dentro da descrição de 9503.00.50.
    assert.equal(tabela.porNcm.size, 55);
    assert.deepEqual(tabela.relatorio.semAliquota, []);
  });

  it('agrupa as linhas ignoradas por motivo, com exemplos', () => {
    const motivos = new Map(tabela.relatorio.ignoradas.map((g) => [g.motivo, g]));
    assert.ok(motivos.get('cabeçalho ou rodapé de página')!.total > 0);
    const notas = motivos.get('título e notas de capítulo ou seção')!;
    assert.ok(notas.total > notas.exemplos.length);
    assert.equal(notas.exemplos.length, 8);
    assert.deepEqual(notas.exemplos[0], { linha: 1, texto: 'Capítulo 32' });
  });
});
