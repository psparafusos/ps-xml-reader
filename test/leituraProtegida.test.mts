// Regras da leitura protegida (src/nfe/leituraProtegida.ts): o que abre em
// leitura (perfil e marca da internet), o que pode ser feito nela e os
// textos combinados. Mais a leitura da marca Zone.Identifier com disco falso.
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
  AVISO_SAIR,
  MENSAGEM_PSXML_INTERNET,
  MENSAGEM_RECUSA_GRAVAR,
  ROTULO_USAR_CONFERENCIA,
  TEXTO_FAIXA,
  leituraAoAbrir,
  pedeAviso,
  zonaDaInternet,
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
