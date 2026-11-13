// Montagem do modo Formato original (src/formatoOriginal/montar.ts) com XML
// inventados: NF-e e um pedido que não é nota, lidos pelo leitor próprio.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatarValor,
  LIMITE_ELEMENTOS_FORMATO,
  montarFormato,
  type Bloco,
} from '../src/formatoOriginal/montar.ts';
import { lerXml } from '../src/xml/leitor.ts';

const NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe35000000000000000000550010000004211000004217" versao="4.00">
    <ide><cUF>35</cUF><natOp>Venda inventada</natOp><mod>55</mod><nNF>421</nNF><dhEmi>2026-11-10T09:15:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb><finNFe>4</finNFe></ide>
    <emit><CNPJ>00000000000191</CNPJ><xNome>Inventada Ltda</xNome><enderEmit><xLgr>Rua A</xLgr><CEP>01000000</CEP><fone>1100000000</fone></enderEmit><CRT>3</CRT></emit>
    <det nItem="1"><prod><cProd>A1</cProd><xProd>PARAFUSO INVENTADO</xProd><NCM>73181500</NCM><CFOP>6102</CFOP><uCom>CT</uCom><qCom>20.0000</qCom><vUnCom>18.5000</vUnCom><vProd>370.00</vProd><xPed>PED-1</xPed></prod>
      <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><pICMS>7.00</pICMS><vICMS>25.90</vICMS></ICMS00></ICMS><IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vIPI>18.50</vIPI></IPITrib></IPI></imposto></det>
    <det nItem="2"><prod><cProd>A2</cProd><xProd>PORCA INVENTADA</xProd><NCM>73181600</NCM><CFOP>6102</CFOP><uCom>CT</uCom><qCom>10.0000</qCom><vUnCom>6.2000</vUnCom><vProd>62.00</vProd></prod>
      <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS></imposto></det>
    <total><ICMSTot><vProd>432.00</vProd><vNF>450.50</vNF></ICMSTot></total>
    <transp><modFrete>0</modFrete></transp>
    <cobr><dup><nDup>001</nDup><dVenc>2026-12-10</dVenc><vDup>225.25</vDup></dup><dup><nDup>002</nDup><dVenc>2027-01-09</dVenc><vDup>225.25</vDup></dup></cobr>
    <infAdic><infCpl>DADOS INVENTADOS</infCpl></infAdic>
  </infNFe></NFe>
  <protNFe versao="4.00"><infProt><nProt>135000000000421</nProt><cStat>100</cStat></infProt></protNFe>
</nfeProc>`;

const PEDIDO = `<?xml version="1.0"?>
<pedidoCompra numero="PED-7781">
  <cabecalho><emissao>2026-11-05</emissao><cnpjComprador>00000000000272</cnpjComprador></cabecalho>
  <itens>
    <item linha="1"><codigo>A1</codigo><quantidade>20</quantidade><precoUnitario>18.5</precoUnitario></item>
    <item linha="2"><codigo>A2</codigo><quantidade>10</quantidade><precoUnitario>6.20</precoUnitario></item>
  </itens>
