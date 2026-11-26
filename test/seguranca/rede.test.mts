// Pasta de rede que não responde (simulada: uma promessa que nunca termina,
// como o stat num compartilhamento fora do ar, que o Windows leva dezenas de
// segundos para recusar). Pedido da pessoa (botão Abrir, arrastar, nota
// recente clicada, duplo clique): a mensagem aparece no prazo. Checagem de
// fundo (lista de recentes): silêncio, e a nota continua clicável.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  definirUnidadesDeRede,
  ehCaminhoDeRede,
  ESPERA_CAMINHO_MS,
  escolherCandidato,
  existeOuSemResposta,
  lerSaidaNetUse,
  lerXmlSeguro,
  mensagemSemResposta,
  problemaCaminhoSolto,
  situacaoAtePrazo,
  type Disco,
  type Situacao,
} from '../../src/seguranca/arquivo.ts';
import { ArquivoRecusadoError } from '../../src/seguranca/xml.ts';

const FORA = '\\\\servidor-fora\\notas\\NFe-inventada.xml';
const PRAZO = 50;

/** Nunca responde: a rede fora do ar. */
const nunca = <T,>() => new Promise<T>(() => undefined);

/** Mede quanto `fn` levou, em ms. */
async function cronometro<T>(fn: () => Promise<T>) {
  const t0 = performance.now();
  const r = await fn();
  return { r, ms: performance.now() - t0 };
}

describe('pasta de rede que não responde', () => {
  it('o prazo é de 2 s e a mensagem diz o arquivo e o que fazer', () => {
    assert.equal(ESPERA_CAMINHO_MS, 2000);
    assert.equal(
      mensagemSemResposta(FORA),
      'Não foi possível abrir NFe-inventada.xml: a pasta de rede não respondeu em 2 segundos. Confira a conexão e tente de novo.',
    );
  });

  it('botão Abrir e nota recente clicada (lerXmlSeguro): mensagem no prazo, sem ler', async () => {
    let leu = false;
    const disco: Disco = {
      tamanho: () => nunca(),
      ler: async () => {
        leu = true;
        return new Uint8Array();
      },
    };
    const { ms } = await cronometro(() =>
      assert.rejects(
        lerXmlSeguro(FORA, disco, PRAZO),
        (e: unknown) =>
          e instanceof ArquivoRecusadoError &&
          e.message === mensagemSemResposta(FORA),
      ),
    );
    assert.equal(leu, false);
    assert.ok(ms < 1000, `levou ${ms} ms`);
  });

  it('pasta que responde no prazo: lê normal, mesmo se a leitura demorar', async () => {
    const texto = '<nfeProc/>';
    const disco: Disco = {
      tamanho: async () => texto.length,
      // A leitura não tem prazo: uma vez que a pasta respondeu, pode levar
      // o tempo de copiar o arquivo pela rede.
      ler: () =>
        new Promise((r) => setTimeout(() => r(Buffer.from(texto)), PRAZO * 3)),
    };
    assert.equal(await lerXmlSeguro(FORA, disco, PRAZO), texto);
  });

  it('arrastar (problemaCaminhoSolto): mensagem no prazo', async () => {
    const { r, ms } = await cronometro(() =>
      problemaCaminhoSolto(FORA, ['.xml', '.psxml'], () => nunca(), PRAZO),
    );
    assert.equal(r, mensagemSemResposta(FORA));
    assert.ok(ms < 1000, `levou ${ms} ms`);
  });

  it('duplo clique (escolherCandidato): sem resposta vira pedido com mensagem', async () => {
    const situacoes: Record<string, Situacao> = {
      [FORA]: 'sem-resposta',
      'C:\\Notas\\sumiu.xml': 'outro',
      'C:\\Notas\\nota.xml': 'arquivo',
    };
    const situacao = async (c: string) => situacoes[c];
    assert.deepEqual(await escolherCandidato([FORA], situacao), {
      caminho: FORA,
      semResposta: true,
    });
    // Um candidato que é arquivo vence o que não respondeu.
    assert.deepEqual(
      await escolherCandidato([FORA, 'C:\\Notas\\nota.xml'], situacao),
      { caminho: 'C:\\Notas\\nota.xml', semResposta: false },
    );
    // Só arquivo que não existe: nada a abrir, nenhuma mensagem.
    assert.equal(
      await escolherCandidato(['C:\\Notas\\sumiu.xml'], situacao),
      null,
    );
    assert.equal(await escolherCandidato([], situacao), null);
  });

  it('situacaoAtePrazo: sem resposta, arquivo e outro', async () => {
    const { r, ms } = await cronometro(() =>
      situacaoAtePrazo(FORA, PRAZO, () => nunca()),
    );
    assert.equal(r, 'sem-resposta');
    assert.ok(ms < 1000, `levou ${ms} ms`);
    assert.equal(
      await situacaoAtePrazo('C:\\a.xml', PRAZO, async () => ({
        isFile: () => true,
      })),
      'arquivo',
    );
    assert.equal(
      await situacaoAtePrazo('C:\\p', PRAZO, async () => ({
        isFile: () => false,
      })),
      'outro',
    );
    assert.equal(
      await situacaoAtePrazo('C:\\x', PRAZO, async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
      'outro',
    );
  });

  it('lista de recentes (checagem de fundo): silêncio no prazo e a nota continua clicável', async () => {
    const { r, ms } = await cronometro(() =>
      existeOuSemResposta(FORA, PRAZO, () => nunca()),
    );
    assert.equal(
      r,
      true,
      'sem resposta conta como existente: nada de "arquivo movido"',
    );
    assert.ok(ms < 1000, `levou ${ms} ms`);
    assert.equal(
      await existeOuSemResposta('C:\\a.xml', PRAZO, async () => undefined),
      true,
    );
    assert.equal(
      await existeOuSemResposta('C:\\sumiu.xml', PRAZO, async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }),
      false,
      'arquivo que não existe de verdade continua como movido',
    );
  });
});

