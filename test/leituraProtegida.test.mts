// Regras da leitura protegida (src/nfe/leituraProtegida.ts): o que abre em
// leitura (perfil e marca da internet), o que pode ser feito nela e os
// textos combinados. Mais a leitura da marca Zone.Identifier com disco falso,
// as folhas do DANFE e a orientação da Conferência na leitura.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ferramentasPadrao,
  lerFerramentas,
  moverFerramenta,
  validarFerramentasPorPerfil,
} from '../src/nfe/ferramentasPerfil.ts';
import { veioDaInternet } from '../src/seguranca/arquivo.ts';
import {
  ARRANJOS_FOLHAS,
  AVISO_SAIR,
  MENSAGEM_PSXML_INTERNET,
  MENSAGEM_RECUSA_GRAVAR,
  ROTULO_FOLHAS,
  ROTULO_USAR_CONFERENCIA,
  TEXTO_FAIXA,
  ZOOM_LARGURA_MAX,
  ZOOM_LARGURA_MIN,
  leituraAoAbrir,
  orientacaoDaFolha,
  pedeAviso,
  zonaDaInternet,
  zoomParaLargura,
  type AcaoNota,
} from '../src/nfe/leituraProtegida.ts';

const SO_VER: AcaoNota[] = [
  'trocar-modo',
  'perfil',
  'zoom',
  'copiar',
  'ordenar',
  'imprimir',
  'salvar-pdf',
];
const EDITAM: AcaoNota[] = [
  'anotar',
  'editar-colunas',
  'salvar-psxml',
  'salvar-copia',
  'ferramenta',
  'usar-conferencia',
];

describe('leitura protegida: regras', () => {
  it('NF-e segue o "Abrir notas em" do perfil (padrão: leitura protegida)', () => {
    const nfe = { copiaEditada: false, daInternet: false } as const;
    assert.equal(leituraAoAbrir({ ...nfe, abrirEm: 'leitura' }), 'protegida');
    assert.equal(leituraAoAbrir({ ...nfe, abrirEm: 'conferencia' }), 'edicao');
    // A marca da internet não muda a regra do XML: vale o perfil.
    assert.equal(
      leituraAoAbrir({ ...nfe, abrirEm: 'conferencia', daInternet: true }),
      'edicao',
    );
  });

  it('.psxml abre em edição, a não ser que tenha vindo da internet', () => {
    for (const abrirEm of ['leitura', 'conferencia'] as const) {
      assert.equal(
        leituraAoAbrir({ copiaEditada: true, abrirEm, daInternet: false }),
        'edicao',
      );
      assert.equal(
        leituraAoAbrir({ copiaEditada: true, abrirEm, daInternet: true }),
        'protegida',
      );
    }
    assert.match(MENSAGEM_PSXML_INTERNET, /veio da internet/);
  });

  it('na leitura protegida, ver, imprimir e salvar PDF não pedem aviso', () => {
    for (const a of SO_VER) assert.equal(pedeAviso(a, 'protegida'), false, a);
  });

  it('na leitura protegida, toda ação que edita pede o aviso', () => {
    for (const a of EDITAM) assert.equal(pedeAviso(a, 'protegida'), true, a);
  });

  it('em edição, nada pede aviso', () => {
    for (const a of [...SO_VER, ...EDITAM])
      assert.equal(pedeAviso(a, 'edicao'), false, a);
  });

  it('textos combinados', () => {
    assert.equal(TEXTO_FAIXA, 'Leitura protegida: só visualização.');
    assert.equal(ROTULO_USAR_CONFERENCIA, 'Usar a Conferência');
    assert.equal(
      AVISO_SAIR.texto,
      'Você vai sair da leitura protegida e começar a editar. O XML original não muda; o que você fizer fica numa cópia (.psxml).',
    );
    assert.equal(AVISO_SAIR.continuar, 'Continuar');
    assert.equal(AVISO_SAIR.ficar, 'Ficar na leitura');
    assert.match(MENSAGEM_RECUSA_GRAVAR, /leitura protegida/);
  });
});

