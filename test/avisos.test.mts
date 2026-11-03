import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  avisosDaNota,
  chaveDoArquivo,
  cnpjDaConfig,
  CNPJ_EMPRESA_PADRAO,
  dataHoraArquivo,
  diferencasTotais,
  divergenciasQtd,
  ehOutraEmpresa,
  ID_QTD_RECEBIDA,
  nomePodeSerConferencia,
  numeroDigitado,
  textoAviso,
} from '../src/nfe/avisos.ts';
import {
  idDaAnotacao,
  validarConfig,
  configPadrao,
} from '../src/nfe/config.ts';
import type { Anotacoes, Item, Nota } from '../src/nfe/tipos.ts';

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

function nota(extra: Partial<Nota> = {}): Nota {
  return {
    chave: '1'.repeat(44),
    ide: { nNF: '9001', serie: '1', dhEmi: '', natOp: '', tpNF: '1' },
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
    ...extra,
  };
}

const qtd = (pares: [string, string][]): Anotacoes =>
  new Map([[ID_QTD_RECEBIDA, new Map(pares)]]);

describe('numeroDigitado', () => {
  it('aceita vírgula, ponto decimal e milhar', () => {
    assert.equal(numeroDigitado('10'), 10);
    assert.equal(numeroDigitado(' 2,5 '), 2.5);
    assert.equal(numeroDigitado('1.000,5'), 1000.5);
    assert.equal(numeroDigitado('1.000'), 1000);
    assert.equal(numeroDigitado('2.5'), 2.5);
  });

  it('texto que não é número fica null', () => {
    assert.equal(numeroDigitado('ok'), null);
    assert.equal(numeroDigitado(''), null);
    assert.equal(numeroDigitado('1,2,3'), null);
  });
});

describe('divergenciasQtd', () => {
  it('a coluna Qtd recebida tem o id da anotação pronta', () => {
    assert.equal(ID_QTD_RECEBIDA, idDaAnotacao('Qtd recebida'));
  });

  it('acusa só os itens com número diferente da Qtd da nota', () => {
    const n = nota();
    assert.deepEqual(
      divergenciasQtd(
        n.itens,
        qtd([
          ['1', '100'],
          ['2', '2'],
        ]),
      ),
      [{ nItem: '2', nota: 2.5, recebida: 2 }],
    );
  });

  it('vírgula igual à nota não é divergência; texto solto é ignorado', () => {
    const n = nota();
    assert.deepEqual(
      divergenciasQtd(
        n.itens,
        qtd([
          ['1', 'conferido'],
          ['2', '2,5'],
        ]),
      ),
      [],
    );
  });

  it('sem a coluna, nada', () => {
    assert.deepEqual(divergenciasQtd(nota().itens, new Map()), []);
  });
});

describe('diferencasTotais', () => {
  it('totais que fecham, nada', () => {
    assert.deepEqual(diferencasTotais(nota()), []);
  });

  it('um centavo de diferença é tolerado', () => {
    const n = nota();
    n.totais.vProd = '52.01';
    assert.deepEqual(diferencasTotais(n), []);
  });

  it('itens contra o total dos produtos', () => {
    const n = nota();
    n.totais.vProd = '50.00';
    assert.deepEqual(diferencasTotais(n), [
      { qual: 'itens', soma: 5200, total: 5000 },
    ]);
  });

  it('duplicatas contra o valor da nota, só se houver duplicatas', () => {
    const n = nota({
      duplicatas: [
        { nDup: '001', dVenc: '', vDup: '30.00' },
        { nDup: '002', dVenc: '', vDup: '20.00' },
      ],
    });
    assert.deepEqual(diferencasTotais(n), [
      { qual: 'duplicatas', soma: 5000, total: 5200 },
    ]);
    const texto = textoAviso({ tipo: 'total', ...diferencasTotais(n)[0] });
    assert.match(texto.detalhe, /R\$\s50,00/);
    assert.match(texto.detalhe, /R\$\s52,00/);
    assert.match(texto.detalhe, /diferença de R\$\s2,00/);
  });
});

