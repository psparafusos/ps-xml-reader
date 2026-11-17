import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  LIMITE_CADASTRO_BYTES,
  lerArquivoCadastro,
  montarInfoCadastro,
  seloCadastro,
  textoExtracao,
  textoQuantidades,
  validarInfoCadastro,
} from '../../src/cadastro/documento.ts';
import { pedidoValido, resultadoValido } from '../../src/servico/protocolo.ts';
import { executarTarefa } from '../../src/servico/tarefas.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
const inventado = readFileSync(
  new URL('../fixtures/cadastro/cadastro.json', import.meta.url),
);

function infoDe(dados: Uint8Array) {
  const l = lerArquivoCadastro(dados);
  assert.ok(l.ok);
  return montarInfoCadastro(
    l,
    'cadastro.json',
    dados.byteLength,
    new Date('2026-11-17T10:00:00Z'),
  );
}

describe('cadastro como documento: leitura do arquivo', () => {
  it('lê o cadastro inventado e resume (sem devolver o cadastro inteiro)', () => {
    const l = lerArquivoCadastro(new Uint8Array(inventado));
    assert.ok(l.ok);
    assert.equal(l.origem, 'Cadastro inventado para os testes do PS Reader');
    assert.equal(l.extraidoEm, '2026-11-14T12:30:00');
    assert.equal(l.quantidades.produtos, 20);
    assert.equal(l.quantidades.produtosAtivos, 19);
    assert.ok(!('cadastro' in l));
  });

  it('recusa texto que não é UTF-8', () => {
    const l = lerArquivoCadastro(
      new Uint8Array([0x7b, 0x22, 0xe9, 0x22, 0x7d]),
    );
    assert.equal(l.ok, false);
    assert.match(l.ok ? '' : l.erros[0], /não está em UTF-8/);
  });

  it('recusa com os erros do validador', () => {
    const l = lerArquivoCadastro(
      bytes('{"meta": {}, "fornecedores": [], "produtos": [], "vinculos": []}'),
    );
    assert.equal(l.ok, false);
    assert.ok(!l.ok && l.totalErros === 3);
  });
});

describe('cadastro como documento: cadastro-info.json', () => {
  it('a info montada volta igual pela conferência do disco', () => {
    const info = infoDe(new Uint8Array(inventado));
    assert.deepEqual(
      validarInfoCadastro(JSON.parse(JSON.stringify(info))),
      info,
    );
  });

  it('campo de outro tipo, a mais de pontos ou formato desconhecido: null', () => {
    const info = infoDe(new Uint8Array(inventado));
    const estraga = (f: (x: any) => void) => {
      const x = JSON.parse(JSON.stringify(info));
      f(x);
      return validarInfoCadastro(x);
    };
    assert.equal(
      estraga((x) => (x.formato = 2)),
      null,
    );
    assert.equal(
      estraga((x) => (x.arquivo = 1)),
      null,
    );
    assert.equal(
      estraga((x) => (x.quantidades.produtos = '20')),
      null,
    );
    assert.equal(
      estraga((x) => (x.importadoEm = 'ontem')),
      null,
    );
    assert.equal(
      estraga((x) => (x.pontos = [{ onde: 'a', motivo: 'b' }])),
      null,
    );
    assert.equal(
      estraga((x) => (x.observacoes = [1])),
      null,
    );
    assert.equal(validarInfoCadastro(null), null);
    // Campos a mais no disco não passam adiante.
    assert.ok(!('extra' in (estraga((x) => (x.extra = 'x')) ?? {})));
  });
});

describe('cadastro como documento: o que o cartão mostra', () => {
  it('selo: opcional, incompatível, carregado e carregado com pontos', () => {
    assert.deepEqual(seloCadastro({ info: null, recusado: false }), {
      estado: 'opcional',
      texto: 'Opcional, não carregado',
    });
    assert.deepEqual(seloCadastro({ info: null, recusado: true }), {
      estado: 'faltando',
      texto: 'Incompatível',
    });
    const info = infoDe(new Uint8Array(inventado));
    assert.deepEqual(seloCadastro({ info, recusado: false }), {
      estado: 'ok',
      texto: 'Carregado',
    });
    assert.deepEqual(
      seloCadastro({ info: { ...info, totalPontos: 1 }, recusado: false }),
      {
        estado: 'aviso',
        texto: 'Carregado com 1 ponto de atenção',
      },
    );
  });

  it('data da extração e quantidades por extenso', () => {
    assert.equal(textoExtracao('2026-11-14T12:30:00'), '14/11/2026 às 12:30');
    assert.equal(textoExtracao('2026-11-14'), '14/11/2026');
    assert.equal(
      textoQuantidades({
        fornecedores: 1893,
        produtos: 14312,
        produtosAtivos: 7033,
        vinculos: 1,
        fatores: 0,
        notasLancadas: 28077,
      }),
      '14.312 produtos (7.033 ativos) · 1.893 fornecedores · 1 vínculo · 0 fatores · 28.077 notas lançadas',
    );
  });
});

describe('cadastro no serviço de leitura pesada', () => {
  it('pedido: só bytes, até o limite', () => {
    assert.ok(
      pedidoValido({
        id: 1,
        tarefa: { tipo: 'cadastro', dados: new Uint8Array(4) },
      }),
    );
    assert.ok(
      !pedidoValido({ id: 1, tarefa: { tipo: 'cadastro', dados: 'texto' } }),
    );
    assert.ok(
      !pedidoValido({
        id: 1,
        tarefa: {
          tipo: 'cadastro',
          dados: new Uint8Array(LIMITE_CADASTRO_BYTES + 1),
        },
      }),
    );
  });

  it('a tarefa anuncia a etapa e devolve um resultado que o principal aceita', async () => {
    const etapas: string[] = [];
    const tarefa = {
      tipo: 'cadastro',
      dados: new Uint8Array(inventado),
    } as const;
    const r = await executarTarefa(tarefa, (e) => etapas.push(e));
    assert.deepEqual(etapas, ['cadastro']);
    assert.ok(resultadoValido(tarefa, r));
    const recusado = await executarTarefa({
      tipo: 'cadastro',
      dados: bytes('[]'),
    });
    assert.ok(resultadoValido(tarefa, recusado));
  });

  it('resultado fora do formato é recusado', () => {
    const tarefa = { tipo: 'cadastro', dados: new Uint8Array() } as const;
    assert.ok(!resultadoValido(tarefa, { ok: true }));
    assert.ok(
      !resultadoValido(tarefa, { ok: false, erros: [1], totalErros: 1 }),
    );
    assert.ok(!resultadoValido(tarefa, null));
  });
});
