// Supervisor do serviço de leitura pesada, do lado do processo principal:
// uma fila de tarefas, um processo filho por vez, tempo máximo por tarefa,
// vigia de memória (o filho é morto acima do teto), cancelamento, e o filho
// encerrado e recriado quando trava, estoura ou cai. Se o filho não sobe,
// a tarefa roda no próprio principal (o caminho de antes), com aviso no log.
//
// Sem Electron: o processo filho, a memória medida e a reserva entram por
// parâmetro (src/servico/principal.ts liga no utilityProcess e no
// app.getAppMetrics; os testes usam um filho de mentira).

import {
  mensagemValida,
  type EtapaProgresso,
  type Pedido,
  type Tarefa,
} from './protocolo';

/** O que o supervisor usa de um processo filho (o utilityProcess tem isto). */
export interface ProcessoFilho {
  readonly pid: number | undefined;
  postMessage(mensagem: Pedido): void;
  kill(): boolean;
  on(evento: 'spawn', ouvinte: () => void): unknown;
  on(evento: 'message', ouvinte: (mensagem: unknown) => void): unknown;
  on(evento: 'exit', ouvinte: (codigo: number) => void): unknown;
}

export type Desfecho =
  | { status: 'ok'; resultado: unknown; noFilho: boolean }
  | { status: 'cancelado' }
  | { status: 'tempo'; limiteMs: number }
  | { status: 'memoria'; limiteMB: number }
  | { status: 'caiu' }
  | { status: 'falha'; mensagem: string };

export interface OpcoesServico {
  /** Cria o processo filho; pode lançar (arquivo do serviço ausente). */
  criarFilho(): ProcessoFilho;
  /** Memória do processo, em MB; null se não achou. */
  memoriaMB(pid: number): number | null;
  /** A tarefa no próprio principal (só quando o filho não sobe). */
  reserva(
    tarefa: Tarefa,
    aoEtapa: (etapa: EtapaProgresso) => void,
  ): Promise<unknown>;
  /** O resultado tem o formato da tarefa (protocolo.resultadoValido). */
  validar(tarefa: Tarefa, resultado: unknown): boolean;
  limiteMB(): number;
  tempoMaximoMs(tarefa: Tarefa): number;
  /** Mensagem para o log. */
  avisar(mensagem: string): void;
  /** Quanto esperar o filho subir. */
  esperaSubidaMs?: number;
  /** De quanto em quanto tempo medir a memória. */
  intervaloVigiaMs?: number;
  /** Filho parado há este tempo é encerrado (sobe de novo no próximo pedido). */
  ociosoMs?: number;
  /**
   * Filho que termina uma tarefa usando mais que isto (MB) é encerrado: a
   * memória de uma leitura grande não se soma à da seguinte.
   */
  reusarAteMB?: number;
}

export interface Execucao {
  id: number;
  desfecho: Promise<Desfecho>;
}

interface Trabalho {
  id: number;
  tarefa: Tarefa;
  aoEtapa: (etapa: EtapaProgresso) => void;
  resolver: (d: Desfecho) => void;
  /** Já terminou (resultado, erro, cancelamento): o resto é ignorado. */
  fim: boolean;
  relogio?: ReturnType<typeof setTimeout>;
  vigia?: ReturnType<typeof setInterval>;
}

export class ServicoPesado {
  private readonly o: Required<OpcoesServico>;
  private proximoId = 1;
  private fila: Trabalho[] = [];
  private atual: Trabalho | null = null;
  private filho: ProcessoFilho | null = null;
  private subida: Promise<boolean> | null = null;
  private ocioso?: ReturnType<typeof setTimeout>;
  /** O filho não subiu: daqui em diante, tudo na reserva. */
  private indisponivel = false;

  constructor(opcoes: OpcoesServico) {
    this.o = {
      esperaSubidaMs: 5000,
      intervaloVigiaMs: 100,
      ociosoMs: 60_000,
      reusarAteMB: 300,
      ...opcoes,
    };
  }

  /** O serviço desistiu do filho e está rodando no principal. */
  get emReserva(): boolean {
    return this.indisponivel;
  }

