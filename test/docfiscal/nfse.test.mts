// Leitura da NFS-e (src/docfiscal/nfse.ts) e o modelo do DANFSe
// (src/docfiscal/danfse.ts), com as NFS-e inventadas de test/janela/fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DOMParserMinimo } from '../apoioDom.mts';
import {
  codigoNbs,
  codigoTributacao,
  lerNfseAbrasf,
  lerNfseNacional,
  nfsesAbrasf,
} from '../../src/docfiscal/nfse.ts';
import {
  modeloDanfse,
  TEXTO_QR,
  URL_CONSULTA_NACIONAL,
} from '../../src/docfiscal/danfse.ts';
import type { Bloco, Campo } from '../../src/docfiscal/modelo.ts';
import type { ElementoXml } from '../../src/docfiscal/tipo.ts';

const fixture = (nome: string) =>
  readFileSync(new URL(`../janela/fixtures/${nome}`, import.meta.url), 'utf8');
const raiz = (xml: string) =>
  new DOMParserMinimo().parseFromString(xml).documentElement as ElementoXml;

/** Valor do campo `rotulo` em linhas de campos. */
function valor(linhas: Campo[][] | undefined, rotulo: string): string {
  const c = (linhas ?? []).flat().find((x) => x.rotulo === rotulo);
  assert.ok(c, `sem o campo ${rotulo}`);
  return c.valor;
}
const bloco = (blocos: Bloco[], chave: string) => {
  const b = blocos.find((x) => x.chave === chave);
  assert.ok(b, `sem o bloco ${chave}`);
  return b;
};

describe('NFS-e ABRASF 2.02', () => {
  const d = lerNfseAbrasf(raiz(fixture('d01-nfse-abrasf.xml')));

  it('identificação, prestador e tomador', () => {
    assert.equal(d.origem, 'abrasf');
    assert.equal(d.versao, '2.02');
    assert.equal(d.numero, '202600000000321');
    assert.equal(d.codigoVerificacao, 'TST1-AB2C');
    assert.equal(d.competencia, '01/11/2026');
    assert.equal(d.numeroDps, '321');
    assert.equal(d.prestador.documento, '98.765.432/0001-98');
    assert.equal(d.prestador.nome, 'Locadora Inventada de Veiculos Ltda');
    assert.equal(d.prestador.municipio, 'Aracaju / SE');
    assert.equal(d.prestador.codigoCep, '2800308 / 49000-000');
    assert.equal(d.prestador.telefone, '(79) 3333-4444');
    assert.equal(d.prestador.simples, 'Não Optante');
    assert.equal(d.tomador?.documento, '12.345.678/0001-95');
    assert.equal(
      d.tomador?.endereco,
      'Avenida de Teste, 2000, Sala 1, Bairro Inventado',
    );
    assert.equal(d.intermediario, null);
    assert.equal(d.municipioEmissor, 'Município: Aracaju / SE');
  });

  it('serviço, ISS e retenções', () => {
    assert.equal(d.servico.codigo, '0399 / 0399');
    assert.match(d.servico.descricao, /^LOCACAO DE VEICULO INVENTADO/);
    assert.equal(d.issqn?.tributacao, 'Exigível');
    assert.equal(d.issqn?.base, '1.450,00');
    assert.equal(d.issqn?.aliquota, '2,00%');
    assert.equal(d.issqn?.valor, '29,00');
    assert.equal(d.issqn?.retencao, 'Não Retido');
    assert.equal(d.federal.contribuicoesRetidas, '67,43');
    assert.equal(d.federal.descricaoRetidas, 'PIS, COFINS, CSLL');
    assert.equal(d.total.servico, '1.450,00');
    assert.equal(d.total.retencoes, '67,43');
    assert.equal(d.total.liquido, '1.382,57');
    assert.equal(d.total.liquidoMaisIbscbs, '1.382,57');
    assert.equal(d.ibscbs, null);
    assert.match(d.complementares, /ambiente de teste/);
  });

  it('modelo: sem QR Code do portal nacional e com o rodapé do PS Reader', () => {
    const m = modeloDanfse(d);
    assert.equal(m.titulo, 'DANFSe');
    assert.ok('aviso' in m.qr);
    assert.match('aviso' in m.qr ? m.qr.aviso : '', /TST1-AB2C/);
    assert.ok(m.rodape);
    assert.match(m.rodape ?? '', /montado pelo PS Reader a partir do XML/);
    assert.match(m.rodape ?? '', /versão 2\.02/);
    assert.match(m.rodape ?? '', /código de verificação TST1-AB2C/);
    assert.equal(valor(m.identificacao, 'CÓDIGO DE VERIFICAÇÃO'), 'TST1-AB2C');
    assert.equal(
      bloco(m.blocos, 'intermediario').aviso,
      'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
    );
    assert.equal(
      bloco(m.blocos, 'destinatario').aviso,
      'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
    );
    assert.equal(
      bloco(m.blocos, 'servico').texto?.valor.startsWith('LOCACAO'),
      true,
    );
    assert.equal(
      valor(
        bloco(m.blocos, 'total').linhas,
        'Valor Líquido da NFS-e + IBS/CBS',
      ),
      '1.382,57',
    );
    assert.equal(
      m.blocos.some((b) => b.chave === 'ibscbs'),
      false,
    );
  });

  it('lista de uma resposta de consulta: cada CompNfse é uma nota', () => {
    const xml = fixture('d01-nfse-abrasf.xml').replace(/^<\?xml[^>]*>/, '');
    const lista = `<ConsultarNfseFaixaResposta><ListaNfse>${xml}${xml}</ListaNfse></ConsultarNfseFaixaResposta>`;
    assert.equal(nfsesAbrasf(raiz(lista)).length, 2);
  });

  it('nota cancelada (NfseCancelamento na CompNfse)', () => {
    const xml = fixture('d01-nfse-abrasf.xml').replace(
      '</CompNfse>',
      '<NfseCancelamento><Confirmacao/></NfseCancelamento></CompNfse>',
    );
    assert.equal(lerNfseAbrasf(raiz(xml)).situacao, 'Cancelada');
  });
});

