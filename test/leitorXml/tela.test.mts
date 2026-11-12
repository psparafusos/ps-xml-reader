// Lógica da tela do leitor genérico (sem DOM): modelo da árvore, busca no
// texto, conta da rolagem virtual e os textos da barra. Dados inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buscarNoTexto, ocorrencias } from '../../src/leitorXml/buscaTexto.ts';
import {
  avisoControles,
  avisoModoLeve,
  descreverCodificacao,
  formatarTamanho,
  mensagemErroXml,
  textoContador,
} from '../../src/leitorXml/formato.ts';
import {
  calcularJanela,
  MAXIMO_PX,
  rolagemParaLinha,
} from '../../src/leitorXml/janelaVisivel.ts';
import {
  linhasDosAchados,
  ModeloArvore,
  noNaPosicao,
  pedacosDoNo,
} from '../../src/leitorXml/modeloArvore.ts';
import { lerXml, nomeDe } from '../../src/xml/leitor.ts';

const XML = `<pedido numero="88">
  <cliente><nome>Loja Inventada</nome><cnpj>00000000000191</cnpj></cliente>
  <itens>${Array.from({ length: 5 }, (_, i) => `<item n="${i + 1}"><desc>PARAFUSO ${i + 1}</desc></item>`).join('')}</itens>
  <!-- gerado à mão -->
</pedido>`;

const arvore = lerXml(XML);

/** A lista visível como nomes (ou tipo) com a indentação. */
function lista(m: ModeloArvore): string[] {
  return m.visiveis.map(
    (no) =>
      '  '.repeat(m.nivel[no]) + (nomeDe(arvore, no) || `(${arvore.tipo[no]})`),
  );
}

describe('ModeloArvore', () => {
  it('começa só com a raiz; abrir e fechar mexem só na lista', () => {
    const m = new ModeloArvore(arvore);
    assert.deepEqual(lista(m), ['pedido']);
    const raiz = m.visiveis[0];
    assert.equal(m.expansivel(raiz), true);
    m.abrir(raiz);
    assert.deepEqual(lista(m), ['pedido', '  cliente', '  itens', '  (2)']);
    const itens = m.visiveis[2];
    m.abrir(itens);
    assert.equal(m.visiveis.length, 4 + 5);
    m.fechar(raiz);
    assert.deepEqual(lista(m), ['pedido']);
    // Reabrir lembra que itens estava aberto.
    m.abrir(raiz);
    assert.equal(m.visiveis.length, 9);
  });

  it('elemento com um só texto fica em linha e não abre', () => {
    const m = new ModeloArvore(arvore);
    const nome = arvore.nomes.indexOf('nome');
    const no = [...arvore.nome].indexOf(nome);
    assert.equal(m.emLinha(no), true);
    assert.equal(m.expansivel(no), false);
    assert.equal(
      pedacosDoNo(m, no)
        .map((p) => p.texto)
        .join(''),
      '<nome>Loja Inventada</nome>',
    );
  });

  it('abertura inicial respeita o limite de linhas e de filhos', () => {
    const m = new ModeloArvore(arvore);
    m.abrirInicial(300, 3);
    // itens tem 5 filhos (> 3): fica fechado com a contagem.
    const itens = m.visiveis.find((no) => nomeDe(arvore, no) === 'itens');
    assert.ok(itens !== undefined);
    assert.equal(m.estaAberto(itens), false);
    assert.equal(
      pedacosDoNo(m, itens)
        .map((p) => p.texto)
        .join(''),
      '<itens>  (5 itens dentro)',
    );
    const m2 = new ModeloArvore(arvore);
    m2.abrirInicial(4, 200);
    assert.ok(m2.visiveis.length <= 4);
  });

  it('mostrarNo abre o caminho até um nó fundo e dá a linha dele', () => {
    const m = new ModeloArvore(arvore);
    const pos = XML.indexOf('PARAFUSO 4');
    const texto = noNaPosicao(arvore, pos);
    const linha = m.mostrarNo(texto);
    // O texto está em linha: a linha mostrada é a do <desc>.
    assert.equal(nomeDe(arvore, m.visiveis[linha]), 'desc');
    assert.equal(arvore.pai[arvore.pai[m.visiveis[linha]]] >= 0, true);
  });

  it('recolherTudo volta para a raiz', () => {
    const m = new ModeloArvore(arvore);
    m.abrirInicial();
    m.recolherTudo();
    assert.deepEqual(lista(m), ['pedido']);
  });

  it('atributos aparecem na linha; valor longo é cortado', () => {
    const a = lerXml(`<r v="${'x'.repeat(250)}" n="1"/>`);
    const m = new ModeloArvore(a);
    const linha = pedacosDoNo(m, 0)
      .map((p) => p.texto)
      .join('');
    assert.equal(linha, `<r v="${'x'.repeat(200)}…" n="1"/>`);
  });

  it('noNaPosicao acha o nó mais fundo', () => {
    assert.equal(
      nomeDe(arvore, noNaPosicao(arvore, XML.indexOf('<cnpj>') + 2)),
      'cnpj',
    );
    assert.equal(nomeDe(arvore, noNaPosicao(arvore, 0)), 'pedido');
    // Entre dois filhos: o pai.
    assert.equal(
      nomeDe(arvore, noNaPosicao(arvore, XML.indexOf('</cliente>') + 11)),
      'pedido',
    );
  });
});

