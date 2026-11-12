// Supervisor do serviço de leitura pesada (src/servico/supervisor.ts) com um
// processo filho de mentira: resultado, andamento, tempo máximo, teto de
// memória, cancelamento, filho que cai no meio, filho que não sobe (reserva
// no principal), resultado fora do formato e fila.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import type { Pedido, Tarefa } from '../../src/servico/protocolo.ts';
import {
  mensagemDoDesfecho,
  ServicoPesado,
  type OpcoesServico,
  type ProcessoFilho,
} from '../../src/servico/supervisor.ts';

class FilhoFalso extends EventEmitter implements ProcessoFilho {
  static proximoPid = 1000;
  readonly pid = FilhoFalso.proximoPid++;
  pedidos: Pedido[] = [];
  morto = false;
  postMessage(m: Pedido): void {
    this.pedidos.push(m);
  }
  kill(): boolean {
    this.morto = true;
    setImmediate(() => this.emit('exit', 1));
    return true;
  }
  subir(): void {
    setImmediate(() => this.emit('spawn'));
  }
  responder(m: unknown): void {
    this.emit('message', m);
  }
}

const TAREFA: Tarefa = { tipo: 'nfe', caminho: 'C:\\Notas\\grande.xml' };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function montar(extra: Partial<OpcoesServico> = {}) {
  const filhos: FilhoFalso[] = [];
  const avisos: string[] = [];
  let memoria = 100;
  const reservas: Tarefa[] = [];
  const servico = new ServicoPesado({
    criarFilho: () => {
      const f = new FilhoFalso();
      filhos.push(f);
      f.subir();
      return f;
    },
    memoriaMB: () => memoria,
    reserva: async (t) => {
      reservas.push(t);
      return { ok: true, texto: 'da reserva' };
    },
    validar: (_t, r) =>
      typeof r === 'object' && r !== null && 'ok' in (r as object),
    limiteMB: () => 1024,
    tempoMaximoMs: () => 2000,
    avisar: (m) => avisos.push(m),
    intervaloVigiaMs: 10,
    esperaSubidaMs: 200,
    ...extra,
  });
  return {
    servico,
    filhos,
    avisos,
    reservas,
    memoria: (mb: number) => {
      memoria = mb;
    },
  };
}

/** Espera o filho receber o pedido de número `n`. */
async function pedidoRecebido(f: () => FilhoFalso | undefined, n = 1) {
  for (let i = 0; i < 200; i++) {
    if ((f()?.pedidos.length ?? 0) >= n) return f() as FilhoFalso;
    await espera(5);
  }
  throw new Error('o filho não recebeu o pedido');
}

