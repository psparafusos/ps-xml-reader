import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InfoDocumento } from '../../src/fiscal/documentos.ts';
import {
  ARQUIVO_TIPI,
  LIMITE_PAGINA,
  MENSAGEM_REDIRECIONAMENTO,
  PAGINA_ST,
  RedirecionamentoError,
  baixarArquivo,
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

// T16 do plano de segurança: o servidor oficial manda para outro endereço.
// As buscas usam redirect: 'manual'; um 3xx (ou uma resposta que veio de outro
// endereço) não é seguido e nada é lido dele.
describe('online: redirecionamento não é seguido (T16)', () => {
  const PARA_FORA = 'https://exemplo.invalid/planilha.xlsx';
  const redirecionar = () =>
    new Response(null, { status: 302, headers: { location: PARA_FORA } });
  /** Resposta 200 que diz ter vindo de outro endereço (redirect seguido). */
  const seguida = () => {
    const r = new Response('<html>outra coisa</html>');
    Object.defineProperty(r, 'redirected', { value: true });
    Object.defineProperty(r, 'url', { value: PARA_FORA });
    return r;
  };

  it('as três buscas pedem redirect: manual', async () => {
    const st = falsa(() => new Response(pagina));
    await verificarST(info({ versao: '0019' }), st.buscar, agora);
    const tipi = falsa(
      () =>
        new Response('x', {
          status: 206,
          headers: { 'content-range': 'bytes 0-0/10' },
        }),
    );
    await verificarTipi(info({ tipo: 'tipi' }), tipi.buscar, agora);
    const baixar = falsa(() => new Response(new Uint8Array([1, 2, 3])));
    await baixarArquivo(
      'st',
      `${BASE}/portal-st-se-v0021-1.xlsx`,
      baixar.buscar,
    );
    for (const p of [...st.pedidos, ...tipi.pedidos, ...baixar.pedidos])
      assert.equal(p.init.redirect, 'manual', p.url);
  });

  it('download: 302 para outro domínio vira a mensagem e nada é baixado', async () => {
    for (const resposta of [redirecionar, seguida]) {
      const b = falsa(resposta);
      await assert.rejects(
        baixarArquivo('st', `${BASE}/portal-st-se-v0021-1.xlsx`, b.buscar),
        (e: unknown) =>
          e instanceof RedirecionamentoError &&
          e.message ===
            'O site oficial redirecionou para outro endereço; nada foi baixado.',
      );
      assert.equal(b.pedidos.length, 1, 'só o pedido ao site oficial');
    }
  });

  it('verificação da ST e da TIPI: redirecionamento não verifica', async () => {
    for (const resposta of [redirecionar, seguida]) {
      const st = await verificarST(
        info({ versao: '0019' }),
        falsa(resposta).buscar,
        agora,
      );
      assert.equal(st.estado, 'nao-verificou');
      assert.equal(st.detalhe, MENSAGEM_REDIRECIONAMENTO);
      assert.equal(st.disponivel, null);
      const tipi = await verificarTipi(
        info({ tipo: 'tipi' }),
        falsa(resposta).buscar,
        agora,
      );
      assert.equal(tipi.estado, 'nao-verificou');
      assert.equal(tipi.detalhe, MENSAGEM_REDIRECIONAMENTO);
    }
  });

  it('página do CONFAZ maior que 5 MB: não lê o resto', async () => {
    assert.equal(LIMITE_PAGINA, 5 * 1024 * 1024);
    // Sem content-length: o limite vale durante a leitura.
    let entregues = 0;
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        entregues++;
        c.enqueue(new Uint8Array(1024 * 1024).fill(0x20));
        if (entregues > 50) c.close();
      },
    });
    const r = await verificarST(
      info({ versao: '0019' }),
      falsa(() => new Response(corpo)).buscar,
      agora,
    );
    assert.equal(r.estado, 'nao-verificou');
    assert.equal(
      r.detalhe,
      'Não consegui verificar a planilha de ST: a página do CONFAZ passa de 5 MB.',
    );
    assert.ok(entregues <= 7, `leu ${entregues} MB`);
    // Com content-length declarado acima do limite: nem começa a ler.
    const declarada = await verificarST(
      info({ versao: '0019' }),
      falsa(
        () =>
          new Response('x', {
            headers: { 'content-length': String(6 * 1024 * 1024) },
          }),
      ).buscar,
      agora,
    );
    assert.equal(declarada.estado, 'nao-verificou');
  });
});