describe('linhasDosAchados', () => {
  it('achados do texto viram linhas da árvore, sem repetir e em ordem', () => {
    const m = new ModeloArvore(arvore);
    // "cliente" aparece na abertura e no fechamento: uma linha só.
    const nos = linhasDosAchados(m, buscarNoTexto(XML, 'cliente').posicoes);
    assert.deepEqual(
      nos.map((no) => nomeDe(arvore, no)),
      ['cliente'],
    );
    // "PARAFUSO" está no texto de <desc>, que fica em linha: a linha é o <desc>.
    const desc = linhasDosAchados(m, buscarNoTexto(XML, 'parafuso').posicoes);
    assert.equal(desc.length, 5);
    assert.ok(desc.every((no) => nomeDe(arvore, no) === 'desc'));
    assert.deepEqual(
      desc,
      [...desc].sort((a, b) => a - b),
    );
    // Atributo e nome de atributo.
    const n3 = linhasDosAchados(m, buscarNoTexto(XML, 'n="3"').posicoes);
    assert.deepEqual(
      n3.map((no) => nomeDe(arvore, no)),
      ['item'],
    );
  });

  it('depois de um erro de XML, o que não entrou na árvore fica de fora', () => {
    const texto = '<a><b>x</b></c><d>x</d>';
    const a = lerXml(texto);
    const m = new ModeloArvore(a);
    const nos = linhasDosAchados(m, buscarNoTexto(texto, 'x').posicoes);
    assert.deepEqual(
      nos.map((no) => nomeDe(a, no)),
      ['b'],
    );
  });
});

describe('buscarNoTexto', () => {
  it('acha sem diferenciar maiúsculas, inclusive acentos', () => {
    const r = buscarNoTexto('Comércio COMÉRCIO comércio', 'comércio');
    assert.deepEqual([...r.posicoes], [0, 9, 18]);
    assert.equal(r.truncado, false);
  });

  it('caracteres especiais são literais; termo vazio não acha nada', () => {
    assert.deepEqual([...buscarNoTexto('a.b axb (x)', '.').posicoes], [1]);
    assert.deepEqual([...buscarNoTexto('a(x)', '(x)').posicoes], [1]);
    assert.equal(buscarNoTexto('abc', '').posicoes.length, 0);
  });

  it('limite de achados', () => {
    const r = buscarNoTexto('aaaaa', 'a', 3);
    assert.equal(r.posicoes.length, 3);
    assert.equal(r.truncado, true);
  });

  it('ocorrencias dentro de uma linha', () => {
    assert.deepEqual(ocorrencias('<nome>nome</nome>', 'NOME'), [
      [1, 5],
      [6, 10],
      [12, 16],
    ]);
  });
});

describe('calcularJanela', () => {
  it('poucas linhas: rolagem normal', () => {
    const j = calcularJanela(200, 100, 1000, 20);
    assert.deepEqual(j, {
      primeira: 10,
      quantas: 6,
      topo: 200,
      alturaTotal: 20000,
    });
    assert.equal(calcularJanela(0, 100, 0, 20).quantas, 0);
  });

  it('milhões de linhas: barra proporcional até a última linha', () => {
    const n = 4_000_000;
    const inicio = calcularJanela(0, 400, n, 20);
    assert.equal(inicio.primeira, 0);
    assert.equal(inicio.alturaTotal, MAXIMO_PX);
    const fim = calcularJanela(MAXIMO_PX - 400, 400, n, 20);
    assert.equal(fim.primeira, n - 20);
    assert.equal(fim.primeira + fim.quantas, n);
  });

  it('rolagemParaLinha leva a linha para a tela, nos dois modos', () => {
    const t = rolagemParaLinha(500, 0, 100, 1000, 20, 'centro');
    assert.equal(calcularJanela(t, 100, 1000, 20).primeira, 498);
    // Já visível: não mexe.
    assert.equal(rolagemParaLinha(11, 200, 100, 1000, 20, 'perto'), 200);
    const n = 4_000_000;
    const s = rolagemParaLinha(3_000_000, 0, 400, n, 20, 'centro');
    const j = calcularJanela(s, 400, n, 20);
    assert.ok(Math.abs(j.primeira - (3_000_000 - 10)) <= 1);
  });
});

describe('textos da barra', () => {
  it('tamanho', () => {
    assert.equal(formatarTamanho(512), '512 bytes');
    assert.equal(formatarTamanho(12_600), '12,3 KB');
    assert.equal(formatarTamanho(35 * 1024 * 1024), '35 MB');
  });

  it('codificação', () => {
    assert.equal(
      descreverCodificacao({
        codificacao: 'iso-8859-1',
        origem: 'declaracao',
        declarada: 'ISO-8859-1',
      }),
      'ISO-8859-1 (declarada no arquivo)',
    );
    assert.equal(
      descreverCodificacao({
        codificacao: 'utf-8',
        origem: 'padrao',
        declarada: null,
      }),
      'UTF-8 (o arquivo não declara; é o padrão do XML)',
    );
  });

  it('modo leve só entre 20 e 100 MB', () => {
    const MB = 1024 * 1024;
    assert.equal(avisoModoLeve(20 * MB), null);
    assert.match(
      avisoModoLeve(35 * MB) ?? '',
      /^Modo leve: o arquivo tem 35 MB/,
    );
    assert.equal(avisoModoLeve(101 * MB), null);
  });

  it('erro, controles e contador', () => {
    assert.equal(
      mensagemErroXml({
        linha: 1234,
        coluna: 5,
        posicao: 0,
        motivo: 'Falta ">".',
      }),
      'O XML tem um erro na linha 1.234, coluna 5 do arquivo: Falta ">".',
    );
    assert.equal(avisoControles(0), null);
    assert.match(avisoControles(3) ?? '', /3 caracteres de controle/);
    assert.equal(textoContador(1, 5, false), '2 de 5');
    assert.equal(textoContador(0, 0, false), 'Nada encontrado');
    assert.equal(textoContador(0, 10000, true), '1 de mais de 10.000');
  });
});
