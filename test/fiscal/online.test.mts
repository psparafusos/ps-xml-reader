import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InfoDocumento } from '../../src/fiscal/documentos.ts';
import {
  ARQUIVO_TIPI,
  PAGINA_ST,
  lerCabecalhos,
  urlPermitida,
  verificarST,
  verificarTipi,
  versoesConfaz,
  type Buscar,
} from '../../src/fiscal/online.ts';

// Página inventada no formato da do CONFAZ: links "Versão 00XX" com o .xlsx,
// a vigência depois do link, um link vazio no meio e a 0021 e a 0020 com a
// mesma vigência (a comparação é pelo número).
const BASE =
  'https://www.confaz.fazenda.gov.br/legislacao/portal-nacional-da-substituicao-tributaria/sergipe-1';
const pagina = `<html><body><div>
<p><b><a class="internal-link" href="${BASE}/portal-st-se-v0020.xlsx">Versão 0020</a> - Vigência a partir de 01.02.2026</b></p>
<p><b><a href="${BASE}/vazio.xlsx"></a><a class="internal-link" href="${BASE}/portal-st-se-v0021-1.xlsx"><strong>Versão 0021</strong></a> - <b>Vigência a partir de 01.02.2026</b></b></p>
<p><a href="${BASE}/portal-st-se-v0019.xlsx">Versão 0019</a> - Vigência a partir de 01.07.2023</p>
<p><a href="/outra-pagina">Versão do portal</a></p>
</div></body></html>`;

const agora = new Date('2026-11-03T12:00:00Z');

function info(p: Partial<InfoDocumento>): InfoDocumento {
  return {
    formato: 2,
    tipo: 'st',
    arquivo: 'x.xlsx',
    tipoArquivo: 'xlsx',
    tamanhoArquivo: 1000,
    importadoEm: agora.toISOString(),
    versao: '',
    vigencia: '',
    quantidades: [],
    naoEntendidos: [],
    totalNaoEntendidos: 0,
    observacoes: [],
    servidor: null,
    ...p,
  };
}

/** Busca falsa: registra os pedidos e devolve a resposta dada. */
function falsa(resposta: () => Response | Promise<Response>) {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const buscar: Buscar = async (url, init) => {
    pedidos.push({ url, init });
    return resposta();
  };
  return { buscar, pedidos };
}

describe('online: página do CONFAZ', () => {
  it('acha as versões, o link e a vigência', () => {
    const v = versoesConfaz(pagina);
    assert.deepEqual(
      v.map((x) => [x.texto, x.vigencia]),
      [
        ['0020', '01.02.2026'],
        ['0021', '01.02.2026'],
        ['0019', '01.07.2023'],
      ],
    );
    assert.equal(v[1].url, `${BASE}/portal-st-se-v0021-1.xlsx`);
  });

  it('versão nova pelo número, mesmo com a mesma vigência', async () => {
    const { buscar, pedidos } = falsa(() => new Response(pagina));
    const r = await verificarST(info({ versao: '0020' }), buscar, agora);
    assert.equal(r.estado, 'nova');
    assert.equal(r.disponivel?.versao, '0021');
    assert.equal(r.disponivel?.url, `${BASE}/portal-st-se-v0021-1.xlsx`);
    assert.match(r.detalhe, /0021.*carregada: 0020/);
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].url, PAGINA_ST);
    assert.ok(pedidos[0].init.signal, 'com tempo limite');
  });

  it('atualizado quando a carregada é a maior', async () => {
    const { buscar } = falsa(() => new Response(pagina));
    const r = await verificarST(info({ versao: '0021' }), buscar, agora);
    assert.equal(r.estado, 'atualizado');
    assert.equal(r.disponivel, null);
  });

  it('sem planilha carregada: mostra a disponível', async () => {
    const { buscar } = falsa(() => new Response(pagina));
    const r = await verificarST(null, buscar, agora);
    assert.equal(r.estado, 'nova');
    assert.equal(r.disponivel?.versao, '0021');
  });

  it('sem conexão e tempo esgotado viram "sem conexão"', async () => {
    const semRede: Buscar = async () => {
      throw new TypeError('fetch failed');
    };
    assert.equal(
      (await verificarST(info({ versao: '0019' }), semRede, agora)).estado,
      'sem-conexao',
    );
    const lenta: Buscar = (_url, init) =>
      new Promise((_, rejeitar) =>
        init.signal?.addEventListener('abort', () =>
          rejeitar(init.signal?.reason),
        ),
      );
    const r = await verificarTipi(info({ tipo: 'tipi' }), lenta, agora, 20);
    assert.equal(r.estado, 'sem-conexao');
  });

  it('página sem versões ou com erro: "não consegui verificar" com a página', async () => {
    const vazia = falsa(() => new Response('<html>manutenção</html>'));
    const r = await verificarST(info({ versao: '0019' }), vazia.buscar, agora);
    assert.equal(r.estado, 'nao-verificou');
    assert.equal(r.pagina, PAGINA_ST);
    const erro = falsa(() => new Response('', { status: 500 }));
    assert.equal(
      (await verificarST(info({ versao: '0019' }), erro.buscar, agora)).estado,
      'nao-verificou',
    );
  });

  it('só baixa do CONFAZ (ST) e do gov.br (TIPI), por https', () => {
    assert.equal(urlPermitida('st', `${BASE}/a.xlsx`), true);
    assert.equal(
      urlPermitida('st', 'http://www.confaz.fazenda.gov.br/a.xlsx'),
      false,
    );
    assert.equal(urlPermitida('st', 'https://exemplo.com/a.xlsx'), false);
    assert.equal(urlPermitida('tipi', ARQUIVO_TIPI), true);
    assert.equal(urlPermitida('tipi', `${BASE}/a.xlsx`), false);
  });
});

