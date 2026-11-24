// Casos do test:janela para o DANFE da NF-e emitida em contingência: cada
// NF-e inventada test/janela/fixtures/c0*.xml (tpEmis 2 a 7) abre por duplo
// clique direto no DANFE, com os campos abaixo da chave que o MOC manda para
// o tipo de emissão, a expressão obrigatória em destaque e a entrada em
// contingência nas Informações Complementares. Com PS_JANELA_CAPTURAS, grava
// cada um em 1366 e 1920. Chamado por executar.cjs. Nenhum caso aciona
// Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');

const FORMULARIO =
  'DANFE em Contingência - impresso em decorrência de problemas técnicos';
const EPEC =
  'DANFE impresso em contingência - EPEC regularmente recebida pela Receita Federal do Brasil';
const CONSULTA_NORMAL =
  'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizada';
const CONSULTA_EPEC =
  'Consulta de autenticidade no portal da NF-e www.nfe.fazenda.gov.br/portal';

const entrada = (sigla) =>
  `Entrada em contingência: 23/11/2026 09:15:00 - Justificativa: Falha de comunicacao inventada com a SEFAZ para o teste ${sigla}`;

/** Por fixture: textos que precisam estar, que não podem estar e as barras. */
const CASOS = [
  {
    fixture: 'c02-contingencia-fs-ia.xml',
    sigla: 'FS-IA',
    expressao: FORMULARIO,
    textos: ['DADOS DA NF-E', '3521 2345 6780 0019 5000 0000 0123 4561 2239'],
    ausentes: ['PROTOCOLO DE AUTORIZAÇÃO', 'Consulta de autenticidade'],
    barras: 2,
  },
  {
    fixture: 'c03-contingencia-scan.xml',
    sigla: 'SCAN',
    expressao: null,
    textos: [
      CONSULTA_NORMAL,
      'PROTOCOLO DE AUTORIZAÇÃO DE USO',
      '328260000000703 - 23/11/2026 11:00:00',
      'SÉRIE 900',
    ],
    ausentes: ['DADOS DA NF-E', FORMULARIO, EPEC],
    barras: 1,
  },
  {
    fixture: 'c04-contingencia-epec.xml',
    sigla: 'EPEC',
    expressao: EPEC,
    textos: [CONSULTA_EPEC, 'PROTOCOLO DE AUTORIZAÇÃO DO EPEC'],
    ausentes: [
      'DADOS DA NF-E',
      'Sefaz Autorizada',
      'PROTOCOLO DE AUTORIZAÇÃO DE USO',
    ],
    barras: 1,
  },
  {
    fixture: 'c05-contingencia-fs-da.xml',
    sigla: 'FS-DA',
    expressao: FORMULARIO,
    textos: ['DADOS DA NF-E', '3551 2345 6780 0019 5000 0000 0123 4561 2233'],
    ausentes: ['PROTOCOLO DE AUTORIZAÇÃO', 'Consulta de autenticidade'],
    barras: 2,
  },
  {
    fixture: 'c06-contingencia-svc-an.xml',
    sigla: 'SVC-AN',
    expressao: null,
    textos: [
      CONSULTA_NORMAL,
      'PROTOCOLO DE AUTORIZAÇÃO DE USO',
      '328260000000706 - 23/11/2026 11:00:00',
    ],
    ausentes: ['DADOS DA NF-E', FORMULARIO, EPEC],
    barras: 1,
  },
  {
    fixture: 'c07-contingencia-svc-rs.xml',
    sigla: 'SVC-RS',
    expressao: null,
    textos: [
      CONSULTA_NORMAL,
      'PROTOCOLO DE AUTORIZAÇÃO DE USO',
      '328260000000707 - 23/11/2026 11:00:00',
    ],
    ausentes: ['DADOS DA NF-E', FORMULARIO, EPEC],
    barras: 1,
  },
];

/**
 * @param {object} c contexto de executar.cjs
 */
