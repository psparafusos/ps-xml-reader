// Fluxo do botão Atualizar sem rede: o "download" é um arquivo local servido
// por uma função de busca falsa, e a importação passa pela pasta temporária.
// Planilhas inventadas; a pasta do teste (os.tmpdir()/atualizar-*) é apagada
// no fim.
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  importarDocumento,
  importarSeLeituraPassar,
  lerDocumentos,
} from '../../src/fiscal/base.ts';
import { ErroFormato } from '../../src/fiscal/documentos.ts';
import { baixarArquivo, type Buscar } from '../../src/fiscal/online.ts';
import { xlsx } from './fixtures/xlsx.mts';

const raiz = mkdtempSync(join(tmpdir(), 'atualizar-'));
after(() => rmSync(raiz, { recursive: true, force: true }));

const BASE =
  'https://www.confaz.fazenda.gov.br/legislacao/portal-nacional-da-substituicao-tributaria/sergipe-1';

function planilhaST(versao: string): Uint8Array {
  return xlsx('Tintas', [
    [`Versão: ${versao}`],
    ['Produção de efeitos a partir de 01/02/2026'],
    ['ANEXO XXIII - SEGMENTO: TINTAS E VERNIZES'],
    [
      'ITEM',
      'CEST',
      'NCM/SH',
      'Descrição',
      'MVA-ST Alíquota de 4%',
      'MVA-ST Alíquota de 7%',
      'MVA-ST Alíquota de 12%',
      'MVA-ST Alíquota de 19%',
    ],
    [1, '24.001.00', '3208', 'Tinta inventada', 0.6, 0.55, 0.48, 0.35],
  ]);
}

// "Site" local: cada nome de arquivo no endereço é um arquivo da pasta.
const site = join(raiz, 'site');
const pasta = join(raiz, 'documentos');
mkdirSync(site, { recursive: true });
writeFileSync(join(site, 'st-v0020.xlsx'), planilhaST('0020'));
// Planilha sem o cabeçalho ITEM e CEST: formato não reconhecido.
writeFileSync(
  join(site, 'st-v0021-quebrada.xlsx'),
  xlsx('Outra', [['Planilha de outro assunto'], ['a', 'b', 'c']]),
);
// Nem é .xlsx.
writeFileSync(join(site, 'st-v0022.xlsx'), 'texto, não planilha');

const pedidos: string[] = [];
const buscarLocal: Buscar = async (url) => {
  pedidos.push(url);
  const nome = new URL(url).pathname.split('/').pop() ?? '';
  let dados: Uint8Array;
  try {
    dados = new Uint8Array(readFileSync(join(site, nome)));
  } catch {
    return new Response('não encontrado', { status: 404 });
  }
  return new Response(dados, {
    status: 200,
    headers: {
      'content-length': String(dados.length),
      'last-modified': 'Mon, 02 Feb 2026 10:00:00 GMT',
    },
  });
};

/** O mesmo caminho do processo principal: baixa e importa pela pasta temporária. */
async function atualizar(nome: string) {
  const url = `${BASE}/${nome}`;
  const progresso: [number, number | null][] = [];
  const b = await baixarArquivo('st', url, buscarLocal, (r, t) =>
    progresso.push([r, t]),
  );
  const info = importarSeLeituraPassar(
    'st',
    b.dados,
    b.nome,
    pasta,
    new Date('2026-11-05T12:00:00Z'),
    {
      url,
      data: b.data,
      tamanho: b.dados.length,
      versao: null,
      baixadoEm: '2026-11-05T12:00:00.000Z',
    },
  );
  return { info, progresso };
}

const sobras = () => readdirSync(pasta).filter((n) => n.startsWith('.'));

describe('Atualizar: download simulado e importação pela pasta temporária', () => {
  // Documento carregado antes: a v0019.
  const anterior = importarDocumento(
    'st',
    planilhaST('0019'),
    'st-v0019.xlsx',
    pasta,
    new Date('2026-11-01T12:00:00Z'),
  );
  const dadosAntes = () => readFileSync(join(pasta, 'st.json'), 'utf8');
  const jsonAnterior = dadosAntes();

  it('leitura que falha (formato não reconhecido) mantém o anterior', async () => {
    await assert.rejects(atualizar('st-v0021-quebrada.xlsx'), ErroFormato);
    assert.deepEqual(lerDocumentos(pasta).st, anterior);
    assert.equal(dadosAntes(), jsonAnterior);
    assert.deepEqual(sobras(), [], 'a pasta temporária foi apagada');
  });

  it('arquivo que nem é planilha também mantém o anterior', async () => {
    await assert.rejects(atualizar('st-v0022.xlsx'), ErroFormato);
    assert.equal(lerDocumentos(pasta).st?.versao, '0019');
    assert.deepEqual(sobras(), []);
  });

  it('download que falha (404) não toca no carregado', async () => {
    await assert.rejects(atualizar('nao-existe.xlsx'), /respondeu 404/);
    assert.deepEqual(lerDocumentos(pasta).st, anterior);
  });

  it('endereço fora do site oficial nem é pedido', async () => {
    const antes = pedidos.length;
    await assert.rejects(
      baixarArquivo(
        'st',
        'http://www.confaz.fazenda.gov.br/x.xlsx',
        buscarLocal,
      ),
      /fora do site oficial/,
    );
    await assert.rejects(
      baixarArquivo('st', 'https://exemplo.invalid/st.xlsx', buscarLocal),
      /fora do site oficial/,
    );
    assert.equal(pedidos.length, antes);
  });

  it('leitura que passa troca pelo novo, com o progresso até o fim', async () => {
    const { info, progresso } = await atualizar('st-v0020.xlsx');
    const tamanho = readFileSync(join(site, 'st-v0020.xlsx')).length;
    assert.equal(info.versao, '0020');
    assert.equal(info.arquivo, 'st-v0020.xlsx');
    assert.equal(info.servidor?.data, '2026-02-02T10:00:00.000Z');
    assert.deepEqual(lerDocumentos(pasta).st, info);
    assert.notEqual(dadosAntes(), jsonAnterior);
    assert.deepEqual(progresso[0], [0, tamanho]);
    assert.deepEqual(progresso.at(-1), [tamanho, tamanho]);
    assert.deepEqual(sobras(), []);
  });
});
