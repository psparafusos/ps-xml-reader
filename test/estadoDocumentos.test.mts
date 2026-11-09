import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InfoDocumento } from '../src/fiscal/documentos.ts';
import type { ResultadoVerificacao } from '../src/fiscal/online.ts';
import {
  VISUAL_ESTADO,
  estadoDaCor,
  linhasDocumentos,
  pastilhasDocumentos,
  seloVisivel,
  textoVersaoNova,
} from '../src/estadoDocumentos.ts';
import { ICONE_SINAL, ICONES } from '../src/icones.ts';

// Dados inventados: nenhuma planilha real.
const info = (p: Partial<InfoDocumento> = {}): InfoDocumento => ({
  formato: 2,
  tipo: 'st',
  arquivo: 'st-inventada-v0019.xlsx',
  tipoArquivo: 'xlsx',
  tamanhoArquivo: 1000,
  importadoEm: '2026-11-04T12:00:00.000Z',
  versao: '0019',
  vigencia: '01/07/2023',
  quantidades: [],
  naoEntendidos: [],
  totalNaoEntendidos: 0,
  observacoes: [],
  servidor: null,
  ...p,
});

const nova: ResultadoVerificacao = {
  tipo: 'st',
  estado: 'nova',
  detalhe: 'Versão nova disponível: 0020.',
  pagina: 'https://www.confaz.fazenda.gov.br/x',
  disponivel: {
    url: 'https://www.confaz.fazenda.gov.br/x/st-v0020.xlsx',
    versao: '0020',
    vigencia: '01.02.2026',
    data: null,
    tamanho: null,
  },
  verificadoEm: '2026-11-05T10:00:00.000Z',
};

function estado(p: Partial<EstadoDocumentos> = {}): EstadoDocumentos {
  return {
    st: null,
    tipi: null,
    combustiveis: null,
    leitura: { st: null, tipi: null, combustiveis: null },
    recusado: { st: false, tipi: false, combustiveis: false },
    preferencias: { verificacaoOnline: false, verificarAoAbrir: false },
    verificacao: { st: null, tipi: null },
    verificando: false,
    stSemProtocolos: false,
    decisoes: [],
    ...p,
  };
}

describe('estado dos documentos: mapa para ícone e cor', () => {
  it('cada estado usa o ícone de estado do app', () => {
    // Os mesmos ícones do painel de conferência: faltando é o x vermelho
    // (erro), opcional o círculo vazado.
    assert.deepEqual(VISUAL_ESTADO, {
      ok: 'ok',
      aviso: 'aviso',
      faltando: 'erro',
      opcional: 'opcional',
    });
  });

  it('os ícones de estado existem em icones.ts com a forma certa', () => {
    const circulo = 'M22 12a10 10 0 1 1-20 0a10 10 0 0 1 20 0z';
    assert.deepEqual(ICONE_SINAL, {
      ok: 'estadoOk',
      info: 'estadoInfo',
      aviso: 'estadoAviso',
      erro: 'estadoErro',
      opcional: 'estadoOpcional',
    });
    // Check, i e x no mesmo círculo: o círculo primeiro, a marca depois.
    assert.equal(ICONES.estadoOk[0], circulo);
    assert.equal(ICONES.estadoOk.length, 2);
    assert.equal(ICONES.estadoInfo[0], circulo);
    assert.equal(ICONES.estadoInfo.length, 3);
    assert.equal(ICONES.estadoErro[0], circulo);
    assert.equal(ICONES.estadoErro.length, 3);
    assert.deepEqual(ICONES.estadoOpcional, [circulo]);
    // Triângulo: começa no alto (12, ~4) e fecha.
    assert.match(ICONES.estadoAviso[0], /^M10\.3 4\.2.*z$/);
    assert.equal(ICONES.estadoAviso.length, 3);
  });

  it('a marca fica centrada no círculo', () => {
    // Caixa dos pontos de cada marca (só M, L, l e v): centro em x = 12 e
    // y = 12, com até 0,4 de folga no vertical (o check desce um pouco
    // para parecer no meio).
    const pontos = (d: string): [number, number][] => {
      const ps: [number, number][] = [];
      let x = 0;
      let y = 0;
      for (const [, cmd, args] of d.matchAll(/([MLlv])([^MLlv]*)/g)) {
        // Números do SVG: "3 3 6-6" são quatro (o sinal separa).
        const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        if (cmd === 'v') {
          y += n[0];
          ps.push([x, y]);
          continue;
        }
        for (let i = 0; i < n.length; i += 2) {
          x = cmd === 'l' ? x + n[i] : n[i];
          y = cmd === 'l' ? y + n[i + 1] : n[i + 1];
          ps.push([x, y]);
        }
      }
      return ps;
    };
    for (const nome of ['estadoOk', 'estadoInfo', 'estadoErro'] as const) {
      const ps = ICONES[nome].slice(1).flatMap(pontos);
      const xs = ps.map((p) => p[0]);
      const ys = ps.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      assert.ok(Math.abs(cx - 12) <= 0.05, `${nome}: x ${cx}`);
      assert.ok(Math.abs(cy - 12) <= 0.4, `${nome}: y ${cy}`);
    }
  });

  it('as cores do semáforo viram estados', () => {
    assert.equal(estadoDaCor('verde'), 'ok');
    assert.equal(estadoDaCor('amarela'), 'aviso');
    assert.equal(estadoDaCor('vermelha'), 'faltando');
    assert.equal(estadoDaCor('neutra'), 'opcional');
  });
});

