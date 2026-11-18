// Leitura do CT-e e o modelo do DACTE (src/docfiscal/dacte.ts), com o CT-e
// inventado de test/janela/fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DOMParserMinimo } from '../apoioDom.mts';
import { lerCte, modeloDacte } from '../../src/docfiscal/dacte.ts';
import type { ElementoXml } from '../../src/docfiscal/tipo.ts';

const xml = readFileSync(
  new URL('../janela/fixtures/d03-cte.xml', import.meta.url),
  'utf8',
);
const raiz = (x: string) =>
  new DOMParserMinimo().parseFromString(x).documentElement as ElementoXml;

describe('CT-e', () => {
  const d = lerCte(raiz(xml));

  it('cabeçalho: emitente, identificação, chave, protocolo e QR Code', () => {
    assert.equal(d.versao, '4.00');
    assert.equal(d.chave.length, 44);
    assert.equal(d.modal, 'Rodoviário');
    assert.equal(d.modelo, '57');
    assert.equal(d.serie, '1');
    assert.equal(d.numero, '4567');
    assert.equal(d.emissao, '05/11/2026 14:20:31');
    assert.equal(d.protocolo, '342260000123456 - 05/11/2026 14:21:02');
    assert.match(d.qrCode, /qrCode\?chCTe=4226117654321000019857/);
    assert.equal(d.tipoCte, 'Normal');
    assert.equal(d.tipoServico, 'Normal');
    assert.equal(
      d.cfop,
      '6353 - PRESTACAO DE SERVICO DE TRANSPORTE A ESTABELECIMENTO COMERCIAL',
    );
    assert.equal(d.inicio, 'JOINVILLE - SC');
    assert.equal(d.termino, 'ARACAJU - SE');
    assert.equal(d.emitente.nome, 'Transportadora Inventada Ltda');
    assert.equal(d.emitente.documento, '76.543.210/0001-98');
  });

  it('partes: o tomador (toma3 = 3) é o destinatário', () => {
    assert.equal(d.remetente?.nome, 'Fabrica Inventada de Fixadores S.A.');
    assert.equal(d.destinatario?.documento, '12.345.678/0001-95');
    assert.equal(d.expedidor, null);
    assert.equal(d.recebedor, null);
    assert.equal(d.tomadorPapel, 'Destinatário');
    assert.equal(d.tomador?.nome, 'Loja Inventada de Parafusos Ltda');
    assert.equal(
      d.tomador?.endereco,
      'Avenida de Teste, 2000 - Sala 1 - Bairro Inventado',
    );
  });

  it('carga, componentes, imposto e documentos originários', () => {
    assert.equal(d.carga.produto, 'PARAFUSOS E PORCAS');
    assert.equal(d.carga.valor, '15.230,55');
    assert.equal(d.carga.pesoBruto, '1.250,5');
    assert.equal(d.carga.pesoBase, '1.300');
    assert.equal(d.carga.volumes, '42');
    assert.deepEqual(
      d.componentes.map((c) => `${c.nome}=${c.valor}`),
      ['FRETE PESO=700,00', 'GRIS=50,40', 'PEDAGIO=100,00'],
    );
    assert.equal(d.totalPrestacao, '850,40');
    assert.equal(d.valorReceber, '850,40');
    assert.equal(d.imposto.situacao, '00 - Tributação normal do ICMS');
    assert.equal(d.imposto.aliquota, '12,00');
    assert.equal(d.imposto.valor, '102,05');
    assert.equal(d.documentos.length, 3);
    assert.deepEqual(d.documentos[0], {
      tipo: 'NF-e',
      emitente: '87.654.321/0001-98',
      documento: '4226 1187 6543 2100 0198 5500 1000 0012 3411 2345 6789',
      serieNumero: '1 / 1234',
    });
    assert.equal(d.rntrc, '12345678');
    assert.equal(d.usoEmissor, 'Pedido: PED-9876');
  });

  it('modelo: tomador em destaque, quadro do modal rodoviário, sem Expedidor/Recebedor', () => {
    const m = modeloDacte(d);
    assert.equal(m.cabecalho.titulo, 'DACTE');
    assert.equal(m.cabecalho.modal, 'MODAL RODOVIÁRIO');
    assert.equal(m.partes.length, 1);
    const tomador = m.blocos.find((b) => b.chave === 'tomador');
    assert.ok(tomador?.linhas?.[0][0].destaque);
    assert.equal(tomador?.titulo, 'TOMADOR DO SERVIÇO');
    assert.ok(
      m.blocos.some(
        (b) => b.titulo === 'INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO',
      ),
    );
    const docs = m.blocos.find((b) => b.chave === 'documentos');
    assert.equal(docs?.tabela?.linhas.length, 3);
    assert.equal(m.marca, null);
  });

  it('toma4, modal aéreo e homologação', () => {
    const outro = xml
      .replace(
        '<toma3>\n          <toma>3</toma>\n        </toma3>',
        '<toma4><toma>4</toma><CNPJ>11223344000186</CNPJ><xNome>Tomador Inventado</xNome><enderToma><xLgr>Rua X</xLgr><nro>1</nro><xBairro>B</xBairro><cMun>1</cMun><xMun>CIDADE</xMun><UF>SP</UF></enderToma></toma4>',
      )
      .replace('<modal>01</modal>', '<modal>02</modal>')
      .replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>');
    const m = modeloDacte(lerCte(raiz(outro)));
    assert.equal(m.cabecalho.modal, 'MODAL AÉREO');
    assert.equal(
      m.blocos.find((b) => b.chave === 'tomador')?.linhas?.[0][0].valor,
      'Tomador Inventado',
    );
    assert.equal(
      m.blocos.some((b) => b.chave === 'modal'),
      false,
    );
    assert.equal(
      m.marca,
      'EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL',
    );
  });
});
