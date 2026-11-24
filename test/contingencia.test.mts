// DANFE da NF-e emitida em contingência (src/danfe/contingencia.ts): campos
// variáveis do cabeçalho, expressões obrigatórias, entrada em contingência e
// o código de barras adicional "Dados da NF-e", com as NF-e inventadas
// test/janela/fixtures/c0*.xml (uma por tipo de emissão, 2 a 7).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { lerDanfe, motivoNaoSuportado } from '../src/danfe/dados.ts';
import { barrasCode128C } from '../src/danfe/code128.ts';
import {
  camposVariaveis,
  dadosNfeContingencia,
  dvModulo11,
  EXPRESSAO_EPEC,
  EXPRESSAO_FORMULARIO,
  expressaoContingencia,
  linhaEntradaContingencia,
} from '../src/danfe/contingencia.ts';
import { lerDocumento, localizarOriginal } from '../src/nfe/parser.ts';
import { ligarDomMinimo } from './apoioDom.mts';

const FIXTURES = path.join(import.meta.dirname, 'janela', 'fixtures');
const xml = (nome: string) => readFileSync(path.join(FIXTURES, nome), 'utf8');
const danfe = (texto: string) =>
  lerDanfe(localizarOriginal(lerDocumento(texto)).original);

const CASOS = {
  '2': 'c02-contingencia-fs-ia.xml',
  '3': 'c03-contingencia-scan.xml',
  '4': 'c04-contingencia-epec.xml',
  '5': 'c05-contingencia-fs-da.xml',
  '6': 'c06-contingencia-svc-an.xml',
  '7': 'c07-contingencia-svc-rs.xml',
} as const;

