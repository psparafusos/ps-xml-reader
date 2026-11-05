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
import { ICONES } from '../src/icones.ts';

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
  it('cada estado tem o seu ícone e a sua cor', () => {
    assert.deepEqual(VISUAL_ESTADO, {
      ok: { icone: 'estadoOk', cor: 'var(--semaforo-verde)' },
      aviso: { icone: 'estadoAviso', cor: 'var(--semaforo-amarelo)' },
      faltando: { icone: 'estadoFaltando', cor: 'var(--semaforo-vermelho)' },
      opcional: { icone: 'estadoOpcional', cor: 'var(--cor-icone)' },
    });
  });

  it('os ícones existem em icones.ts com a forma certa', () => {
    const circulo = 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z';
    // Check em círculo, x em círculo, círculo vazado: o círculo primeiro.
    assert.equal(ICONES.estadoOk[0], circulo);
    assert.equal(ICONES.estadoOk.length, 2);
    assert.equal(ICONES.estadoFaltando[0], circulo);
    assert.equal(ICONES.estadoFaltando.length, 3);
    assert.deepEqual(ICONES.estadoOpcional, [circulo]);
    // Triângulo: começa no alto (12, ~4) e fecha.
    assert.match(ICONES.estadoAviso[0], /^M10\.3 4\.2.*z$/);
    assert.equal(ICONES.estadoAviso.length, 3);
    for (const v of Object.values(VISUAL_ESTADO))
      assert.ok(v.icone in ICONES, v.icone);
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