describe('leitura protegida: marca de baixado da internet', () => {
  const marca = (zona: number) =>
    `[ZoneTransfer]\r\nZoneId=${zona}\r\nReferrerUrl=https://exemplo.invalid/\r\n`;

  it('zona 3 (internet) e 4 (restritos) contam; 0 a 2 não', () => {
    assert.equal(zonaDaInternet(marca(3)), true);
    assert.equal(zonaDaInternet(marca(4)), true);
    for (const z of [0, 1, 2]) assert.equal(zonaDaInternet(marca(z)), false);
    assert.equal(zonaDaInternet('[ZoneTransfer]\r\n'), false);
    assert.equal(zonaDaInternet(''), false);
    assert.equal(zonaDaInternet('zoneid = 3'), true);
  });

  it('lê o fluxo Zone.Identifier ao lado do arquivo, em UTF-8 ou UTF-16', async () => {
    const pedidos: string[] = [];
    const disco = (conteudo: Uint8Array | null) => async (c: string) => {
      pedidos.push(c);
      if (!conteudo)
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return conteudo;
    };
    // Barras normais: o teste só confere o nome do fluxo pedido.
    assert.equal(
      await veioDaInternet(
        'C:/Baixados/nota.psxml',
        50,
        disco(Buffer.from(marca(3))),
      ),
      true,
    );
    assert.equal(pedidos[0], 'C:/Baixados/nota.psxml:Zone.Identifier');
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(marca(4), 'utf16le'),
    ]);
    assert.equal(await veioDaInternet('C:/x.psxml', 50, disco(utf16)), true);
    assert.equal(
      await veioDaInternet('C:/x.psxml', 50, disco(Buffer.from(marca(1)))),
      false,
    );
    // Sem o fluxo (arquivo local) ou sem resposta: não é da internet.
    assert.equal(await veioDaInternet('C:/x.psxml', 50, disco(null)), false);
    assert.equal(
      await veioDaInternet(
        '//fora/notas/x.psxml',
        50,
        () => new Promise(() => undefined),
      ),
      false,
    );
  });
});

describe('ferramentas por perfil: "Abrir notas em"', () => {
  it('padrão e leitura: leitura protegida; valor estranho volta ao padrão', () => {
    assert.equal(ferramentasPadrao().abrirEm, 'leitura');
    assert.equal(lerFerramentas({}).abrirEm, 'leitura');
    assert.equal(
      lerFerramentas({ abrirEm: 'conferencia' }).abrirEm,
      'conferencia',
    );
    assert.equal(lerFerramentas({ abrirEm: 'qualquer' }).abrirEm, 'leitura');
    // Mover uma ferramenta não perde a opção.
    const f = { ...ferramentasPadrao(), abrirEm: 'conferencia' as const };
    assert.equal(moverFerramenta(f, f.ordem[1].id, -1).abrirEm, 'conferencia');
  });

  it('backup: aceita leitura ou conferencia, recusa outro valor, aceita sem o campo', () => {
    const ordem = ferramentasPadrao().ordem;
    assert.equal(
      validarFerramentasPorPerfil({ p1: { ordem, abrirEm: 'conferencia' } }, [
        'p1',
      ]).p1.abrirEm,
      'conferencia',
    );
    assert.equal(
      validarFerramentasPorPerfil({ p1: { ordem } }, ['p1']).p1.abrirEm,
      'leitura',
    );
    assert.throws(
      () =>
        validarFerramentasPorPerfil({ p1: { ordem, abrirEm: 'sim' } }, ['p1']),
      /Abrir notas em/,
    );
  });
});

describe('leitura protegida: folhas e orientação (só a tela)', () => {
  it('os três arranjos, com os rótulos combinados', () => {
    assert.deepEqual(ARRANJOS_FOLHAS, ['uma', 'lado', 'largura']);
    assert.deepEqual(
      ARRANJOS_FOLHAS.map((a) => ROTULO_FOLHAS[a]),
      ['Uma', 'Lado a lado', 'Ajustar à largura'],
    );
  });

  it('ajustar à largura: a folha e o recuo cabem na área', () => {
    // Folha de 794 px com 48 px de recuo numa área de 1684 px: 2x.
    assert.equal(zoomParaLargura(1684, 794, 48), 2);
    // Arredonda para baixo: nunca passa da largura.
    const z = zoomParaLargura(1000, 794, 48);
    assert.equal(z, 1.18);
    assert.ok(z * (794 + 48) <= 1000);
  });

  it('ajustar à largura: preso entre os limites', () => {
    assert.equal(zoomParaLargura(50, 794, 48), ZOOM_LARGURA_MIN);
    assert.equal(zoomParaLargura(100000, 794, 48), ZOOM_LARGURA_MAX);
  });

  it('ajustar à largura: sem medida, fica em 100%', () => {
    assert.equal(zoomParaLargura(0, 794, 48), 1);
    assert.equal(zoomParaLargura(Number.NaN, 794, 48), 1);
    assert.equal(zoomParaLargura(1000, 0, 0), 1);
    // Recuo negativo não conta.
    assert.equal(zoomParaLargura(1588, 794, -10), 2);
  });

  it('orientação: a escolhida na faixa vale mais que a do perfil', () => {
    assert.equal(orientacaoDaFolha('paisagem', 'retrato'), 'paisagem');
    assert.equal(orientacaoDaFolha('retrato', 'automatica'), 'retrato');
  });

  it('orientação: sem escolha na faixa, a do perfil (Automática inclusive)', () => {
    assert.equal(orientacaoDaFolha(null, 'automatica'), 'automatica');
    assert.equal(orientacaoDaFolha(null, 'paisagem'), 'paisagem');
  });
});
