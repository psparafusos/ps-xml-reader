// Casos do test:janela para o modo Documento da aba XML com os documentos
// fiscais que não são NF-e de produto (src/docfiscal/): cada fixture
// inventada (test/janela/fixtures/d*.xml) abre por duplo clique e pelo botão
// Abrir, direto na aba XML no modo Documento com o documento auxiliar certo,
// a aba PSXML apagada com o motivo (menos na NFC-e, que é NF-e de produto),
// Imprimir e Salvar apagados, rótulos não selecionáveis e dados
// selecionáveis. Com PS_JANELA_CAPTURAS, grava cada documento em 1366 e
// 1920. Chamado por executar.cjs. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');

/**
 * Os documentos: fixture, nome no painel Leitura, classe da folha, textos
 * que precisam estar no documento, título da janela e se a aba PSXML fica
 * disponível.
 */
const DOCUMENTOS = [
  {
    fixture: 'd01-nfse-abrasf.xml',
    nome: 'DANFSe',
    folha: 'folha--danfse',
    textos: [
      'Documento Auxiliar da NFS-e',
      'TST1-AB2C',
      'LOCACAO DE VEICULO INVENTADO',
      'montado pelo PS Reader a partir do XML',
      '1.382,57',
    ],
    titulo: ['Locadora Inventada de Veiculos Ltda', 'NFS-e nº 202600000000321'],
    qr: false,
    psxml: false,
    captura: 'danfse-abrasf',
  },
  {
    fixture: 'd02-nfse-nacional.xml',
    nome: 'DANFSe',
    folha: 'folha--danfse',
    textos: [
      'DANFSe v2.0',
      'NFS-e SEM VALIDADE JURÍDICA',
      'Município: Aracaju / SE',
      'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO',
      '1.990,00',
    ],
    titulo: ['Prestadora Inventada de Servicos Ltda', 'NFS-e nº 123'],
    qr: true,
    psxml: false,
    captura: 'danfse-nacional',
  },
  {
    fixture: 'd03-cte.xml',
    nome: 'DACTE',
    folha: 'folha--dacte',
    textos: [
      'Documento Auxiliar do Conhecimento de Transporte Eletrônico',
      'MODAL RODOVIÁRIO',
      'TOMADOR DO SERVIÇO',
      '4226 1187 6543 2100 0198 5500 1000 0012 3411 2345 6789',
      '342260000123456 - 05/11/2026 14:21:02',
      'FOLHA 1/1',
      '850,40',
    ],
    titulo: ['Transportadora Inventada Ltda', 'CT-e nº 4567 série 1'],
    qr: true,
    psxml: false,
    captura: 'dacte',
  },
];

/**
 * @param {object} c contexto de executar.cjs
 */