describe('outra empresa', () => {
  it('compara só os dígitos do CNPJ', () => {
    assert.equal(ehOutraEmpresa(nota(), '09.076.777/0001-04'), false);
  });

  it('outro CNPJ ou CPF é outra empresa', () => {
    const n = nota();
    n.destinatario.CNPJ = '11222333000181';
    assert.equal(ehOutraEmpresa(n, CNPJ_EMPRESA_PADRAO), true);
    n.destinatario.CNPJ = '';
    n.destinatario.CPF = '12345678909';
    assert.equal(ehOutraEmpresa(n, CNPJ_EMPRESA_PADRAO), true);
  });

  it('CNPJ da configuração: 14 dígitos, com ou sem máscara', () => {
    assert.equal(cnpjDaConfig('09.076.777/0001-04'), CNPJ_EMPRESA_PADRAO);
    assert.equal(cnpjDaConfig('123'), null);
    assert.equal(cnpjDaConfig(42), null);
  });
});

describe('nota já conferida', () => {
  it('filtra pelo número no nome antes de abrir', () => {
    assert.ok(nomePodeSerConferencia('CISER_NF9001_Conferencia.psxml', '9001'));
    assert.ok(
      nomePodeSerConferencia('ciser_nf9001-S2_conferencia.PSXML', '009001'),
    );
    assert.ok(
      !nomePodeSerConferencia('CISER_NF90012_Conferencia.psxml', '9001'),
    );
    assert.ok(!nomePodeSerConferencia('CISER_NF9001_Conferencia.pdf', '9001'));
    assert.ok(!nomePodeSerConferencia('qualquer.psxml', '9001'));
  });

  it('lê a chave do Id da infNFe', () => {
    const chave = '4'.repeat(44);
    assert.equal(
      chaveDoArquivo(
        `<psCopiaEditada><nfeProc><NFe><infNFe Id="NFe${chave}" versao="4.00">`,
      ),
      chave,
    );
    assert.equal(chaveDoArquivo('<psCopiaEditada/>'), null);
  });

  it('data de modificação no formato da tela', () => {
    const d = new Date(2026, 9, 28, 14, 5);
    assert.equal(dataHoraArquivo(d.toISOString()), '28/10/2026 14:05');
  });
});

describe('avisosDaNota', () => {
  it('nota sem nada a apontar', () => {
    assert.deepEqual(
      avisosDaNota({
        nota: nota(),
        anotacoes: new Map(),
        comQtdRecebida: true,
        cnpjEmpresa: CNPJ_EMPRESA_PADRAO,
        conferidos: [],
      }),
      [],
    );
  });

  it('sem a coluna Qtd recebida na configuração, a quantidade não conta', () => {
    const avisos = avisosDaNota({
      nota: nota(),
      anotacoes: qtd([['1', '99']]),
      comQtdRecebida: false,
      cnpjEmpresa: CNPJ_EMPRESA_PADRAO,
      conferidos: [],
    });
    assert.deepEqual(avisos, []);
  });

  it('junta os avisos na ordem da faixa', () => {
    const n = nota();
    n.destinatario.CNPJ = '11222333000181';
    n.totais.vProd = '10.00';
    const avisos = avisosDaNota({
      nota: n,
      anotacoes: qtd([['1', '99']]),
      comQtdRecebida: true,
      cnpjEmpresa: CNPJ_EMPRESA_PADRAO,
      conferidos: [
        {
          caminho: 'C:\\x\\A_NF9001_Conferencia.psxml',
          nome: 'A_NF9001_Conferencia.psxml',
          modificado: new Date(2026, 9, 28, 9, 0).toISOString(),
        },
      ],
    });
    assert.deepEqual(
      avisos.map((a) => a.tipo),
      ['outra-empresa', 'conferido', 'qtd', 'total'],
    );
    assert.equal(textoAviso(avisos[0]).titulo, 'Nota de outra empresa');
    assert.match(
      textoAviso(avisos[1]).detalhe,
      /A_NF9001_Conferencia\.psxml.*28\/10\/2026 09:00/,
    );
    assert.match(textoAviso(avisos[2]).detalhe, /Nota 100, recebida 99/);
  });
});

describe('perfil salvo com anotação de título igual a uma coluna nova', () => {
  it('continua válido (a coluna Pedido veio depois)', () => {
    const c = configPadrao();
    c.anotacoes.push({ id: idDaAnotacao('Pedido'), titulo: 'Pedido' });
    c.colunas.push({ id: idDaAnotacao('Pedido'), visivel: true });
    assert.doesNotThrow(() => validarConfig(JSON.parse(JSON.stringify(c))));
  });
});
