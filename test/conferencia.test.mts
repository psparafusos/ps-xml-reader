import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { CNPJ_EMPRESA_PADRAO, ID_QTD_RECEBIDA } from '../src/nfe/avisos.ts';
import {
  painelCabeAoLado,
  resumoConferencia,
  type DadosConferencia,
  expansaoLateral,
} from '../src/nfe/conferencia.ts';
import { FERRAMENTAS } from '../src/nfe/ferramentas.ts';
import { criarIndicador } from '../src/indicador.ts';
import type { Item, Nota } from '../src/nfe/tipos.ts';

function item(nItem: string, qCom: string, vProd: string): Item {
  return {
    nItem,
    cProd: '',
    cEAN: '',
    xProd: '',
    NCM: '',
    CEST: '',
    CFOP: '',
    uCom: 'PC',
    qCom,
    vUnCom: '',
    vProd,
    vDesc: '',
    infAdProd: '',
    vIPI: '',
    vICMS: '',
    cstIcms: '',
    xPed: '',
    vIBS: '',
    vCBS: '',
  };
}

const endereco = {
  xLgr: '',
  nro: '',
  xBairro: '',
  xMun: '',
  UF: '',
  CEP: '',
  fone: '',
};

/** "Hoje" dos testes: 3 de novembro de 2026, à tarde. */
const HOJE = new Date(2026, 10, 3, 15, 30);