describe('estado dos documentos: linhas da tela inicial', () => {
  it('um ok com versão nova, um faltando, um opcional vazio', () => {
    const e = estado({
      st: info(),
      preferencias: { verificacaoOnline: true, verificarAoAbrir: false },
      verificacao: { st: nova, tipi: null },
    });
    assert.deepEqual(linhasDocumentos(e), [
      {
        tipo: 'st',
        nome: 'Planilha de ST de Sergipe',
        estado: 'aviso',
        situacao: 'v0020 disponível, vigência 01/02/2026',
        detalhe: 'Versão 0019, vigência a partir de 01/07/2023',
        versaoNova: true,
      },
      {
        tipo: 'tipi',
        nome: 'TIPI',
        estado: 'faltando',
        situacao: 'Faltando',
        detalhe: '',
        versaoNova: false,
      },
      {
        tipo: 'combustiveis',
        nome: 'Combustíveis e lubrificantes (Apêndice XIV)',
        estado: 'opcional',
        situacao: 'Opcional, não carregado',
        detalhe: '',
        versaoNova: false,
      },
    ]);
  });

  it('com a verificação desligada, a versão nova não aparece', () => {
    const e = estado({
      st: info(),
      verificacao: { st: nova, tipi: null },
    });
    const [st] = linhasDocumentos(e);
    assert.equal(st.estado, 'ok');
    assert.equal(st.versaoNova, false);
    assert.equal(textoVersaoNova('st', e), null);
  });

  it('problemas de leitura deixam em aviso', () => {
    const e = estado({
      tipi: info({ tipo: 'tipi', versao: '2022', vigencia: '' }),
      leitura: {
        st: null,
        tipi: {
          versao: 1,
          tipo: 'tipi',
          arquivo: 'x',
          importadoEm: '2026-11-04T12:00:00.000Z',
          segmentosIncompletos: [],
          problemas: [],
          totalProblemas: 3,
          ignorados: [],
          observacoes: [],
        },
        combustiveis: null,
      },
    });
    assert.deepEqual(seloVisivel('tipi', e), {
      estado: 'aviso',
      texto: '3 problemas de leitura',
    });
    assert.equal(linhasDocumentos(e)[1].detalhe, 'TIPI 2022');
  });

  it('opcional recusado vira faltando (arquivo incompatível)', () => {
    const e = estado({
      recusado: { st: false, tipi: false, combustiveis: true },
    });
    assert.deepEqual(seloVisivel('combustiveis', e), {
      estado: 'faltando',
      texto: 'Arquivo incompatível',
    });
  });
});

describe('estado dos documentos: pastilhas da barra', () => {
  it('ST e TIPI sempre; combustíveis só carregado', () => {
    assert.deepEqual(
      pastilhasDocumentos(estado({ st: info() })).map((p) => [
        p.estado,
        p.texto,
      ]),
      [
        ['ok', 'ST ok'],
        ['faltando', 'TIPI falta'],
      ],
    );
    const comComb = pastilhasDocumentos(
      estado({
        st: info(),
        tipi: info({ tipo: 'tipi' }),
        combustiveis: info({ tipo: 'combustiveis' }),
      }),
    );
    assert.deepEqual(
      comComb.map((p) => p.texto),
      ['ST ok', 'TIPI ok', 'Combustíveis ok'],
    );
  });
});

describe('estado dos documentos: ST para reimportar', () => {
  // Planilha importada antes da leitura das colunas de estados.
  const e = estado({
    st: info(),
    tipi: info({ tipo: 'tipi' }),
    stSemProtocolos: true,
  });

  it('o selo, a linha e a pastilha mostram o aviso', () => {
    assert.deepEqual(seloVisivel('st', e), {
      estado: 'aviso',
      texto: 'Reimportar',
    });
    const st = linhasDocumentos(e)[0];
    assert.equal(st.estado, 'aviso');
    assert.equal(st.situacao, 'Reimportar');
    assert.deepEqual(
      pastilhasDocumentos(e).map((p) => [p.estado, p.texto]),
      [
        ['aviso', 'ST reimportar'],
        ['ok', 'TIPI ok'],
      ],
    );
  });

  it('com versão nova, o selo segue pedindo para reimportar', () => {
    const comNova = estado({
      ...e,
      preferencias: { verificacaoOnline: true, verificarAoAbrir: false },
      verificacao: { st: nova, tipi: null },
    });
    const st = linhasDocumentos(comNova)[0];
    assert.equal(st.situacao, 'Reimportar');
    assert.equal(st.versaoNova, true);
  });

  it('sem planilha de ST, nada a reimportar', () => {
    assert.equal(
      seloVisivel('st', estado({ stSemProtocolos: true })).texto,
      'Faltando',
    );
  });
});