describe('o prazo vale só para caminho de rede', () => {
  const LOCAL = 'C:\\Notas\\NFe-inventada.xml';
  const MAPEADA = 'Z:\\Notas\\NFe-inventada.xml';
  /** Responde depois de `ms`: o disco local de um computador carregado. */
  const devagar = <T,>(valor: T, ms: number) =>
    new Promise<T>((r) => setTimeout(() => r(valor), ms));

  before(() => definirUnidadesDeRede(['Z']));
  after(() => definirUnidadesDeRede(null));

  it('UNC e unidade mapeada de rede são de rede; unidade local não', () => {
    const z = new Set(['Z']);
    assert.equal(ehCaminhoDeRede(FORA, z), true);
    assert.equal(ehCaminhoDeRede('//servidor/notas/a.xml', z), true);
    assert.equal(
      ehCaminhoDeRede('\\\\?\\UNC\\servidor\\notas\\a.xml', z),
      true,
    );
    assert.equal(ehCaminhoDeRede(MAPEADA, z), true);
    assert.equal(ehCaminhoDeRede('z:\\a.xml', z), true);
    assert.equal(ehCaminhoDeRede(LOCAL, z), false);
    assert.equal(ehCaminhoDeRede('\\\\?\\C:\\a.xml', z), false);
    assert.equal(ehCaminhoDeRede('\\\\.\\C:\\a.xml', z), false);
    assert.equal(ehCaminhoDeRede('nota.xml', z), false);
    // Sem saber as unidades (antes da consulta ou se ela falhou), toda
    // unidade com letra conta como de rede, como era antes.
    assert.equal(ehCaminhoDeRede(LOCAL, null), true);
  });

  it('as unidades de rede vêm da saída do net use, em qualquer língua', () => {
    const saida = [
      'Novas conexões serão lembradas.',
      '',
      'Status       Local     Remoto                    Rede',
      '-------------------------------------------------------------------------------',
      'OK           Z:        \\\\servidor-inventado\\notas Microsoft Windows Network',
      'Indisponível Y:        \\\\outro-inventado\\xml     Microsoft Windows Network',
      '             \\\\servidor-inventado\\IPC$         Microsoft Windows Network',
      'Comando concluído com êxito.',
    ].join('\r\n');
    assert.deepEqual(lerSaidaNetUse(saida), ['Y', 'Z']);
    assert.deepEqual(
      lerSaidaNetUse('There are no entries in the list.\r\n'),
      [],
    );
  });

  it('arquivo local que demora mais que o prazo: lê, sem a mensagem da rede', async () => {
    const texto = '<nfeProc/>';
    const disco: Disco = {
      tamanho: () => devagar(texto.length, PRAZO * 4),
      ler: async () => Buffer.from(texto),
    };
    assert.equal(await lerXmlSeguro(LOCAL, disco, PRAZO), texto);
    assert.equal(
      await problemaCaminhoSolto(
        LOCAL,
        ['.xml'],
        () => devagar({ isFile: () => true }, PRAZO * 4),
        PRAZO,
      ),
      null,
    );
    assert.equal(
      await situacaoAtePrazo(LOCAL, PRAZO, () =>
        devagar({ isFile: () => true }, PRAZO * 4),
      ),
      'arquivo',
    );
  });

  it('unidade mapeada de rede que não responde: mensagem no prazo', async () => {
    const disco: Disco = {
      tamanho: () => nunca(),
      ler: async () => new Uint8Array(),
    };
    const { ms } = await cronometro(() =>
      assert.rejects(
        lerXmlSeguro(MAPEADA, disco, PRAZO),
        (e: unknown) =>
          e instanceof ArquivoRecusadoError &&
          e.message === mensagemSemResposta(MAPEADA),
      ),
    );
    assert.ok(ms < 1000, `levou ${ms} ms`);
    assert.equal(
      await situacaoAtePrazo(MAPEADA, PRAZO, () => nunca()),
      'sem-resposta',
    );
  });
});
