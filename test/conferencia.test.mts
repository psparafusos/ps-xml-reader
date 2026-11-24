import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { ID_QTD_RECEBIDA } from '../src/nfe/avisos.ts';
import {
  numeroSerieDaChave,
  painelCabeAoLado,
  resumoConferencia,
  type DadosConferencia,
  expansaoLateral,
} from '../src/nfe/conferencia.ts';
import { FERRAMENTAS } from '../src/nfe/ferramentas.ts';
import { freteContraditoNoTexto } from '../src/nfe/frete.ts';
import { criarIndicador } from '../src/indicador.ts';
import type { Item, Nota } from '../src/nfe/tipos.ts';

/** CNPJ inventado da loja, com dígitos verificadores válidos. */
const CNPJ_LOJA = '12345678000195';

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
      finNFe: '1',
      refNFe: [],
    },
    emitente: { CNPJ: '', xNome: '', xFant: '', IE: '', endereco },
    destinatario: {
      CNPJ: CNPJ_LOJA,
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
      transportadoraCPF: '',
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
  cnpjEmpresa: CNPJ_LOJA,
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

  it('sem CNPJ da loja gravado, a linha do destinatário não aparece', () => {
    const n = nota();
    n.destinatario.CNPJ = '11222333000181';
    const r = resumoConferencia(dados({ nota: n, cnpjEmpresa: null }));
    assert.ok(!r.verificacoes.some((v) => v.id === 'destinatario'));
    assert.equal(r.pontos, 0);
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

  it('nota emitida pela loja: linha de informação, não de outra empresa', () => {
    const n = nota();
    n.emitente.CNPJ = CNPJ_LOJA;
    n.destinatario.CNPJ = '11222333000181';
    const r = resumoConferencia(dados({ nota: n }));
    const v = ver(r, 'destinatario');
    assert.equal(v.titulo, 'Nota emitida pela loja');
    assert.equal(v.nivel, 'info');
    assert.equal(v.ok, true);
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

// Chave inventada: SE, 10/2026, CNPJ zerado, modelo 55, série 2, NF 1234.
const CHAVE_REF = `282610${'0'.repeat(14)}55002000001234100001234` + '5';

const LEMBRETE_DEVOLUCAO =
  'No seu sistema de gestão, confira se a entrada não altera o custo do produto: algumas telas de entrada gravam o preço de venda como custo.';

describe('nota de devolução no resumo', () => {
  it('número e série pela chave', () => {
    assert.equal(CHAVE_REF.length, 44);
    assert.deepEqual(numeroSerieDaChave(CHAVE_REF), {
      numero: '1234',
      serie: '2',
    });
    assert.equal(numeroSerieDaChave('123'), null);
  });

  it('finNFe 4: linha informativa "Nota de devolução" com a nota referenciada, primeira da lista', () => {
    const n = nota();
    n.ide.finNFe = '4';
    n.ide.refNFe = [CHAVE_REF];
    const r = resumoConferencia(dados({ nota: n }));
    const v = r.verificacoes[0];
    assert.equal(v.id, 'devolucao');
    assert.equal(v.nivel, 'info');
    assert.equal(v.ok, true);
    assert.equal(v.titulo, 'Nota de devolução: NF 1234, série 2');
    // O lembrete da entrada abre o detalhe; depois, a nota referenciada.
    assert.ok(v.detalhe.startsWith(LEMBRETE_DEVOLUCAO), v.detalhe);
    assert.match(v.detalhe, /finalidade 4/);
    assert.match(v.detalhe, /2826 1000/);
    // Só informa: não vira ponto para olhar.
    assert.equal(r.pontos, 0);
  });

  it('finNFe 4 sem refNFe: a linha fica, dizendo que falta a chave', () => {
    const n = nota();
    n.ide.finNFe = '4';
    const v = ver(resumoConferencia(dados({ nota: n })), 'devolucao');
    assert.equal(v.titulo, 'Nota de devolução');
    assert.ok(v.detalhe.startsWith(LEMBRETE_DEVOLUCAO), v.detalhe);
    assert.match(v.detalhe, /não traz a chave/);
  });

  it('nota normal (finNFe 1) ou sem finNFe: sem a linha', () => {
    assert.ok(
      !resumoConferencia(dados()).verificacoes.some(
        (v) => v.id === 'devolucao',
      ),
    );
    const antiga = nota() as Nota & { ide: { finNFe?: string } };
    delete antiga.ide.finNFe;
    assert.ok(
      !resumoConferencia(dados({ nota: antiga })).verificacoes.some(
        (v) => v.id === 'devolucao',
      ),
    );
  });
});

/** Troca o espaço sem quebra do Intl ("R$ 1,00") por espaço comum. */
const plano = (t: string) => t.replace(/\u00a0/g, ' ');

describe('frete no resumo', () => {
  /** Nota com a modalidade e o valor do frete dados. */
  function comFrete(modFrete: string, vFrete = '0.00'): Nota {
    const n = nota();
    n.transporte.modFrete = modFrete;
    n.totais.vFrete = vFrete;
    return n;
  }
  const frete = (n: Nota) =>
    ver(resumoConferencia(dados({ nota: n })), 'frete');

  it('modFrete 0 sem valor de frete: informação, Emitente CIF', () => {
    const r = resumoConferencia(dados({ nota: comFrete('0') }));
    const v = ver(r, 'frete');
    assert.equal(v.nivel, 'info');
    assert.equal(v.ok, true);
    assert.equal(v.titulo, 'Frete do fornecedor (CIF)');
    assert.equal(
      v.detalhe,
      'Se veio conhecimento em nome do fornecedor, ele não se lança.',
    );
    // Só informa: não vira ponto para olhar.
    assert.equal(r.pontos, 0);
    assert.equal(r.titulo, 'Tudo certo · 7 verificações');
  });

  it('modFrete 0 com vFrete vazio também é CIF sem valor', () => {
    assert.equal(frete(comFrete('0', '')).nivel, 'info');
  });

  it('modFrete 1 com transportadora: aviso com o nome, Destinatário FOB', () => {
    const n = comFrete('1');
    n.transporte.transportadoraNome = 'TRANSPORTES INVENTADOS LTDA';
    n.transporte.transportadoraCNPJ = '11222333000181';
    const r = resumoConferencia(dados({ nota: n }));
    const v = ver(r, 'frete');
    assert.equal(v.nivel, 'leve');
    assert.equal(v.ok, false);
    assert.equal(v.titulo, 'Frete da loja (FOB): lançar com o conhecimento');
    assert.equal(
      v.detalhe,
      'Transportadora: TRANSPORTES INVENTADOS LTDA. Lançar como Destinatário FOB com o valor do conhecimento. Se o conhecimento não veio, pedir a segunda via.',
    );
    assert.equal(r.pontos, 1);
  });

  it('modFrete 1 sem transportadora no XML: sem o nome', () => {
    const v = frete(comFrete('1'));
    assert.equal(v.titulo, 'Frete da loja (FOB): lançar com o conhecimento');
    assert.equal(
      v.detalhe,
      'Lançar como Destinatário FOB com o valor do conhecimento. Se o conhecimento não veio, pedir a segunda via.',
    );
  });

  it('modalidade sem regra, transportadora com CPF: o CPF vai para o detalhe', () => {
    const n = comFrete('2');
    n.transporte.transportadoraNome = 'MOTORISTA INVENTADO';
    n.transporte.transportadoraCPF = '12345678909';
    assert.match(
      frete(n).detalhe,
      /Transportadora na nota: MOTORISTA INVENTADO \(CPF 123\.456\.789-09\)\./,
    );
  });

  it('modFrete 0 com valor de frete: aviso para lançar como Destinatário FOB', () => {
    const n = comFrete('0', '35.5');
    n.totais.vNF = '87.50';
    const r = resumoConferencia(dados({ nota: n }));
    const v = ver(r, 'frete');
    assert.equal(v.nivel, 'leve');
    assert.equal(v.titulo, 'Frete na nota: lançar como FOB');
    assert.equal(
      plano(v.detalhe),
      'A nota diz frete do remetente, mas traz frete de R$ 35,50: lançar como Destinatário FOB, sem digitar valor de conhecimento (o frete vem da nota).',
    );
    assert.equal(r.pontos, 1);
  });

  it('outras modalidades: informação com o significado do código', () => {
    const titulos = ['2', '3', '4', '9', '7'].map((m) => {
      const v = frete(comFrete(m));
      assert.equal(v.nivel, 'info', m);
      return v.titulo;
    });
    assert.deepEqual(titulos, [
      'Frete por conta de terceiros (modalidade 2)',
      'Transporte próprio do remetente (modalidade 3)',
      'Transporte próprio do destinatário (modalidade 4)',
      'Sem frete (modalidade 9)',
      'Modalidade de frete 7, fora da tabela da NF-e',
    ]);
    assert.match(
      frete(comFrete('9')).detalhe,
      /^Modalidade do frete na nota: 9, sem frete\./,
    );
  });

  it('sem modFrete no XML: sem a linha', () => {
    assert.ok(
      !resumoConferencia(dados()).verificacoes.some((v) => v.id === 'frete'),
    );
  });

  it('informações complementares que contradizem o modFrete: no detalhe', () => {
    const n = comFrete('0');
    n.infAdic.infCpl = 'Pedido 123. Frete fob, entrega na loja.';
    assert.equal(frete(n).titulo, 'Frete do fornecedor (CIF)');
    assert.equal(
      frete(n).detalhe,
      'Se veio conhecimento em nome do fornecedor, ele não se lança. As informações complementares dizem FOB.',
    );
    const m = comFrete('1');
    m.infAdic.infCpl = 'TIPO DE FRETE: CIF';
    assert.equal(
      frete(m).titulo,
      'Frete da loja (FOB): lançar com o conhecimento',
    );
    assert.match(
      frete(m).detalhe,
      /segunda via\. As informações complementares dizem CIF\.$/,
    );
    const s = comFrete('9');
    s.infAdic.infCpl = 'FRETE FOB';
    assert.equal(frete(s).titulo, 'Sem frete (modalidade 9)');
    assert.match(
      frete(s).detalhe,
      /A nota não traz transportadora\. As informações complementares dizem FOB\.$/,
    );
    // Não muda o nível.
    assert.equal(frete(n).nivel, 'info');
  });

  it('CIF e FOB só como palavra inteira, e só quando contradizem', () => {
    assert.deepEqual(freteContraditoNoTexto('0', 'FRETE CIF'), []);
    assert.deepEqual(freteContraditoNoTexto('0', 'frete: fob'), ['FOB']);
    assert.deepEqual(freteContraditoNoTexto('1', '(CIF)'), ['CIF']);
    assert.deepEqual(freteContraditoNoTexto('0', 'FOBOS CIFRA SCIF FOB1'), []);
    // As duas palavras: o texto também diz a que combina, não contradiz.
    assert.deepEqual(freteContraditoNoTexto('0', 'CIF OU FOB'), []);
    assert.deepEqual(freteContraditoNoTexto('2', 'CIF OU FOB'), ['CIF', 'FOB']);
    assert.deepEqual(freteContraditoNoTexto('1', ''), []);
  });

  it('ordem: devolução, frete e depois as outras verificações', () => {
    const n = comFrete('1');
    n.ide.finNFe = '4';
    n.ide.refNFe = [CHAVE_REF];
    assert.deepEqual(
      resumoConferencia(dados({ nota: n })).verificacoes.map((v) => v.id),
      [
        'devolucao',
        'frete',
        'idade',
        'totais-itens',
        'duplicatas',
        'vencimentos',
        'destinatario',
        'conferida',
      ],
    );
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
    // A frase sai uma vez só, na linha da parcela vencida.
    assert.doesNotMatch(v.detalhe, /Falar com o fornecedor/);
    assert.equal(v.detalhe, 'Datas contadas a partir de hoje.');
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

describe('vencimentos das informações complementares no resumo', () => {
  /** Nota sem duplicatas, com o texto e o total dados. */
  function comTexto(infCpl: string, vNF = '5902.40', emissao = -3): Nota {
    const n = nota();
    n.ide.dhEmi = `${aDias(emissao)}T10:00:00-03:00`;
    n.totais.vNF = vNF;
    n.infAdic.infCpl = infCpl;
    return n;
  }
  const venc = (n: Nota) =>
    ver(resumoConferencia(dados({ nota: n })), 'vencimentos');

  it('três datas sem ano: parcelas iguais, em dia', () => {
    const r = resumoConferencia(
      dados({
        nota: comTexto('PEDIDO 4512. SEUS VCTOS SERAO: 04/12 11/12 18/12'),
      }),
    );
    const v = ver(r, 'vencimentos');
    assert.equal(v.nivel, 'info');
    assert.equal(v.ok, true);
    assert.equal(v.titulo, 'Parcelas em dia, das informações complementares');
    assert.equal(
      v.detalhe,
      'A nota não tem duplicatas: os vencimentos vieram das informações complementares. O valor de cada parcela é o total da nota dividido em partes iguais (a última leva a diferença dos centavos). Datas contadas a partir de hoje.',
    );
    assert.equal(v.citacao, 'VCTOS SERAO: 04/12 11/12 18/12');
    assert.deepEqual(
      v.linhas?.map((l) => [plano(l.texto), l.nivel]),
      [
        ['Parcela 1 de 3, 04/12/2026, R$ 1.967,47: vence em 31 dias.', 'ok'],
        ['Parcela 2 de 3, 11/12/2026, R$ 1.967,47: vence em 38 dias.', 'ok'],
        ['Parcela 3 de 3, 18/12/2026, R$ 1.967,46: vence em 45 dias.', 'ok'],
      ],
    );
    // A linha das duplicatas continua dizendo que não há duplicatas.
    assert.equal(ver(r, 'duplicatas').titulo, 'Sem duplicatas');
    assert.equal(r.pontos, 0);
  });

  it('uma data só, perto: aviso leve, "Parcela" sem número', () => {
    const v = venc(comTexto('Vencimento: 10/11', '52.00'));
    assert.equal(v.nivel, 'leve');
    assert.equal(v.titulo, 'Parcela vence em 7 dias');
    assert.match(
      v.detalhe,
      /^A nota não tem duplicatas: o vencimento veio das informações complementares\. O valor é o total da nota\./,
    );
    assert.equal(
      plano(v.linhas?.[0].texto ?? ''),
      'Parcela, 10/11/2026, R$ 52,00: vence em 7 dias.',
    );
  });

  it('parcelas vencidas: as mesmas marcas das duplicatas', () => {
    const v = venc(comTexto('VCTOS 01/10 01/11 01/12', '300.00', -40));
    assert.equal(v.nivel, 'forte');
    assert.equal(v.ok, false);
    assert.equal(v.titulo, '2 parcelas vencidas, a mais antiga há 33 dias');
    assert.deepEqual(
      v.linhas?.map((l) => l.nivel),
      ['forte', 'forte', 'ok'],
    );
    assert.match(
      v.linhas?.[0].texto ?? '',
      /Falar com o fornecedor para prorrogar\.$/,
    );
  });

  it('datas que não dá para ler: só a frase da nota, como informação', () => {
    const r = resumoConferencia(
      dados({ nota: comTexto('VENCIMENTOS: 30/60/90 DIAS. OBRIGADO') }),
    );
    const v = ver(r, 'vencimentos');
    assert.equal(v.nivel, 'info');
    assert.equal(
      v.titulo,
      'Vencimentos escritos nas informações complementares',
    );
    assert.match(v.detalhe, /não puderam ser lidas com segurança/);
    assert.equal(v.citacao, 'VENCIMENTOS: 30/60/90 DIAS');
    assert.equal(v.linhas, undefined);
    assert.equal(r.pontos, 0);
  });

  it('com duplicatas no XML, o texto não conta', () => {
    const n = comTexto('VCTOS 04/12 11/12', '52.00');
    n.duplicatas = [{ nDup: '001', dVenc: aDias(30), vDup: '52.00' }];
    const v = venc(n);
    assert.equal(v.titulo, 'Parcelas em dia');
    assert.equal(v.citacao, undefined);
    assert.equal(v.linhas?.length, 1);
  });

  it('sem trecho de vencimento: como antes, "Sem parcelas"', () => {
    const v = venc(comTexto('PEDIDO 04/12. DATA DE VALIDADE 04/12/2027'));
    assert.equal(v.titulo, 'Sem parcelas');
    assert.equal(v.nivel, 'ok');
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