  /** pid do filho atual, se há um. */
  get pidFilho(): number | undefined {
    return this.filho?.pid;
  }

  /** Põe a tarefa na fila; o desfecho nunca rejeita. */
  executar(
    tarefa: Tarefa,
    aoEtapa: (etapa: EtapaProgresso) => void = () => {},
  ): Execucao {
    const id = this.proximoId++;
    let resolver: (d: Desfecho) => void = () => {};
    const desfecho = new Promise<Desfecho>((r) => {
      resolver = r;
    });
    this.fila.push({ id, tarefa, aoEtapa, resolver, fim: false });
    this.andar();
    return { id, desfecho };
  }

  /** Cancela a tarefa (na fila ou rodando). false se já tinha terminado. */
  cancelar(id: number): boolean {
    const naFila = this.fila.findIndex((t) => t.id === id);
    if (naFila !== -1) {
      const [t] = this.fila.splice(naFila, 1);
      t.fim = true;
      t.resolver({ status: 'cancelado' });
      return true;
    }
    const t = this.atual;
    if (!t || t.id !== id || t.fim) return false;
    // No filho, o único jeito de parar uma leitura no meio é encerrar o
    // processo; o próximo pedido sobe outro.
    if (!this.indisponivel) this.matarFilho();
    this.terminar(t, { status: 'cancelado' });
    return true;
  }

  /** Encerra o filho e cancela tudo (o app está fechando). */
  encerrar(): void {
    for (const t of this.fila) {
      t.fim = true;
      t.resolver({ status: 'cancelado' });
    }
    this.fila = [];
    if (this.atual) this.terminar(this.atual, { status: 'cancelado' });
    clearTimeout(this.ocioso);
    this.matarFilho();
  }

  private andar(): void {
    if (this.atual || this.fila.length === 0) return;
    clearTimeout(this.ocioso);
    const t = this.fila.shift() as Trabalho;
    this.atual = t;
    if (this.indisponivel) {
      this.naReserva(t);
      return;
    }
    void this.garantirFilho().then((ok) => {
      if (t.fim) return;
      if (ok) this.enviar(t);
      else {
        this.indisponivel = true;
        this.o.avisar(
          'Serviço de leitura pesada: o processo filho não subiu; as leituras seguem no processo principal, como antes.',
        );
        this.naReserva(t);
      }
    });
  }

  /** Sobe o filho se preciso; true quando ele está pronto. */
  private garantirFilho(): Promise<boolean> {
    if (this.filho && !this.subida) return Promise.resolve(true);
    if (this.subida) return this.subida;
    let filho: ProcessoFilho;
    try {
      filho = this.o.criarFilho();
    } catch (erro) {
      this.o.avisar(
        `Serviço de leitura pesada: não foi possível criar o processo (${erro instanceof Error ? erro.message : String(erro)}).`,
      );
      return Promise.resolve(false);
    }
    this.filho = filho;
    this.subida = new Promise<boolean>((resolve) => {
      let decidido = false;
      const decidir = (ok: boolean) => {
        if (decidido) return;
        decidido = true;
        clearTimeout(espera);
        this.subida = null;
        if (!ok && this.filho === filho) {
          this.filho = null;
          filho.kill();
        }
        resolve(ok);
      };
      const espera = setTimeout(() => decidir(false), this.o.esperaSubidaMs);
      filho.on('spawn', () => decidir(true));
      filho.on('exit', () => {
        decidir(false);
        this.aoSair(filho);
      });
      filho.on('message', (m) => this.aoMensagem(filho, m));
    });
    return this.subida;
  }