/** Data do XML (aaaa-mm-dd) a `n` dias de HOJE. */
function aDias(n: number): string {
  const d = new Date(2026, 10, 3 + n);
  const dois = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function nota(): Nota {
  return {
    chave: '1'.repeat(44),
    ide: {
      nNF: '9001',
      serie: '1',
      dhEmi: `${aDias(-3)}T10:00:00-03:00`,
      natOp: '',
      tpNF: '1',
    },
    emitente: { CNPJ: '', xNome: '', xFant: '', IE: '', endereco },
    destinatario: {
      CNPJ: CNPJ_EMPRESA_PADRAO,
      CPF: '',
      xNome: 'PS',
      IE: '',
      endereco,
    },
    itens: [item('1', '100.0000', '42.00'), item('2', '2.5000', '10.00')],
    totais: {
      vProd: '52.00',
      vDesc: '',
      vFrete: '',
      vSeg: '',
      vOutro: '',
      vIPI: '',
      vICMS: '',
      vST: '',
      vNF: '52.00',
    },
    transporte: {
      modFrete: '',
      transportadoraNome: '',
      transportadoraCNPJ: '',
      volumes: [],
    },
    duplicatas: [],
    infAdic: { infCpl: '', obsCont: [] },
    protocolo: { chNFe: '', nProt: '', dhRecbto: '', cStat: '', xMotivo: '' },
  };
}

const dados = (extra: Partial<DadosConferencia> = {}): DadosConferencia => ({
  nota: nota(),
  anotacoes: new Map(),
  comQtdRecebida: true,
  cnpjEmpresa: CNPJ_EMPRESA_PADRAO,
  conferidos: [],
  temPastaDestino: true,
  hoje: HOJE,
  diasAvisoVencimento: 15,
  diasNotaAntiga: 30,
  ...extra,
});

/** Busca uma verificação pelo id. */
const ver = (r: ReturnType<typeof resumoConferencia>, id: string) => {
  const v = r.verificacoes.find((x) => x.id === id);
  assert.ok(v, id);
  return v;
};

describe('resumoConferencia', () => {
  it('nota sem nada: tudo certo nas seis verificações', () => {
    const r = resumoConferencia(dados());
    assert.deepEqual(
      r.verificacoes.map((v) => [v.id, v.nivel]),
      [
        ['idade', 'info'],
        ['totais-itens', 'ok'],
        ['duplicatas', 'ok'],
        ['vencimentos', 'ok'],
        ['destinatario', 'ok'],
        ['conferida', 'ok'],
      ],
    );
    assert.equal(r.pontos, 0);
    assert.equal(r.titulo, 'Tudo certo · 6 verificações');
    assert.deepEqual(r.pendencias, []);
    assert.equal(ver(r, 'duplicatas').detalhe, 'A nota não tem duplicatas.');
    assert.equal(ver(r, 'vencimentos').detalhe, 'A nota não tem duplicatas.');
    assert.match(ver(r, 'totais-itens').detalhe, /R\$\s52,00/);
    assert.equal(ver(r, 'idade').titulo, 'Emitida há 3 dias (31/10/2026)');
    // Os títulos dizem o resultado.
    assert.equal(ver(r, 'totais-itens').titulo, 'Totais conferem');
    assert.equal(ver(r, 'duplicatas').titulo, 'Sem duplicatas');
    assert.equal(ver(r, 'vencimentos').titulo, 'Sem parcelas');
    assert.equal(ver(r, 'destinatario').titulo, 'Destinatário: PS');
    assert.equal(ver(r, 'conferida').titulo, 'Primeira conferência desta nota');
  });

  it('sem pasta de destino, a "já conferida" diz que não há onde procurar', () => {
    const r = resumoConferencia(dados({ temPastaDestino: false }));
    assert.match(ver(r, 'conferida').detalhe, /Sem pasta de destino/);
    assert.equal(ver(r, 'conferida').ok, true);
    assert.equal(
      ver(r, 'conferida').titulo,
      'Sem pasta de destino para procurar conferências',
    );
  });

  it('conta verificações com ! e pendências de quantidade', () => {
    const n = nota();
    n.totais.vProd = '50.00';
    n.destinatario.CNPJ = '11222333000181';
    const conferido = {
      caminho: 'C:\\x\\A_NF9001_Conferencia.psxml',
      nome: 'A_NF9001_Conferencia.psxml',
      modificado: new Date(2026, 10, 1, 8, 0).toISOString(),
    };
    const r = resumoConferencia(
      dados({
        nota: n,
        conferidos: [conferido],
        anotacoes: new Map([
          [
            ID_QTD_RECEBIDA,
            new Map([
              ['1', '90'],
              ['2', '2,5'],
            ]),
          ],
        ]),
      }),
    );
    assert.deepEqual(
      r.verificacoes.map((v) => v.ok),
      [true, false, true, true, false, false],
    );
    assert.deepEqual(ver(r, 'conferida').conferidos, [conferido]);
    assert.equal(ver(r, 'conferida').titulo, 'Já conferida em 01/11');
    assert.match(
      ver(r, 'totais-itens').titulo,
      /^Total dos itens difere em R\$\s2,00$/,
    );
    assert.match(
      ver(r, 'destinatario').titulo,
      /^Destinatário é outra empresa/,
    );
    assert.deepEqual(
      r.pendencias.map((p) => p.nItem),
      ['1'],
    );
    assert.equal(r.pendencias[0].detalhe, 'Nota 100, recebida 90.');
    assert.equal(r.pontos, 4);
    assert.equal(r.titulo, '4 pontos para olhar');
  });

  it('um ponto só, no singular', () => {
    const n = nota();
    n.totais.vProd = '10.00';
    assert.equal(
      resumoConferencia(dados({ nota: n })).titulo,
      '1 ponto para olhar',
    );
  });

  it('sem a coluna Qtd recebida, não há pendências', () => {
    const r = resumoConferencia(
      dados({
        comQtdRecebida: false,
        anotacoes: new Map([[ID_QTD_RECEBIDA, new Map([['1', '1']])]]),
      }),
    );
    assert.deepEqual(r.pendencias, []);
  });
});

describe('vencimentos e idade da nota no resumo', () => {
  it('emitida há 75 dias, três parcelas: vencida, em 10 e em 40 dias', () => {
    const n = nota();
    n.ide.dhEmi = `${aDias(-75)}T09:00:00-03:00`;
    n.totais.vNF = '300.00';
    n.duplicatas = [
      { nDup: '001', dVenc: aDias(-20), vDup: '100.00' },
      { nDup: '002', dVenc: aDias(10), vDup: '100.00' },
      { nDup: '003', dVenc: aDias(40), vDup: '100.00' },
    ];
    const r = resumoConferencia(dados({ nota: n }));
    const idade = ver(r, 'idade');
    assert.equal(idade.nivel, 'leve');
    assert.equal(idade.ok, false);
    assert.equal(
      idade.titulo,
      'Emitida há 75 dias: confira vencimentos e pedido',
    );
    assert.match(idade.detalhe, /20\/08\/2026/);
    const v = ver(r, 'vencimentos');
    assert.equal(v.nivel, 'forte');
    assert.equal(v.titulo, 'Parcela 001 vencida há 20 dias');
    assert.match(v.detalhe, /Falar com o fornecedor para prorrogar/);
    assert.deepEqual(
      v.linhas?.map((l) => l.nivel),
      ['forte', 'leve', 'ok'],
    );
    assert.match(
      v.linhas?.[0].texto ?? '',
      /^Parcela 001, 14\/10\/2026, R\$\s100,00: venceu há 20 dias\. Falar com o fornecedor para prorrogar\.$/,
    );
    assert.match(v.linhas?.[1].texto ?? '', /vence em 10 dias\.$/);
    assert.match(v.linhas?.[2].texto ?? '', /vence em 40 dias\.$/);
    // Idade (leve) e vencimentos (forte) contam; o resto está certo.
    assert.equal(r.pontos, 2);
    assert.equal(r.titulo, '2 pontos para olhar');
  });

  it('emitida hoje, sem parcela vencida', () => {
    const n = nota();
    n.ide.dhEmi = `${aDias(0)}T08:00:00-03:00`;
    n.duplicatas = [
      { nDup: '001', dVenc: aDias(30), vDup: '26.00' },
      { nDup: '002', dVenc: aDias(60), vDup: '26.00' },
    ];
    const r = resumoConferencia(dados({ nota: n }));
    assert.equal(ver(r, 'idade').titulo, 'Emitida hoje (03/11/2026)');
    assert.equal(ver(r, 'idade').nivel, 'info');
    assert.equal(ver(r, 'vencimentos').nivel, 'ok');
    assert.equal(ver(r, 'vencimentos').titulo, 'Parcelas em dia');
    assert.equal(r.pontos, 0);
    assert.equal(r.titulo, 'Tudo certo · 6 verificações');
  });

  it('parcela em até 15 dias é aviso leve; os dias vêm da configuração', () => {
    const n = nota();
    n.duplicatas = [{ nDup: '1', dVenc: aDias(12), vDup: '52.00' }];
    const r15 = resumoConferencia(dados({ nota: n }));
    assert.equal(ver(r15, 'vencimentos').nivel, 'leve');
    assert.equal(ver(r15, 'vencimentos').titulo, 'Parcela 1 vence em 12 dias');
    const r10 = resumoConferencia(dados({ nota: n, diasAvisoVencimento: 10 }));
    assert.equal(ver(r10, 'vencimentos').nivel, 'ok');
  });

  it('idade: 30 dias ainda é informativa, 31 é aviso; ajustável', () => {
    const n = nota();
    n.ide.dhEmi = aDias(-30);
    assert.equal(
      ver(resumoConferencia(dados({ nota: n })), 'idade').nivel,
      'info',
    );
    n.ide.dhEmi = aDias(-31);
    assert.equal(
      ver(resumoConferencia(dados({ nota: n })), 'idade').nivel,
      'leve',
    );
    assert.equal(
      ver(resumoConferencia(dados({ nota: n, diasNotaAntiga: 60 })), 'idade')
        .nivel,
      'info',
    );
  });
});

describe('painelCabeAoLado', () => {
  // Conteúdo da nota com 1200 px, painel de 320 px.
  it('1920 a 100%: cabe ao lado', () => {
    assert.equal(painelCabeAoLado(1920, 1200, 320), true);
  });
  it('1920 a 125% (1536), 1366 a 100% e a 125% (1093): por cima', () => {
    assert.equal(painelCabeAoLado(1536, 1200, 320), false);
    assert.equal(painelCabeAoLado(1366, 1200, 320), false);
    assert.equal(painelCabeAoLado(1093, 1093, 320), false);
  });
});

describe('ferramentas', () => {
  it('nenhuma ainda (a seção fica escondida)', () => {
    assert.equal(FERRAMENTAS.length, 0);
  });
});

describe('criarIndicador', () => {
  it('ação rápida não mostra o indicador', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const vistos: boolean[] = [];
      const ind = criarIndicador((v) => vistos.push(v), 500);
      let terminar!: () => void;
      const p = ind.rodar(() => new Promise<void>((r) => (terminar = r)));
      mock.timers.tick(499);
      terminar();
      await p;
      mock.timers.tick(10);
      assert.deepEqual(vistos, []);
    } finally {
      mock.timers.reset();
    }
  });

  it('ação lenta mostra depois de 500 ms e esconde ao terminar', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const vistos: boolean[] = [];
      const ind = criarIndicador((v) => vistos.push(v), 500);
      let terminar!: () => void;
      const p = ind.rodar(() => new Promise<void>((r) => (terminar = r)));
      mock.timers.tick(500);
      assert.deepEqual(vistos, [true]);
      terminar();
      await p;
      assert.deepEqual(vistos, [true, false]);
    } finally {
      mock.timers.reset();
    }
  });

  it('duas ações: esconde só quando a última termina', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const vistos: boolean[] = [];
      const ind = criarIndicador((v) => vistos.push(v), 500);
      let fimA!: () => void;
      let fimB!: () => void;
      const a = ind.rodar(() => new Promise<void>((r) => (fimA = r)));
      const b = ind.rodar(() => new Promise<void>((r) => (fimB = r)));
      mock.timers.tick(600);
      fimA();
      await a;
      assert.deepEqual(vistos, [true]);
      fimB();
      await b;
      assert.deepEqual(vistos, [true, false]);
    } finally {
      mock.timers.reset();
    }
  });

  it('erro na ação também esconde', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const vistos: boolean[] = [];
      const ind = criarIndicador((v) => vistos.push(v), 500);
      let falhar!: (e: Error) => void;
      const p = ind.rodar(() => new Promise<void>((_, rej) => (falhar = rej)));
      mock.timers.tick(500);
      falhar(new Error('x'));
      await assert.rejects(p);
      assert.deepEqual(vistos, [true, false]);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('expansaoLateral', () => {
  it('tabela que cabe não cresce', () => {
    assert.deepEqual(expansaoLateral(0, 300, 300), { esquerda: 0, direita: 0 });
  });
  it('divide a falta entre os dois lados', () => {
    assert.deepEqual(expansaoLateral(200, 300, 300), {
      esquerda: 100,
      direita: 100,
    });
  });
  it('o lado com pouca sobra (painel aberto) passa o resto para o outro', () => {
    assert.deepEqual(expansaoLateral(200, 20, 300), {
      esquerda: 20,
      direita: 180,
    });
  });
  it('sem sobra suficiente: cresce o que dá e a tabela rola o resto', () => {
    assert.deepEqual(expansaoLateral(900, 100, 150), {
      esquerda: 100,
      direita: 150,
    });
  });
});