describe('ServicoPesado', () => {
  it('manda a tarefa ao filho, repassa o andamento e devolve o resultado', async () => {
    const { servico, filhos } = montar();
    const etapas: string[] = [];
    const { id, desfecho } = servico.executar(TAREFA, (e) => etapas.push(e));
    const f = await pedidoRecebido(() => filhos[0]);
    assert.deepEqual(f.pedidos[0], { id, tarefa: TAREFA });
    f.responder({ id, tipo: 'progresso', etapa: 'lendo' });
    f.responder({ id, tipo: 'resultado', resultado: { ok: true, texto: 'x' } });
    assert.deepEqual(await desfecho, {
      status: 'ok',
      resultado: { ok: true, texto: 'x' },
      noFilho: true,
    });
    assert.deepEqual(etapas, ['lendo']);
    assert.equal(f.morto, false);
    servico.encerrar();
  });

  it('tempo máximo: encerra o filho e o próximo pedido sobe outro', async () => {
    const { servico, filhos } = montar({ tempoMaximoMs: () => 50 });
    const r = await servico.executar(TAREFA).desfecho;
    assert.deepEqual(r, { status: 'tempo', limiteMs: 50 });
    assert.equal(filhos[0].morto, true);
    const segundo = servico.executar(TAREFA);
    const f2 = await pedidoRecebido(() => filhos[1]);
    f2.responder({
      id: segundo.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: '' },
    });
    assert.equal((await segundo.desfecho).status, 'ok');
    assert.equal(filhos.length, 2);
    servico.encerrar();
  });

  it('memória acima do teto: encerra o filho', async () => {
    const m = montar();
    const exec = m.servico.executar(TAREFA);
    await pedidoRecebido(() => m.filhos[0]);
    m.memoria(1100);
    assert.deepEqual(await exec.desfecho, {
      status: 'memoria',
      limiteMB: 1024,
    });
    assert.equal(m.filhos[0].morto, true);
    m.servico.encerrar();
  });

  it('cancelar a que está rodando encerra o filho; a da fila só sai da fila', async () => {
    const { servico, filhos } = montar();
    const primeira = servico.executar(TAREFA);
    const segunda = servico.executar(TAREFA);
    await pedidoRecebido(() => filhos[0]);
    assert.equal(servico.cancelar(segunda.id), true);
    assert.deepEqual(await segunda.desfecho, { status: 'cancelado' });
    assert.equal(filhos[0].morto, false);
    assert.equal(servico.cancelar(primeira.id), true);
    assert.deepEqual(await primeira.desfecho, { status: 'cancelado' });
    assert.equal(filhos[0].morto, true);
    // Resposta atrasada do filho morto: ignorada.
    filhos[0].responder({
      id: primeira.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: '' },
    });
    assert.equal(servico.cancelar(primeira.id), false);
    servico.encerrar();
  });

  it('filho que cai no meio: desfecho "caiu" e o próximo pedido funciona', async () => {
    const { servico, filhos } = montar();
    const exec = servico.executar(TAREFA);
    const f = await pedidoRecebido(() => filhos[0]);
    f.emit('exit', 3);
    assert.deepEqual(await exec.desfecho, { status: 'caiu' });
    const outra = servico.executar(TAREFA);
    const f2 = await pedidoRecebido(() => filhos[1]);
    f2.responder({
      id: outra.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: '' },
    });
    assert.equal((await outra.desfecho).status, 'ok');
    servico.encerrar();
  });

  it('filho que não sobe: roda no principal, com aviso no log, daí em diante', async () => {
    const m = montar({
      criarFilho: () => {
        throw new Error('arquivo do serviço não encontrado');
      },
    });
    const r = await m.servico.executar(TAREFA).desfecho;
    assert.deepEqual(r, {
      status: 'ok',
      resultado: { ok: true, texto: 'da reserva' },
      noFilho: false,
    });
    assert.equal(m.servico.emReserva, true);
    assert.ok(m.avisos.some((a) => a.includes('não subiu')));
    await m.servico.executar(TAREFA).desfecho;
    assert.equal(m.reservas.length, 2);
  });

  it('filho que sai antes de subir, ou demora demais: reserva', async () => {
    const saiu = montar({
      criarFilho: () => {
        const f = new FilhoFalso();
        setImmediate(() => f.emit('exit', 1));
        return f;
      },
    });
    assert.equal(
      ((await saiu.servico.executar(TAREFA).desfecho) as { noFilho: boolean })
        .noFilho,
      false,
    );
    const lento = montar({
      criarFilho: () => new FilhoFalso(),
      esperaSubidaMs: 30,
    });
    assert.equal(
      ((await lento.servico.executar(TAREFA).desfecho) as { noFilho: boolean })
        .noFilho,
      false,
    );
  });

  it('resultado fora do formato: falha e o filho é encerrado', async () => {
    const { servico, filhos, avisos } = montar();
    const exec = servico.executar(TAREFA);
    const f = await pedidoRecebido(() => filhos[0]);
    f.responder({ id: exec.id, tipo: 'resultado', resultado: 'estranho' });
    const r = await exec.desfecho;
    assert.equal(r.status, 'falha');
    assert.equal(f.morto, true);
    assert.ok(avisos.some((a) => a.includes('fora do formato')));
  });

  it('mensagens de outro pedido ou fora do formato são ignoradas', async () => {
    const { servico, filhos } = montar();
    const exec = servico.executar(TAREFA);
    const f = await pedidoRecebido(() => filhos[0]);
    f.responder({
      id: exec.id + 99,
      tipo: 'resultado',
      resultado: { ok: true },
    });
    f.responder({ id: exec.id, tipo: 'progresso', etapa: 'apagar-tudo' });
    f.responder('texto solto');
    f.responder({ id: exec.id, tipo: 'falha', mensagem: 'disco' });
    assert.deepEqual(await exec.desfecho, {
      status: 'falha',
      mensagem: 'disco',
    });
    servico.encerrar();
  });

  it('fila: uma tarefa por vez, na ordem', async () => {
    const { servico, filhos } = montar();
    const a = servico.executar(TAREFA);
    const b = servico.executar(TAREFA);
    const f = await pedidoRecebido(() => filhos[0]);
    assert.equal(f.pedidos.length, 1);
    f.responder({
      id: a.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: 'a' },
    });
    await a.desfecho;
    await pedidoRecebido(() => filhos[0], 2);
    f.responder({
      id: b.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: 'b' },
    });
    assert.equal(
      ((await b.desfecho) as { resultado: { texto: string } }).resultado.texto,
      'b',
    );
    assert.equal(filhos.length, 1);
    servico.encerrar();
  });

  it('filho que terminou com muita memória é encerrado; o próximo pedido sobe outro', async () => {
    const m = montar({ reusarAteMB: 300 });
    const a = m.servico.executar(TAREFA);
    const f = await pedidoRecebido(() => m.filhos[0]);
    m.memoria(500);
    f.responder({
      id: a.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: '' },
    });
    assert.equal((await a.desfecho).status, 'ok');
    assert.equal(f.morto, true);
    m.memoria(100);
    const b = m.servico.executar(TAREFA);
    const f2 = await pedidoRecebido(() => m.filhos[1]);
    f2.responder({
      id: b.id,
      tipo: 'resultado',
      resultado: { ok: true, texto: '' },
    });
    assert.equal((await b.desfecho).status, 'ok');
    assert.equal(f2.morto, false);
    m.servico.encerrar();
  });

  it('mensagens para a pessoa', () => {
    assert.equal(
      mensagemDoDesfecho({ status: 'cancelado' }),
      'Leitura cancelada.',
    );
    assert.equal(
      mensagemDoDesfecho({ status: 'memoria', limiteMB: 1024 }),
      'A leitura precisou de mais memória do que o PS Reader permite (1 GB) e foi interrompida.',
    );
    assert.equal(
      mensagemDoDesfecho({ status: 'tempo', limiteMs: 60000 }),
      'A leitura passou de 60 segundos e foi interrompida.',
    );
  });
});