</pedidoCompra>`;

function montar(xml: string) {
  const r = montarFormato(lerXml(xml));
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') throw new Error('não montou');
  return r;
}

/** As seções de primeiro nível pelo título (ou pela tag). */
const titulos = (blocos: Bloco[]) =>
  blocos.map((b) =>
    b.tipo === 'campos' ? '(campos)' : (b.titulo ?? b.tags.join('/')),
  );

function acharSecao(blocos: Bloco[], tag: string): Bloco | undefined {
  for (const b of blocos) {
    if (b.tipo === 'secao' || b.tipo === 'tabela') {
      if (b.tags.includes(tag)) return b;
      if (b.tipo === 'secao') {
        const dentro = acharSecao(b.blocos, tag);
        if (dentro) return dentro;
      }
    }
  }
  return undefined;
}

describe('Formato original: formatação para leitura', () => {
  it('datas em dd/mm/aaaa, com a hora quando houver', () => {
    assert.equal(
      formatarValor('dhEmi', '2026-11-10T09:15:00-03:00').valor,
      '10/11/2026 09:15',
    );
    assert.equal(formatarValor('dVenc', '2026-12-10').valor, '10/12/2026');
    assert.equal(formatarValor('emissao', '2026-11-05').valor, '05/11/2026');
  });

  it('números no formato brasileiro sem zeros sobrando; valores com 2 casas', () => {
    assert.equal(formatarValor('qCom', '20.0000').valor, '20');
    assert.equal(formatarValor('qCom', '2.5000').valor, '2,5');
    assert.equal(formatarValor('vUnCom', '18.5000').valor, '18,50');
    assert.equal(formatarValor('vProd', '1234.56').valor, '1.234,56');
    assert.equal(formatarValor('vUnCom', '0.1234').valor, '0,1234');
    assert.equal(formatarValor('pICMS', '7.00', [], true).valor, '7%');
    assert.equal(formatarValor('precoUnitario', '18.5').valor, '18,50');
    // Versões não são números.
    assert.equal(formatarValor('versao', '4.00', [], true).valor, '4.00');
    assert.equal(formatarValor('versao', '2.1').valor, '2.1');
    // Inteiros e códigos ficam como estão.
    assert.equal(formatarValor('NCM', '73181500', [], true).valor, '73181500');
    assert.equal(formatarValor('nNF', '421', [], true).valor, '421');
  });

  it('CNPJ, CPF, CEP e telefone', () => {
    assert.equal(
      formatarValor('CNPJ', '00000000000191').valor,
      '00.000.000/0001-91',
    );
    assert.equal(
      formatarValor('cnpjComprador', '00000000000272').valor,
      '00.000.000/0002-72',
    );
    assert.equal(formatarValor('CPF', '00000000191').valor, '000.000.001-91');
    assert.equal(formatarValor('CEP', '01000000').valor, '01000-000');
    assert.equal(formatarValor('fone', '1100000000').valor, '(11) 0000-0000');
  });

  it('significado dos códigos comuns da NF-e, só na NF-e', () => {
    assert.equal(formatarValor('CRT', '3', [], true).sentido, 'Regime normal');
    assert.equal(
      formatarValor('modFrete', '0', [], true).sentido,
      'Por conta do emitente (CIF)',
    );
    assert.equal(
      formatarValor('finNFe', '4', [], true).sentido,
      'Devolução de mercadoria',
    );
    assert.equal(formatarValor('tpNF', '1', [], true).sentido, 'Saída');
    assert.equal(formatarValor('tpNF', '7', [], true).sentido, null);
    assert.equal(formatarValor('tpNF', '1').sentido, null);
    // CST pelo imposto de cima.
    assert.equal(
      formatarValor('CST', '00', ['ICMS00', 'ICMS'], true).sentido,
      'Tributada integralmente',
    );
    assert.equal(
      formatarValor('CST', '50', ['IPITrib', 'IPI'], true).sentido,
      'Saída tributada',
    );
    assert.equal(
      formatarValor('CST', '01', ['PISAliq', 'PIS'], true).sentido,
      'Tributável, alíquota básica',
    );
    // Chave estranha no objeto não vira significado.
    assert.equal(formatarValor('tpNF', 'toString', [], true).sentido, null);
  });
});

describe('Formato original: NF-e', () => {
  it('todos os blocos, com rótulos em português e as tags', () => {
    const r = montar(NFE);
    assert.equal(r.nfe, true);
    assert.equal(r.raiz, 'nfeProc');
    assert.equal(r.versao, '4.00');
    assert.deepEqual(titulos(r.blocos), [
      '(campos)',
      'Identificação',
      'Emitente',
      'Itens',
      'Totais › Totais do ICMS',
      'Transporte',
      'Cobrança',
      'Informações adicionais',
      // protNFe tem o atributo versao: fica a seção dele, com infProt dentro.
      'Protocolo',
    ]);
    const ide = acharSecao(r.blocos, 'ide');
    assert.ok(ide?.tipo === 'secao');
    const campos = ide.blocos[0];
    assert.ok(campos.tipo === 'campos');
    const dhEmi = campos.campos.find((c) => c.tag === 'dhEmi');
    assert.equal(dhEmi?.rotulo, 'Data e hora de emissão');
    assert.equal(dhEmi?.valor, '10/11/2026 09:15');
    assert.equal(dhEmi?.exato, '2026-11-10T09:15:00-03:00');
    assert.equal(campos.campos.find((c) => c.tag === 'tpNF')?.sentido, 'Saída');
  });

  it('itens: tabela com as colunas principais e o resto no detalhe, impostos lado a lado', () => {
    const r = montar(NFE);
    const itens = acharSecao(r.blocos, 'det');
    assert.ok(itens?.tipo === 'tabela');
    assert.equal(itens.quantidade, '2 itens');
    assert.deepEqual(
      itens.colunas.map((c) => (c.atributo ? `@${c.tag}` : c.tag)),
      [
        '@nItem',
        'cProd',
        'xProd',
        'NCM',
        'CFOP',
        'uCom',
        'qCom',
        'vUnCom',
        'vProd',
      ],
    );
    assert.deepEqual(itens.linhas[0].celulas, [
      '1',
      'A1',
      'PARAFUSO INVENTADO',
      '73181500',
      '6102',
      'CT',
      '20',
      '18,50',
      '370,00',
    ]);
    // NCM e CFOP não viram "números".
    assert.equal(itens.colunas.find((c) => c.tag === 'NCM')?.numerica, false);
    assert.equal(itens.colunas.find((c) => c.tag === 'qCom')?.numerica, true);
    const [resto, imposto] = itens.linhas[0].detalhe;
    assert.ok(resto.tipo === 'campos');
    assert.deepEqual(
      resto.campos.map((c) => c.tag),
      ['xPed'],
    );
    assert.ok(imposto.tipo === 'secao');
    assert.equal(imposto.lado, true);
    assert.deepEqual(titulos(imposto.blocos), ['ICMS › ICMS (CST 00)', 'IPI']);
    const icms = imposto.blocos[0];
    assert.ok(icms.tipo === 'secao' && icms.blocos[0].tipo === 'campos');
    const cst = icms.blocos[0].campos.find((c) => c.tag === 'CST');
    assert.equal(cst?.sentido, 'Tributada integralmente');
  });

  it('um item só também vira tabela', () => {
    const umItem = NFE.replace(/<det nItem="2">[\s\S]*?<\/det>/, '');
    const itens = acharSecao(montar(umItem).blocos, 'det');
    assert.ok(itens?.tipo === 'tabela');
    assert.equal(itens.quantidade, '1 item');
  });

  it('duplicatas repetidas viram tabela dentro da Cobrança', () => {
    const r = montar(NFE);
    const cobr = acharSecao(r.blocos, 'cobr');
    assert.ok(cobr?.tipo === 'secao');
    const dup = cobr.blocos[0];
    assert.ok(dup.tipo === 'tabela');
    assert.equal(dup.titulo, 'Duplicatas');
    assert.deepEqual(dup.linhas[1].celulas, ['002', '09/01/2027', '225,25']);
  });
});

describe('Formato original: XML que não é NF-e', () => {
  it('tags como título, atributos junto do elemento, repetidos em tabela', () => {
    const r = montar(PEDIDO);
    assert.equal(r.nfe, false);
    const [raiz] = r.blocos;
    assert.ok(raiz.tipo === 'secao');
    assert.equal(raiz.titulo, null);
    assert.deepEqual(raiz.tags, ['pedidoCompra']);
    assert.deepEqual(
      raiz.atributos.map((c) => [c.tag, c.valor, c.atributo]),
      [['numero', 'PED-7781', true]],
    );
    const cab = acharSecao(raiz.blocos, 'cabecalho');
    assert.ok(cab?.tipo === 'secao' && cab.blocos[0].tipo === 'campos');
    assert.deepEqual(
      cab.blocos[0].campos.map((c) => [c.tag, c.rotulo, c.valor]),
      [
        ['emissao', null, '05/11/2026'],
        ['cnpjComprador', null, '00.000.000/0002-72'],
      ],
    );
    const itens = acharSecao(raiz.blocos, 'itens');
    assert.ok(itens?.tipo === 'secao');
    const tabela = itens.blocos[0];
    assert.ok(tabela.tipo === 'tabela');
    assert.deepEqual(
      tabela.colunas.map((c) => [c.atributo ? `@${c.tag}` : c.tag, c.numerica]),
      [
        ['@linha', true],
        ['codigo', false],
        ['quantidade', true],
        ['precoUnitario', true],
      ],
    );
    assert.deepEqual(tabela.linhas[0].celulas, ['1', 'A1', '20', '18,50']);
    assert.equal(tabela.quantidade, '2 linhas');
  });

  it('acima do limite de elementos, não monta e explica', () => {
    const muitos = `<a>${'<b/>'.repeat(LIMITE_ELEMENTOS_FORMATO + 1)}</a>`;
    const r = montarFormato(lerXml(muitos));
    assert.equal(r.status, 'grande');
  });

  it('xml-stylesheet é só texto: o Formato original não usa folha de estilo', () => {
    const r = montar(
      `<?xml-stylesheet type="text/xsl" href="http://exemplo.invalid/x.xsl"?><a><b>1</b></a>`,
    );
    assert.equal(r.raiz, 'a');
    assert.ok(!JSON.stringify(r).includes('exemplo.invalid'));
  });
});
