// O que o serviço de leitura pesada executa (sem processo filho): a planilha
// lida pelo módulo novo dá o mesmo que a importação de antes, o resultado
// atravessa o structuredClone (como no postMessage), e a NF-e só vai para o
// serviço acima de 5 MB. Dados inventados.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  gravarDocumento,
  importarDocumento,
  lerDocumentos,
} from '../../src/fiscal/base.ts';
import { lerPlanilha } from '../../src/fiscal/leituraPlanilha.ts';
import { ArquivoRecusadoError } from '../../src/seguranca/xml.ts';
import { LIMITE_NFE_NO_PRINCIPAL, lerNfe } from '../../src/servico/nfe.ts';
import { resultadoValido } from '../../src/servico/protocolo.ts';
import type { Desfecho } from '../../src/servico/supervisor.ts';
import { executarTarefa } from '../../src/servico/tarefas.ts';
import { xlsx } from '../fiscal/fixtures/xlsx.mts';

const pasta = mkdtempSync(join(tmpdir(), 'servico-tarefas-'));
after(() => rmSync(pasta, { recursive: true, force: true }));

const planilhaST = xlsx('Tintas', [
  ['Versão: 3.1'],
  ['Produção de efeitos a partir de 01/07/2023'],
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
  [1, '24.001.00', '3208  3209', 'Tintas, vernizes', 0.62, 0.5694, 0.485, 0.35],
]);
const textoTipi = new Uint8Array(
  readFileSync(new URL('../fiscal/fixtures/tipi-trecho.txt', import.meta.url)),
);
const agora = new Date('2026-11-10T12:00:00Z');

describe('lerPlanilha', () => {
  it('ST: relatório, preparado e gravação iguais à importação de antes', () => {
    const l = lerPlanilha('st', planilhaST);
    assert.equal(l.reconhecido, 'st');
    assert.ok(l.relatorio);
    assert.equal(l.erroPreparo, null);
    assert.ok(l.preparado);
    // Atravessa o postMessage sem perder nada.
    const copia = structuredClone(l);
    assert.deepEqual(copia, l);
    assert.equal(
      resultadoValido(
        { tipo: 'planilha', documento: 'st', dados: planilhaST },
        copia,
      ),
      true,
    );
    const a = gravarDocumento(
      copia.preparado!,
      'st.xlsx',
      join(pasta, 'novo'),
      agora,
    );
    const b = importarDocumento(
      'st',
      planilhaST,
      'st.xlsx',
      join(pasta, 'antigo'),
      agora,
    );
    assert.deepEqual(a, b);
    assert.deepEqual(
      readFileSync(join(pasta, 'novo', 'st.json'), 'utf8'),
      readFileSync(join(pasta, 'antigo', 'st.json'), 'utf8'),
    );
    assert.deepEqual(lerDocumentos(join(pasta, 'novo')).st, b);
  });

  it('TIPI em texto também', () => {
    const l = lerPlanilha('tipi', textoTipi);
    assert.ok(l.relatorio);
    assert.equal(l.preparado?.tipoArquivo, 'txt');
  });

  it('arquivo de outro tipo: sem relatório e sem preparado', () => {
    const l = lerPlanilha('st', textoTipi);
    assert.equal(l.relatorio, null);
    assert.equal(l.preparado, null);
    assert.equal(l.reconhecido, 'tipi');
    const lixo = lerPlanilha('combustiveis', new Uint8Array([1, 2, 3]));
    assert.equal(lixo.preparado, null);
  });

  it('pela tarefa do serviço, com a etapa anunciada', async () => {
    const etapas: string[] = [];
    const r = await executarTarefa(
      { tipo: 'planilha', documento: 'st', dados: planilhaST },
      (e) => etapas.push(e),
    );
    assert.deepEqual(etapas, ['planilha']);
    assert.ok((r as { preparado: unknown }).preparado);
  });
});

describe('lerNfe', () => {
  const MB = 1024 * 1024;
  const ok = (texto: string): Desfecho => ({
    status: 'ok',
    resultado: { ok: true, texto },
    noFilho: true,
  });

  it('até 5 MB lê no principal, como sempre', async () => {
    let noServico = 0;
    const texto = await lerNfe('C:\\n.xml', {
      tamanho: async () => LIMITE_NFE_NO_PRINCIPAL,
      lerAqui: async () => 'aqui',
      noServico: async () => {
        noServico++;
        return ok('lá');
      },
    });
    assert.equal(texto, 'aqui');
    assert.equal(noServico, 0);
  });

  it('acima de 5 MB vai para o serviço', async () => {
    const texto = await lerNfe('C:\\n.xml', {
      tamanho: async () => 6 * MB,
      lerAqui: async () => 'aqui',
      noServico: async () => ok('lá'),
    });
    assert.equal(texto, 'lá');
  });

  it('recusas do serviço viram ArquivoRecusadoError com a mensagem', async () => {
    const grande = { tamanho: async () => 6 * MB, lerAqui: async () => '' };
    await assert.rejects(
      lerNfe('C:\\n.xml', {
        ...grande,
        noServico: async () => ({
          status: 'ok',
          resultado: { ok: false, mensagem: 'Tem DOCTYPE.' },
          noFilho: true,
        }),
      }),
      (e) => e instanceof ArquivoRecusadoError && e.message === 'Tem DOCTYPE.',
    );
    await assert.rejects(
      lerNfe('C:\\n.xml', {
        ...grande,
        noServico: async () => ({ status: 'memoria', limiteMB: 1024 }),
      }),
      (e) => e instanceof ArquivoRecusadoError && /memória/.test(e.message),
    );
  });

  it('sem saber o tamanho: a leitura de sempre (que dá a mensagem certa)', async () => {
    const texto = await lerNfe('C:\\n.xml', {
      tamanho: async () => {
        throw new Error('ENOENT');
      },
      lerAqui: async () => 'aqui',
      noServico: async () => ok('lá'),
    });
    assert.equal(texto, 'aqui');
  });
});