async function casosContingencia(c) {
  const { caso, avaliar, aguardar, confere, abrir, notas, inicio, capturar } =
    c;

  for (const k of CASOS) {
    await caso(
      `DANFE em contingência: ${k.fixture} abre no DANFE com os campos do MOC`,
      async () => {
        const alvo = path.join(notas, k.fixture);
        fs.copyFileSync(path.join(FIXTURES, k.fixture), alvo);
        abrir(alvo);
        await aguardar(
          `(() => { const d = document.getElementById('danfe'); return !!d && !d.hidden && d.querySelectorAll('.folha').length > 0; })()`,
          30000,
          `o DANFE de ${k.fixture} não apareceu`,
        );
        const t = await avaliar(`(() => {
          const d = document.getElementById('danfe');
          const cab = d.querySelector('.cab');
          const pars = [...d.querySelectorAll('.ad__par')];
          const destaque = d.querySelector('.ad__par--destaque');
          const consulta = d.querySelector('.cab__consulta').getBoundingClientRect();
          const dados = d.querySelector('.barras--dados');
          const bd = dados ? dados.getBoundingClientRect() : null;
          return {
            texto: d.innerText,
            cabecalho: cab.innerText,
            barras: d.querySelector('.folha').querySelectorAll('svg.barras').length,
            pars: pars.map((p) => p.textContent),
            destaque: destaque ? destaque.textContent : null,
            peso: destaque ? getComputedStyle(destaque).fontWeight : null,
            parSelecao: pars[0] ? getComputedStyle(pars[0]).userSelect : null,
            rotuloSelecao: getComputedStyle(d.querySelector('.dc__rotulo')).userSelect,
            valorSelecao: getComputedStyle(d.querySelector('.cab__chave-valor .dc__valor')).userSelect,
            dadosDentro: bd ? bd.left >= consulta.left && bd.right <= consulta.right && bd.top >= consulta.top && bd.bottom <= consulta.bottom : null,
            mensagem: !document.getElementById('mensagem').hidden ? document.getElementById('mensagem-texto').textContent : '',
          };
        })()`);
        for (const x of k.textos)
          confere(t.texto.includes(x), `falta "${x}" no DANFE`);
        for (const x of k.ausentes)
          confere(
            !t.cabecalho.includes(x),
            `"${x}" não devia estar no cabeçalho`,
          );
        confere(t.barras === k.barras, `códigos de barras: ${t.barras}`);
        if (k.barras === 2)
          confere(
            t.dadosDentro === true,
            'o código dos dados passou do campo 1',
          );
        if (k.expressao) {
          confere(t.destaque === k.expressao, `destaque: ${t.destaque}`);
          confere(t.peso === '700', `destaque sem negrito: ${t.peso}`);
          confere(t.pars[0] === k.expressao, `1º parágrafo: ${t.pars[0]}`);
          confere(t.pars[1] === entrada(k.sigla), `2º parágrafo: ${t.pars[1]}`);
        } else {
          confere(t.destaque === null, `destaque que não devia: ${t.destaque}`);
          confere(t.pars[0] === entrada(k.sigla), `1º parágrafo: ${t.pars[0]}`);
        }
        confere(
          t.texto.includes(`Pedido inventado 70${k.fixture[2]}.`),
          'as informações complementares do XML sumiram',
        );
        confere(
          t.rotuloSelecao === 'none',
          `rótulo selecionável: ${t.rotuloSelecao}`,
        );
        confere(
          t.valorSelecao !== 'none',
          `dado não selecionável: ${t.valorSelecao}`,
        );
        confere(
          t.parSelecao !== 'none',
          `complementares não selecionáveis: ${t.parSelecao}`,
        );
        confere(t.mensagem === '', `mensagem: ${t.mensagem}`);

        // Capturas em 1366 e 1920 (só com PS_JANELA_CAPTURAS).
        if (process.env.PS_JANELA_CAPTURAS) {
          const janela = c.janela();
          const antes = janela.getContentSize();
          for (const [w, h] of [
            [1366, 720],
            [1920, 1040],
          ]) {
            janela.setContentSize(w, h);
            await c.espera(400);
            await capturar(
              `danfe-contingencia-${k.sigla.toLowerCase()}-${w}.png`,
            );
            // O fim da folha: as Informações Complementares.
            await avaliar(
              `document.querySelector('#danfe .ad__area').scrollIntoView({ block: 'center' }); true`,
            );
            await c.espera(300);
            await capturar(
              `danfe-contingencia-${k.sigla.toLowerCase()}-adicionais-${w}.png`,
            );
            await avaliar(
              `document.querySelector('#danfe .folha').scrollIntoView({ block: 'start' }); true`,
            );
          }
          janela.setContentSize(antes[0], antes[1]);
          await c.espera(200);
        }
        await inicio();
      },
    );
  }
}

module.exports = { casosContingencia };