  private enviar(t: Trabalho): void {
    const filho = this.filho;
    if (!filho) {
      this.terminar(t, { status: 'caiu' });
      return;
    }
    const limiteMs = this.o.tempoMaximoMs(t.tarefa);
    t.relogio = setTimeout(() => {
      if (t.fim) return;
      this.matarFilho();
      this.terminar(t, { status: 'tempo', limiteMs });
    }, limiteMs);
    const limiteMB = this.o.limiteMB();
    t.vigia = setInterval(() => {
      const pid = filho.pid;
      if (t.fim || pid === undefined) return;
      const mb = this.o.memoriaMB(pid);
      if (mb !== null && mb > limiteMB) {
        this.matarFilho();
        this.terminar(t, { status: 'memoria', limiteMB });
      }
    }, this.o.intervaloVigiaMs);
    try {
      filho.postMessage({ id: t.id, tarefa: t.tarefa });
    } catch (erro) {
      this.matarFilho();
      this.terminar(t, {
        status: 'falha',
        mensagem: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  private aoMensagem(filho: ProcessoFilho, m: unknown): void {
    if (filho !== this.filho) return;
    const t = this.atual;
    if (!mensagemValida(m)) {
      this.o.avisar(
        'Serviço de leitura pesada: mensagem fora do formato, ignorada.',
      );
      return;
    }
    if (!t || t.fim || m.id !== t.id) return;
    if (m.tipo === 'progresso') {
      t.aoEtapa(m.etapa);
    } else if (m.tipo === 'falha') {
      this.terminar(t, { status: 'falha', mensagem: m.mensagem });
    } else if (this.o.validar(t.tarefa, m.resultado)) {
      this.terminar(t, { status: 'ok', resultado: m.resultado, noFilho: true });
    } else {
      // Resultado fora do formato: o filho saiu do normal; não fica.
      this.o.avisar(
        'Serviço de leitura pesada: resultado fora do formato, descartado.',
      );
      this.matarFilho();
      this.terminar(t, {
        status: 'falha',
        mensagem: 'O resultado da leitura veio fora do formato.',
      });
    }
  }

  private aoSair(filho: ProcessoFilho): void {
    if (filho !== this.filho) return;
    this.filho = null;
    const t = this.atual;
    if (t && !t.fim) this.terminar(t, { status: 'caiu' });
  }

  private naReserva(t: Trabalho): void {
    this.o
      .reserva(t.tarefa, (etapa) => {
        if (!t.fim) t.aoEtapa(etapa);
      })
      .then(
        (resultado) =>
          this.terminar(t, { status: 'ok', resultado, noFilho: false }),
        (erro: unknown) =>
          this.terminar(t, {
            status: 'falha',
            mensagem: erro instanceof Error ? erro.message : String(erro),
          }),
      );
  }

  private matarFilho(): void {
    const f = this.filho;
    this.filho = null;
    this.subida = null;
    f?.kill();
  }

  private terminar(t: Trabalho, d: Desfecho): void {
    if (t.fim) return;
    t.fim = true;
    clearTimeout(t.relogio);
    clearInterval(t.vigia);
    if (this.atual === t) this.atual = null;
    t.resolver(d);
    const pid = this.filho?.pid;
    if (pid !== undefined) {
      const mb = this.o.memoriaMB(pid);
      if (mb !== null && mb > this.o.reusarAteMB) this.matarFilho();
    }
    if (this.fila.length === 0 && this.filho) {
      clearTimeout(this.ocioso);
      this.ocioso = setTimeout(() => {
        if (!this.atual && this.fila.length === 0) this.matarFilho();
      }, this.o.ociosoMs);
      // Não segura o processo aberto só por isso.
      this.ocioso.unref?.();
    }
    this.andar();
  }
}

/** Mensagem para a pessoa quando a tarefa não terminou bem. */
export function mensagemDoDesfecho(
  d: Exclude<Desfecho, { status: 'ok' }>,
): string {
  switch (d.status) {
    case 'cancelado':
      return 'Leitura cancelada.';
    case 'tempo': {
      const s = Math.max(1, Math.round(d.limiteMs / 1000));
      return `A leitura passou de ${s} ${s === 1 ? 'segundo' : 'segundos'} e foi interrompida.`;
    }
    case 'memoria':
      return `A leitura precisou de mais memória do que o PS Reader permite (${d.limiteMB >= 1024 ? `${d.limiteMB / 1024} GB` : `${d.limiteMB} MB`}) e foi interrompida.`;
    case 'caiu':
      return 'A leitura parou no meio. Tente de novo.';
    case 'falha':
      return `Não foi possível ler o arquivo: ${d.mensagem}`;
  }
}
