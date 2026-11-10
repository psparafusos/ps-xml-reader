// Leitura do arquivo para a tela do leitor genérico (src/leitorXml/arquivo.ts):
// prazo da pasta de rede, recusa acima de 100 MB sem ler, arquivo em uso,
// não encontrado e o comando do Bloco de Notas. Disco de mentira.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  comandoBlocoDeNotas,
  lerParaLeitor,
  MENSAGEM_EM_USO_LEITOR,
  MENSAGEM_NAO_ENCONTRADO,
  type DiscoLeitor,
} from '../../src/leitorXml/arquivo.ts';

const MB = 1024 * 1024;
const CAMINHO = 'C:\\Notas\\pedido inventado.xml';

function disco(
  tamanho: number | Error | 'nunca',
  conteudo: string | Error = '<a/>',
): DiscoLeitor & { leituras: number } {
  const d = {
    leituras: 0,
    tamanho: () =>
      tamanho === 'nunca'
        ? new Promise<number>(() => {})
        : tamanho instanceof Error
          ? Promise.reject(tamanho)
          : Promise.resolve(tamanho),
    ler: async () => {
      d.leituras++;
      if (conteudo instanceof Error) throw conteudo;
      return new TextEncoder().encode(conteudo);
    },
  };
  return d;
}

const erroCom = (code: string) => Object.assign(new Error(code), { code });

describe('lerParaLeitor', () => {
  it('lê e prepara; o texto vem à parte', async () => {
    const d = disco(20, '<pedido><item>1</item></pedido>');
    const { resultado, texto } = await lerParaLeitor(CAMINHO, d);
    assert.equal(resultado.status, 'ok');
    if (resultado.status !== 'ok') return;
    assert.equal(resultado.arquivo.nome, 'pedido inventado.xml');
    assert.equal(resultado.arquivo.caminho, CAMINHO);
    assert.equal(resultado.arquivo.tamanho, 31);
    assert.equal(resultado.leitura.modo, 'arvore');
    assert.equal('texto' in resultado.leitura, false);
    assert.equal(texto, '<pedido><item>1</item></pedido>');
  });

  it('acima de 100 MB: recusa só pelo stat, sem ler o conteúdo', async () => {
    const d = disco(240 * MB);
    const { resultado, texto } = await lerParaLeitor(CAMINHO, d);
    assert.deepEqual(
      resultado.status === 'recusado' && [resultado.motivo, resultado.mensagem],
      ['grande', 'Este arquivo tem 240 MB, grande demais para o PS Reader.'],
    );
    assert.equal(
      resultado.status === 'recusado' && resultado.arquivo.tamanho,
      240 * MB,
    );
    assert.equal(texto, null);
    assert.equal(d.leituras, 0);
  });

  it('pasta de rede que não responde: mensagem com o prazo', async () => {
    const { resultado } = await lerParaLeitor(CAMINHO, disco('nunca'), 20);
    assert.equal(resultado.status, 'recusado');
    if (resultado.status !== 'recusado') return;
    assert.equal(resultado.motivo, 'sem-resposta');
    assert.match(resultado.mensagem, /pasta de rede não respondeu/);
  });

  it('em uso por outro programa e não encontrado', async () => {
    const emUso = await lerParaLeitor(CAMINHO, disco(10, erroCom('EBUSY')));
    assert.deepEqual(
      emUso.resultado.status === 'recusado' && emUso.resultado.mensagem,
      MENSAGEM_EM_USO_LEITOR,
    );
    const sumiu = await lerParaLeitor(CAMINHO, disco(erroCom('ENOENT')));
    assert.deepEqual(
      sumiu.resultado.status === 'recusado' && sumiu.resultado.mensagem,
      MENSAGEM_NAO_ENCONTRADO,
    );
  });

  it('binário: a recusa do motor chega à tela', async () => {
    const { resultado } = await lerParaLeitor(
      CAMINHO,
      disco(5, '\u0000\u0001\u0002ab'),
    );
    assert.equal(
      resultado.status === 'recusado' && resultado.motivo,
      'binario',
    );
  });
});

describe('comandoBlocoDeNotas', () => {
  it('notepad.exe pelo caminho completo da pasta do Windows, arquivo como único argumento', () => {
    assert.deepEqual(comandoBlocoDeNotas(CAMINHO, 'C:\\Windows'), {
      arquivo: 'C:\\Windows\\System32\\notepad.exe',
      argumentos: [CAMINHO],
    });
    assert.deepEqual(
      comandoBlocoDeNotas('\\\\servidor\\notas\\a b.xml', 'D:\\WIN'),
      {
        arquivo: 'D:\\WIN\\System32\\notepad.exe',
        argumentos: ['\\\\servidor\\notas\\a b.xml'],
      },
    );
  });

  it('pasta do Windows ausente ou relativa: C:\\Windows', () => {
    assert.equal(
      comandoBlocoDeNotas(CAMINHO, undefined)?.arquivo,
      'C:\\Windows\\System32\\notepad.exe',
    );
    assert.equal(
      comandoBlocoDeNotas(CAMINHO, 'pasta\\falsa')?.arquivo,
      'C:\\Windows\\System32\\notepad.exe',
    );
  });

  it('caminho relativo ou que pareceria opção: recusado', () => {
    assert.equal(comandoBlocoDeNotas('nota.xml', 'C:\\Windows'), null);
    assert.equal(comandoBlocoDeNotas('/p', 'C:\\Windows'), null);
    assert.equal(comandoBlocoDeNotas('\\nota.xml', 'C:\\Windows'), null);
  });
});