describe('online: TIPI pelos cabeçalhos', () => {
  const parcial = (total: number, data?: string) => () =>
    new Response('P', {
      status: 206,
      headers: {
        'content-range': `bytes 0-0/${total}`,
        'content-length': '1',
        ...(data ? { 'last-modified': data } : {}),
      },
    });

  it('lê o tamanho do Content-Range e a data do Last-Modified', () => {
    const h = new Headers({
      'content-range': 'bytes 0-0/673645',
      'content-length': '1',
      'last-modified': 'Mon, 02 Feb 2026 10:00:00 GMT',
    });
    assert.deepEqual(lerCabecalhos(h), {
      tamanho: 673645,
      data: '2026-02-02T10:00:00.000Z',
    });
    assert.deepEqual(lerCabecalhos(new Headers({ 'content-length': '50' })), {
      tamanho: 50,
      data: null,
    });
  });

  it('pede só o primeiro byte, numa requisição', async () => {
    const { buscar, pedidos } = falsa(parcial(673645));
    const r = await verificarTipi(
      info({ tipo: 'tipi', tamanhoArquivo: 673645 }),
      buscar,
      agora,
    );
    assert.equal(r.estado, 'atualizado');
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].url, ARQUIVO_TIPI);
    assert.deepEqual(pedidos[0].init.headers, { Range: 'bytes=0-0' });
  });

  it('tamanho diferente do guardado: versão nova', async () => {
    const { buscar } = falsa(parcial(700000));
    const r = await verificarTipi(
      info({ tipo: 'tipi', tamanhoArquivo: 673645 }),
      buscar,
      agora,
    );
    assert.equal(r.estado, 'nova');
    assert.equal(r.disponivel?.tamanho, 700000);
  });

  it('compara a data quando o servidor informa e ela foi guardada', async () => {
    const { buscar } = falsa(parcial(673645, 'Tue, 03 Feb 2026 10:00:00 GMT'));
    const r = await verificarTipi(
      info({
        tipo: 'tipi',
        servidor: {
          url: ARQUIVO_TIPI,
          data: '2026-02-02T10:00:00.000Z',
          tamanho: 673645,
          versao: null,
          baixadoEm: agora.toISOString(),
        },
      }),
      buscar,
      agora,
    );
    assert.equal(r.estado, 'nova');
  });

  it('TIPI do texto do PDF: não dá para comparar', async () => {
    const { buscar } = falsa(parcial(673645));
    const r = await verificarTipi(
      info({ tipo: 'tipi', tipoArquivo: 'txt', tamanhoArquivo: 2_000_000 }),
      buscar,
      agora,
    );
    assert.equal(r.estado, 'nao-verificou');
    assert.match(r.detalhe, /^Não consegui verificar a TIPI/);
    assert.match(r.pagina, /receitafederal/);
  });

  it('servidor sem tamanho nem data: "não consegui verificar a TIPI"', async () => {
    const { buscar } = falsa(() => new Response('x', { status: 200 }));
    // Resposta sem content-length (corpo em streaming) e sem data.
    const r = await verificarTipi(
      info({ tipo: 'tipi' }),
      async (u, i) => {
        const resp = await buscar(u, i);
        return new Response(resp.body, { status: 200, headers: {} });
      },
      agora,
    );
    assert.equal(r.estado, 'nao-verificou');
    assert.equal(r.detalhe, 'Não consegui verificar a TIPI.');
  });
});