describe('DANFE em contingência', () => {
  before(ligarDomMinimo);

  it('DV módulo 11: o exemplo do MOC 7.0 (Visão Geral, p. 19) dá 5', () => {
    assert.equal(dvModulo11('5206043300991100250655012000000780026730161'), 5);
  });

  it('as fixtures têm chave válida e o tpEmis na chave', () => {
    for (const [tp, nome] of Object.entries(CASOS)) {
      const d = danfe(xml(nome));
      assert.equal(d.tpEmis, tp, nome);
      assert.equal(d.chave.length, 44, nome);
      assert.equal(d.chave[34], tp, nome);
      assert.equal(String(dvModulo11(d.chave.slice(0, 43))), d.chave[43]);
    }
  });

  it('todos os tipos de emissão da NF-e modelo 55 têm DANFE', () => {
    for (const nome of Object.values(CASOS)) {
      assert.equal(motivoNaoSuportado(danfe(xml(nome))), null, nome);
    }
    const normal = xml(CASOS['5']).replace(
      /<tpEmis>5<\/tpEmis>/,
      '<tpEmis>1</tpEmis>',
    );
    assert.equal(motivoNaoSuportado(danfe(normal)), null);
  });

  it('tpEmis 9 (só da NFC-e) e outro modelo continuam sem DANFE', () => {
    const t9 = xml(CASOS['5']).replace(
      '<tpEmis>5</tpEmis>',
      '<tpEmis>9</tpEmis>',
    );
    assert.match(
      motivoNaoSuportado(danfe(t9)) ?? '',
      /^Tipo de emissão 9 não é previsto para a NF-e modelo 55/,
    );
    const m65 = xml(CASOS['6']).replace('<mod>55</mod>', '<mod>65</mod>');
    assert.match(motivoNaoSuportado(danfe(m65)) ?? '', /outro modelo/);
  });

  it('campos variáveis do cabeçalho por tipo de emissão (MOC Anexo II, 3.9)', () => {
    assert.equal(camposVariaveis('1'), 'autorizacao');
    assert.equal(camposVariaveis('2'), 'formulario');
    assert.equal(camposVariaveis('3'), 'autorizacao');
    assert.equal(camposVariaveis('4'), 'epec');
    assert.equal(camposVariaveis('5'), 'formulario');
    assert.equal(camposVariaveis('6'), 'autorizacao');
    assert.equal(camposVariaveis('7'), 'autorizacao');
  });

  it('expressões obrigatórias (MOC Anexo III, pp. 8 e 14)', () => {
    assert.equal(
      EXPRESSAO_FORMULARIO,
      'DANFE em Contingência - impresso em decorrência de problemas técnicos',
    );
    assert.equal(
      EXPRESSAO_EPEC,
      'DANFE impresso em contingência - EPEC regularmente recebida pela Receita Federal do Brasil',
    );
    assert.equal(expressaoContingencia('1'), null);
    assert.equal(expressaoContingencia('2'), EXPRESSAO_FORMULARIO);
    assert.equal(expressaoContingencia('3'), null);
    assert.equal(expressaoContingencia('4'), EXPRESSAO_EPEC);
    assert.equal(expressaoContingencia('5'), EXPRESSAO_FORMULARIO);
    assert.equal(expressaoContingencia('6'), null);
    assert.equal(expressaoContingencia('7'), null);
  });

  it('entrada em contingência: data e hora do XML e a justificativa', () => {
    const d = danfe(xml(CASOS['6']));
    assert.equal(
      linhaEntradaContingencia(d),
      'Entrada em contingência: 23/11/2026 09:15:00 - Justificativa: Falha de comunicacao inventada com a SEFAZ para o teste SVC-AN',
    );
    // Emissão normal: nada, mesmo que o XML traga os campos.
    assert.equal(linhaEntradaContingencia({ ...d, tpEmis: '1' }), '');
    // Sem dhCont e xJust no XML: nada.
    assert.equal(
      linhaEntradaContingencia({
        ...d,
        contingencia: { dhCont: '', xJust: '' },
      }),
      '',
    );
  });

  it('Dados da NF-e (MOC Anexo II, 3.9.2): FS-IA e FS-DA', () => {
    // cUF 35 (SP, do destinatário), tpEmis, CNPJ do destinatário, vNF
    // 1234,56 em centavos, ICMS próprio destacado (1), sem ST (2), dia 23 e
    // o DV.
    assert.equal(
      dadosNfeContingencia(danfe(xml(CASOS['2']))),
      '352123456780001950000000012345612239',
    );
    assert.equal(
      dadosNfeContingencia(danfe(xml(CASOS['5']))),
      '355123456780001950000000012345612233',
    );
    for (const tp of ['3', '4', '6', '7'] as const) {
      assert.equal(dadosNfeContingencia(danfe(xml(CASOS[tp]))), null, tp);
    }
  });

  it('Dados da NF-e: CPF, exterior, ST e valor com uma casa', () => {
    const base = danfe(xml(CASOS['5']));
    const cpf = dadosNfeContingencia({
      ...base,
      dest: { ...base.dest, CNPJ: '', CPF: '12345678909' },
    });
    assert.equal(cpf?.slice(3, 17), '00012345678909');
    const ext = dadosNfeContingencia({
      ...base,
      dest: {
        ...base.dest,
        CNPJ: '',
        endereco: { ...base.dest.endereco, UF: 'EX' },
      },
    });
    assert.equal(ext?.slice(0, 17), '995' + '0'.repeat(14));
    const st = dadosNfeContingencia({
      ...base,
      totais: { ...base.totais, vICMS: '0.00', vST: '10.00', vNF: '99.5' },
    });
    assert.equal(st?.slice(17, 35), '000000000099502123');
    for (const d of [cpf, ext, st]) {
      assert.equal(d?.length, 36);
      assert.equal(String(dvModulo11(d!.slice(0, 35))), d![35]);
    }
    // Sem UF do destinatário não há como montar.
    assert.equal(
      dadosNfeContingencia({
        ...base,
        dest: { ...base.dest, endereco: { ...base.dest.endereco, UF: '' } },
      }),
      null,
    );
  });

  it('Dados da NF-e em CODE-128C: 253 módulos com as margens', () => {
    const b = barrasCode128C('355123456780001950000000012345612233');
    assert.equal(b.total, 253);
  });
});
