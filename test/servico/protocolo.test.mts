// Protocolo do serviço de leitura pesada (src/servico/protocolo.ts): o
// pedido que o filho aceita e a conferência do que volta, com resultados de
// verdade e adulterados. Dados inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lerParaLeitor } from '../../src/leitorXml/arquivo.ts';
import {
  mensagemValida,
  pedidoValido,
  resultadoValido,
  type Tarefa,
} from '../../src/servico/protocolo.ts';

const XML: Tarefa = { tipo: 'xml', caminho: 'C:\\x\\a.xml' };

async function leitura(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  return lerParaLeitor('C:\\x\\a.xml', {
    tamanho: async () => bytes.length,
    ler: async () => bytes,
  });
}

describe('pedidoValido', () => {
  it('aceita caminho absoluto e planilha em bytes', () => {
    assert.equal(pedidoValido({ id: 1, tarefa: XML }), true);
    assert.equal(
      pedidoValido({
        id: 2,
        tarefa: { tipo: 'nfe', caminho: '\\\\srv\\notas\\n.xml' },
      }),
      true,
    );
    assert.equal(
      pedidoValido({
        id: 3,
        tarefa: { tipo: 'planilha', documento: 'st', dados: new Uint8Array(4) },
      }),
      true,
    );
  });

  it('recusa caminho relativo, de dispositivo, com byte zero, tipo estranho e planilha grande', () => {
    for (const caminho of [
      'a.xml',
      '..\\a.xml',
      '\\\\?\\C:\\a.xml',
      '\\\\.\\COM1',
      'C:\\a\0.xml',
      3,
    ]) {
      assert.equal(
        pedidoValido({ id: 1, tarefa: { tipo: 'xml', caminho } }),
        false,
        String(caminho),
      );
    }
    assert.equal(
      pedidoValido({ id: 1, tarefa: { tipo: 'apagar', caminho: 'C:\\a' } }),
      false,
    );
    assert.equal(
      pedidoValido({
        id: 1,
        tarefa: {
          tipo: 'planilha',
          documento: 'st',
          dados: new Uint8Array(31 * 1024 * 1024),
        },
      }),
      false,
    );
    assert.equal(
      pedidoValido({
        id: 1,
        tarefa: {
          tipo: 'planilha',
          documento: 'outro',
          dados: new Uint8Array(1),
        },
      }),
      false,
    );
    assert.equal(pedidoValido({ id: -1, tarefa: XML }), false);
  });
});

describe('mensagemValida', () => {
  it('só os três tipos, com id e campos certos', () => {
    assert.equal(
      mensagemValida({ id: 1, tipo: 'progresso', etapa: 'lendo' }),
      true,
    );
    assert.equal(
      mensagemValida({ id: 1, tipo: 'progresso', etapa: 'outra' }),
      false,
    );
    assert.equal(mensagemValida({ id: 1, tipo: 'falha', mensagem: 'x' }), true);
    assert.equal(
      mensagemValida({ id: 1, tipo: 'resultado', resultado: null }),
      true,
    );
    assert.equal(mensagemValida({ id: 1, tipo: 'resultado' }), false);
    assert.equal(mensagemValida({ tipo: 'falha', mensagem: 'x' }), false);
  });
});

describe('resultadoValido (xml)', () => {
  it('a leitura de verdade passa, com árvore e sem árvore', async () => {
    assert.equal(
      resultadoValido(XML, await leitura('<a x="1"><b>t</b></a>')),
      true,
    );
    assert.equal(resultadoValido(XML, await leitura('<a>\n<b>')), true);
    assert.equal(resultadoValido(XML, await leitura('\u0000\u0001')), true);
  });

  it('árvore com laço, índice fora da tabela ou trecho fora do texto: recusada', async () => {
    const base = await leitura('<a x="1"><b>t</b><c/></a>');
    const copia = () => structuredClone(base);

    const laco = copia();
    if (laco.resultado.status === 'ok')
      laco.resultado.leitura.arvore!.proximoIrmao[2] = 1;
    assert.equal(resultadoValido(XML, laco), false);

    const paiDepois = copia();
    if (paiDepois.resultado.status === 'ok')
      paiDepois.resultado.leitura.arvore!.pai[1] = 3;
    assert.equal(resultadoValido(XML, paiDepois), false);

    const nome = copia();
    if (nome.resultado.status === 'ok')
      nome.resultado.leitura.arvore!.nome[0] = 99;
    assert.equal(resultadoValido(XML, nome), false);

    const linha = copia();
    if (linha.resultado.status === 'ok')
      linha.resultado.leitura.linhas.fim[0] = 10_000;
    assert.equal(resultadoValido(XML, linha), false);

    const texto = copia();
    texto.texto = '';
    assert.equal(resultadoValido(XML, texto), false);

    const modo = copia();
    if (modo.resultado.status === 'ok') modo.resultado.leitura.modo = 'texto';
    assert.equal(resultadoValido(XML, modo), false);
  });

  it('coisas que não são leitura', () => {
    assert.equal(resultadoValido(XML, null), false);
    assert.equal(
      resultadoValido(XML, { resultado: { status: 'ok' }, texto: 'x' }),
      false,
    );
    assert.equal(
      resultadoValido(XML, {
        resultado: { status: 'sem-arquivo' },
        texto: null,
      }),
      true,
    );
  });
});

describe('resultadoValido (nfe e planilha)', () => {
  it('nfe: texto ou mensagem', () => {
    const nfe: Tarefa = { tipo: 'nfe', caminho: 'C:\\n.xml' };
    assert.equal(resultadoValido(nfe, { ok: true, texto: '<NFe/>' }), true);
    assert.equal(
      resultadoValido(nfe, { ok: false, mensagem: 'DOCTYPE' }),
      true,
    );
    assert.equal(resultadoValido(nfe, { ok: true }), false);
  });

  it('planilha: o preparado tem de ser do documento pedido', () => {
    const st: Tarefa = {
      tipo: 'planilha',
      documento: 'st',
      dados: new Uint8Array(1),
    };
    const base = {
      reconhecido: 'st',
      relatorio: {},
      segmentosIncompletos: [],
      erroPreparo: null,
      preparado: {
        tipo: 'st',
        tipoArquivo: 'xlsx',
        tamanhoArquivo: 10,
        resumo: {},
        gravar: {},
      },
    };
    assert.equal(resultadoValido(st, base), true);
    assert.equal(
      resultadoValido(st, {
        ...base,
        preparado: { ...base.preparado, tipo: 'tipi' },
      }),
      false,
    );
    assert.equal(
      resultadoValido(st, { ...base, preparado: null, relatorio: null }),
      true,
    );
    assert.equal(
      resultadoValido(st, { ...base, segmentosIncompletos: [1] }),
      false,
    );
  });
});