async function casosDocumentos(c) {
  const { caso, avaliar, aguardar, confere, abrir, notas, inicio, capturar } =
    c;
  const copia = (nome) => {
    const alvo = path.join(notas, nome);
    fs.copyFileSync(path.join(FIXTURES, nome), alvo);
    return alvo;
  };

  /** Espera o documento montado e devolve o que a tela mostra. */
  async function lerTela(d) {
    await aguardar(
      `(() => { const e = document.getElementById('danfe'); return !!e && !e.hidden && !!e.querySelector('.${d.folha}'); })()`,
      30000,
      `o ${d.nome} de ${d.fixture} não apareceu no modo Documento`,
    );
    return avaliar(`(() => {
      const danfe = document.getElementById('danfe');
      const b = document.getElementById('btn-modo-documento');
      const rotulo = danfe.querySelector('.dx-campo__rotulo, .dx-bloco__titulo');
      const valor = danfe.querySelector('.dx-campo__valor, .dx-texto__valor');
      return {
        texto: danfe.innerText,
        folhas: danfe.querySelectorAll('.folha').length,
        qr: !!danfe.querySelector('svg.dx-qr'),
        botao: b.textContent.trim(),
        pressionado: b.getAttribute('aria-pressed'),
        abaXml: document.getElementById('btn-aba-xml').getAttribute('aria-selected'),
        psxml: document.getElementById('btn-aba-psxml').getAttribute('aria-disabled'),
        imprimir: document.getElementById('btn-imprimir').disabled,
        salvar: document.getElementById('btn-salvar').disabled,
        titulo: [...document.querySelectorAll('#titulo-janela-textos > :not(.titulo-janela__sep)')].map((e) => e.textContent),
        transborda: [...danfe.querySelectorAll('.dx-corpo')].some((c) => c.scrollHeight > c.clientHeight + 1),
        rotuloSelecao: rotulo ? getComputedStyle(rotulo).userSelect : null,
        valorSelecao: valor ? getComputedStyle(valor).userSelect : null,
      };
    })()`);
  }

  function conferirTela(d, t) {
    confere(t.botao === `Documento ${d.nome}`, `botão: ${t.botao}`);
    confere(t.pressionado === 'true', 'o modo Documento não está marcado');
    confere(t.abaXml === 'true', 'a aba XML não está ativa');
    for (const x of d.textos)
      confere(t.texto.includes(x), `falta "${x}" no ${d.nome}`);
    confere(t.qr === d.qr, `QR Code: ${t.qr}`);
    confere(!t.transborda, `o ${d.nome} passou do fim da folha`);
    confere(t.folhas === (d.folhas ?? 1), `folhas: ${t.folhas}`);
    confere(
      d.titulo.every((x) => t.titulo.includes(x)),
      `título: ${t.titulo.join(' | ')}`,
    );
    confere(
      d.psxml ? t.psxml === null : t.psxml === 'true',
      `aba PSXML: ${t.psxml}`,
    );
    confere(
      d.psxml || (t.imprimir && t.salvar),
      'Imprimir e Salvar deveriam ficar apagados',
    );
    confere(
      t.rotuloSelecao === 'none',
      `rótulo selecionável: ${t.rotuloSelecao}`,
    );
    confere(
      t.valorSelecao !== 'none',
      `dado não selecionável: ${t.valorSelecao}`,
    );
  }

  await caso(
    'Documento: DACTE com 150 NF-e continua nas folhas seguintes, com o cabeçalho',
    async () => {
      const base = fs.readFileSync(path.join(FIXTURES, 'd03-cte.xml'), 'utf8');
      const chaves = Array.from(
        { length: 150 },
        (_, i) =>
          `<infNFe><chave>422611876543210001985500100${String(i + 1).padStart(7, '0')}1123456789</chave></infNFe>`,
      ).join('');
      const alvo = path.join(notas, 'd03-cte-muitas-nfe.xml');
      fs.writeFileSync(
        alvo,
        base.replace(/<infDoc>[\s\S]*<\/infDoc>/, `<infDoc>${chaves}</infDoc>`),
      );
      abrir(alvo);
      await aguardar(
        `!!document.querySelector('#danfe .folha--dacte')`,
        30000,
        'o DACTE não apareceu',
      );
      const r = await avaliar(`(() => {
        const folhas = [...document.querySelectorAll('#danfe .folha--dacte')];
        return {
          total: folhas.length,
          numeros: folhas.map((f) => f.querySelector('.dx-folha-numero')?.textContent),
          cabecalhos: folhas.filter((f) => f.querySelector('.dx-dacte__cab')).length,
          linhas: document.querySelectorAll('#danfe .dx-bloco--documentos tbody tr').length,
          transborda: folhas.some((f) => { const c = f.querySelector('.dx-corpo'); return c.scrollHeight > c.clientHeight + 1; }),
        };
      })()`);
      confere(r.total >= 2, `folhas: ${r.total}`);
      confere(r.cabecalhos === r.total, 'falta o cabeçalho numa folha');
      confere(
        r.numeros.every((n, i) => n === `FOLHA ${i + 1}/${r.total}`),
        `números: ${r.numeros.join(', ')}`,
      );
      confere(r.linhas === 150, `NF-e na tabela: ${r.linhas}`);
      confere(!r.transborda, 'uma folha do DACTE transbordou');
      await inicio();
    },
  );

  for (const d of DOCUMENTOS) {
    await caso(
      `Documento: ${d.fixture} por duplo clique abre no ${d.nome}`,
      async () => {
        abrir(copia(d.fixture));
        const t = await lerTela(d);
        conferirTela(d, t);
        if (!d.psxml) {
          await avaliar(`document.getElementById('btn-aba-psxml').click()`);
          await aguardar(
            `!!document.querySelector('dialog[open]')`,
            15000,
            'a aba PSXML apagada não explicou',
          );
          const dialogo = await avaliar(`(() => {
            const d = document.querySelector('dialog[open]');
            return { titulo: d.querySelector('.caixa-dialogo__titulo')?.textContent, texto: d.querySelector('.caixa-dialogo__texto')?.textContent };
          })()`);
          confere(
            dialogo.titulo === 'PSXML indisponível' &&
              /não uma NF-e de produto/.test(dialogo.texto ?? ''),
            `diálogo: ${JSON.stringify(dialogo)}`,
          );
          await avaliar(
            `document.querySelector('dialog[open] button')?.click()`,
          );
        }
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
            await capturar(`doc-${d.captura}-${w}.png`);
          }
          janela.setContentSize(antes[0], antes[1]);
          await c.espera(200);
        }
        await inicio();
      },
    );

    await caso(`Documento: ${d.fixture} pelo botão Abrir`, async () => {
      const { dialog } = require('electron');
      const original = dialog.showOpenDialog;
      const alvo = copia(d.fixture);
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [alvo],
      });
      try {
        await avaliar(`document.getElementById('btn-abrir').click()`);
        conferirTela(d, await lerTela(d));
      } finally {
        dialog.showOpenDialog = original;
      }
      await inicio();
    });
  }
}

module.exports = { casosDocumentos, DOCUMENTOS };
