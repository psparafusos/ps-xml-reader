import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResumoConferencia } from '../src/nfe/conferencia.ts';
import {
  estaNaLista,
  LIMITE_RECENTES,
  lerRecentes,
  principalAlerta,
  registrarRecente,
  removerRecente,
  situacaoNota,
  textoAcesso,
  type NotaRecente,
} from '../src/nfe/recentes.ts';

const nota = (n: number, p: Partial<NotaRecente> = {}): NotaRecente => ({
  caminho: `C:\\Notas\\nota-${n}.xml`,
  chave: String(n).padStart(44, '3'),
  fornecedor: `FORNECEDOR INVENTADO ${n}`,
  numero: String(1000 + n),
  itens: n,
  acesso: new Date(2026, 10, 4, 10, n).toISOString(),
  situacao: 'em-conferencia',
  alerta: '',
  ...p,
});

const resumo = (p: Partial<ResumoConferencia>): ResumoConferencia => ({
  verificacoes: [],
  pendencias: [],
  pontos: 0,
  titulo: '',
  ...p,
});

describe('notas recentes', () => {
  it('a mais recente vai para o topo, sem repetir a mesma nota', () => {
    let lista: NotaRecente[] = [];
    lista = registrarRecente(lista, nota(1));
    lista = registrarRecente(lista, nota(2));
    lista = registrarRecente(lista, nota(1, { itens: 99 }));
    assert.deepEqual(
      lista.map((r) => [r.numero, r.itens]),
      [
        ['1001', 99],
        ['1002', 2],
      ],
    );
  });

  it('salvar o .psxml atualiza a entrada do XML (mesma chave)', () => {
    let lista = registrarRecente([], nota(1));
    lista = registrarRecente(
      lista,
      nota(1, {
        caminho: 'D:\\Conferidas\\FORNECEDOR_NF1001_Conferencia.psxml',
        situacao: 'conferida',
      }),
    );
    assert.equal(lista.length, 1);
    assert.equal(lista[0].situacao, 'conferida');
    assert.match(lista[0].caminho, /\.psxml$/);
  });

  it('sem chave, a mesma nota é o mesmo caminho (maiúsculas e barras não importam)', () => {
    const lista = registrarRecente(
      [nota(1, { chave: '' })],
      nota(1, { chave: '', caminho: 'c:/notas/NOTA-1.xml' }),
    );
    assert.equal(lista.length, 1);
    assert.equal(estaNaLista(lista, 'C:\\NOTAS\\nota-1.xml'), true);
  });

  it(`no máximo ${LIMITE_RECENTES}`, () => {
    let lista: NotaRecente[] = [];
    for (let n = 1; n <= 10; n++) lista = registrarRecente(lista, nota(n));
    assert.equal(lista.length, LIMITE_RECENTES);
    assert.equal(lista[0].numero, '1010');
    assert.equal(lista.at(-1)?.numero, '1003');
  });

  it('remover tira só aquela entrada', () => {
    const lista = removerRecente([nota(1), nota(2)], 'c:\\notas\\nota-1.xml');
    assert.deepEqual(
      lista.map((r) => r.numero),
      ['1002'],
    );
  });

  it('config.json estranho: entrada inválida fica de fora', () => {
    assert.deepEqual(lerRecentes('x'), []);
    const lidas = lerRecentes([
      nota(1),
      { ...nota(2), situacao: 'sumida' },
      { ...nota(3), acesso: 'ontem' },
      { ...nota(4), caminho: '' },
      { ...nota(5), alerta: undefined },
    ]);
    assert.deepEqual(
      lidas.map((r) => [r.numero, r.alerta]),
      [
        ['1001', ''],
        ['1005', ''],
      ],
    );
  });
});

describe('situação da nota', () => {
  it('XML sem .psxml: em conferência; .psxml aberto ou salvo: conferida', () => {
    assert.deepEqual(situacaoNota(false, resumo({})), {
      situacao: 'em-conferencia',
      alerta: '',
    });
    assert.deepEqual(situacaoNota(true, resumo({})), {
      situacao: 'conferida',
      alerta: '',
    });
  });

  it('pontos para olhar: alerta com o principal', () => {
    const r = resumo({
      pontos: 2,
      verificacoes: [
        {
          id: 'idade',
          ok: false,
          nivel: 'leve',
          titulo: '',
          detalhe: '',
        },
        {
          id: 'vencimentos',
          ok: false,
          nivel: 'forte',
          titulo: '',
          detalhe: '',
        },
      ],
    });
    assert.deepEqual(situacaoNota(true, r), {
      situacao: 'alerta',
      alerta: 'parcela vencida',
    });
  });

  it('principal pela gravidade: quantidade antes de nota antiga', () => {
    const r = resumo({
      pontos: 2,
      verificacoes: [
        { id: 'idade', ok: false, nivel: 'leve', titulo: '', detalhe: '' },
      ],
      pendencias: [{ nItem: '1', titulo: '', detalhe: '' }],
    });
    assert.equal(principalAlerta(r), 'quantidade diferente');
  });
});

describe('último acesso', () => {
  const agora = new Date(2026, 10, 4, 15, 0);
  it('hoje, ontem e data', () => {
    assert.equal(
      textoAcesso(new Date(2026, 10, 4, 10, 42).toISOString(), agora),
      'hoje 10:42',
    );
    assert.equal(
      textoAcesso(new Date(2026, 10, 3, 16, 5).toISOString(), agora),
      'ontem 16:05',
    );
    assert.equal(
      textoAcesso(new Date(2026, 9, 28, 9, 0).toISOString(), agora),
      '28/10 09:00',
    );
    assert.equal(
      textoAcesso(new Date(2025, 11, 30, 8, 0).toISOString(), agora),
      '30/12/2025 08:00',
    );
  });
});