describe('NFS-e Nacional', () => {
  const d = lerNfseNacional(raiz(fixture('d02-nfse-nacional.xml')));

  it('chave de 50 dígitos e identificação', () => {
    assert.equal(d.origem, 'nacional');
    assert.equal(d.chave.length, 50);
    assert.equal(d.numero, '123');
    assert.equal(d.competencia, '10/11/2026');
    assert.equal(d.numeroDps, '77');
    assert.equal(d.serieDps, '1');
    assert.equal(d.emitente, 'Prestador');
    assert.equal(d.situacao, 'NFS-e Gerada');
    assert.equal(d.finalidade, 'NFS-e regular');
    assert.equal(d.municipioEmissor, 'Município: Aracaju / SE');
    assert.equal(d.ambienteGerador, 'Ambiente gerador: Sistema Nacional NFS-e');
    assert.equal(d.tpAmb, '2');
  });

  it('prestador completado pelo emit; tomador com o nome do município do XML', () => {
    assert.equal(d.prestador.nome, 'Prestadora Inventada de Servicos Ltda');
    assert.equal(d.prestador.endereco, 'Rua das Amostras, 100, Centro');
    assert.equal(d.prestador.municipio, 'Aracaju / SE');
    assert.equal(d.tomador?.municipio, 'Aracaju / SE');
    assert.equal(d.tomador?.codigoCep, '2800308 / 49000-001');
    assert.equal(d.destinatario, 'tomador');
  });

  it('serviço, ISSQN, federais, IBS/CBS e total', () => {
    assert.equal(d.servico.codigo, '03.03.01');
    assert.equal(d.servico.nbs, '1.2345.67.89');
    assert.equal(d.servico.local, 'Aracaju / SE / BR');
    assert.equal(d.servico.descricaoCodigo, 'Locação de bens móveis');
    assert.equal(d.issqn?.tributacao, 'Operação Tributável');
    assert.equal(d.issqn?.incidencia, 'Aracaju / SE / BR');
    assert.equal(d.issqn?.aliquota, '3,00%');
    assert.equal(d.issqn?.valor, '60,00');
    assert.equal(d.issqn?.retencao, 'Não Retido');
    assert.equal(d.federal.irrf, '30,00');
    assert.equal(d.ibscbs?.cst, '000 / 000001');
    assert.equal(d.ibscbs?.valorIbsUf, '2,00');
    assert.equal(d.total.retencoes, '30,00');
    assert.equal(d.total.liquido, '1.970,00');
    assert.equal(d.total.ibscbs, '20,00');
    assert.equal(d.total.liquidoMaisIbscbs, '1.990,00');
    assert.match(d.complementares, /Pedido de compra inventado 4567/);
    assert.match(d.complementares, /Federais R\$ 120,00/);
  });

  it('modelo: QR Code com a URL do portal nacional e homologação', () => {
    const m = modeloDanfse(d);
    assert.equal(m.titulo, 'DANFSe v2.0');
    assert.equal(m.subtitulo, 'Documento Auxiliar da NFS-e');
    assert.equal(m.semValidade, 'NFS-e SEM VALIDADE JURÍDICA');
    assert.deepEqual(m.qr, {
      texto: `${URL_CONSULTA_NACIONAL}${d.chave}`,
      legenda: TEXTO_QR,
    });
    assert.equal(m.rodape, null);
    assert.equal(
      bloco(m.blocos, 'destinatario').aviso,
      'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO',
    );
    assert.ok(m.blocos.some((b) => b.chave === 'ibscbs'));
    assert.deepEqual(
      m.blocos.map((b) => b.titulo),
      [
        'PRESTADOR / FORNECEDOR',
        'TOMADOR / ADQUIRENTE',
        'DESTINATÁRIO DA OPERAÇÃO',
        'INTERMEDIÁRIO DA OPERAÇÃO',
        'SERVIÇO PRESTADO',
        'TRIBUTAÇÃO MUNICIPAL (ISSQN)',
        'TRIBUTAÇÃO FEDERAL (EXCETO CBS)',
        'TRIBUTAÇÃO IBS / CBS',
        'VALOR TOTAL DA NFS-E',
        'INFORMAÇÕES COMPLEMENTARES',
      ],
    );
  });

  it('operação não sujeita ao ISSQN: bloco suprimido com o texto da NT', () => {
    const xml = fixture('d02-nfse-nacional.xml').replace(
      '<tribISSQN>1</tribISSQN>',
      '<tribISSQN>4</tribISSQN>',
    );
    const m = modeloDanfse(lerNfseNacional(raiz(xml)));
    assert.equal(
      bloco(m.blocos, 'issqn').aviso,
      'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN',
    );
  });
});

describe('formatos de código', () => {
  it('tributação nacional e NBS', () => {
    assert.equal(codigoTributacao('010701'), '01.07.01');
    assert.equal(codigoTributacao('0107'), '0107');
    assert.equal(codigoNbs('123456789'), '1.2345.67.89');
  });
});
