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
    pdf: 'LOCADORA-INVENTADA_NFSe202600000000321_DANFSe.pdf',
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
    pdf: 'PRESTADORA-INVENTADA_NFSe123_DANFSe.pdf',
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
    pdf: 'TRANSPORTADORA-INVEN_CTe4567_DACTE.pdf',
  },
  {
    // Sem xMun, xMunIni e xMunFim: os nomes saem da tabela do IBGE.
    fixture: 'd08-cte-sem-municipio.xml',
    nome: 'DACTE',
    folha: 'folha--dacte',
    textos: [
      'Documento Auxiliar do Conhecimento de Transporte Eletrônico',
      'Joinville - SC',
      'Aracaju - SE',
      'FOLHA 1/1',
    ],
    titulo: ['Transportadora Inventada Ltda', 'CT-e nº 4567 série 1'],
    qr: true,
    psxml: false,
    captura: 'dacte-sem-municipio',
    pdf: 'TRANSPORTADORA-INVEN_CTe4567_DACTE.pdf',
  },
  {
    // Sem xLocEmi, xLocPrestacao e xLocIncid: os nomes saem da tabela do IBGE.
    fixture: 'd09-nfse-sem-municipio.xml',
    nome: 'DANFSe',
    folha: 'folha--danfse',
    textos: ['DANFSe v2.0', 'Município: Aracaju / SE', 'São Paulo / SP'],
    titulo: ['Prestadora Inventada de Servicos Ltda', 'NFS-e nº 123'],
    qr: true,
    psxml: false,
    captura: 'danfse-sem-municipio',
    pdf: 'PRESTADORA-INVENTADA_NFSe123_DANFSe.pdf',
  },
  {
    fixture: 'd04-evento-cce.xml',
    nome: 'Evento',
    folha: 'folha--evento',
    textos: [
      'CARTA DE CORREÇÃO',
      'Onde se le volumes 10, leia-se volumes 12.',
      '2826 1187 6543 2100 0198 5500 1000 0012 3411 2345 6789',
      '128260000012345',
      'CONDIÇÃO DE USO',
      'montada pelo PS Reader a partir do XML do evento',
    ],
    titulo: ['Carta de Correção', 'NF-e nº 1234 série 1'],
    qr: false,
    psxml: false,
    captura: 'evento-cce',
    pdf: '87654321000198_NF1234_Evento-CCe.pdf',
  },
  {
    fixture: 'd05-evento-cancelamento.xml',
    nome: 'Evento',
    folha: 'folha--evento',
    textos: [
      'CANCELAMENTO',
      'Pedido inventado cancelado pelo cliente',
      '128260000099999',
      'AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL',
    ],
    titulo: ['Cancelamento', 'NF-e nº 1235 série 1'],
    qr: false,
    psxml: false,
    captura: 'evento-cancelamento',
    pdf: '87654321000198_NF1235_Evento-Cancelamento.pdf',
  },
  {
    fixture: 'd06-cancelamento-antigo.xml',
    nome: 'Evento',
    folha: 'folha--evento',
    textos: [
      'Cancelamento da NF-e (leiaute anterior aos eventos)',
      'Cancelamento inventado para teste do leiaute antigo.',
      '128100000000222',
    ],
    titulo: ['Cancelamento', 'NF-e nº 123 série 1'],
    qr: false,
    psxml: false,
    captura: null,
    pdf: '87654321000198_NF123_Evento-Cancelamento.pdf',
  },
  {
    fixture: 'd07-nfce.xml',
    nome: 'DANFE NFC-e',
    folha: 'folha--nfce',
    textos: [
      'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica',
      'BROCA DE ACO RAPIDO 8MM INVENTADA',
      'Consulte pela Chave de Acesso em',
      '2826 1165 4321 0000 0132 6500 1000 0004 5611 2345 6781',
      'CONSUMIDOR CNPJ: 12.345.678/0001-95',
      'Protocolo de autorização: 228260000004567',
      'EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL',
      'Troco R$',
    ],
    titulo: ['Mercado Inventado de Ferragens Ltda', 'NFC-e nº 456 série 1'],
    qr: true,
    psxml: true,
    captura: 'danfe-nfce',
    pdf: 'MERCADO-INVENTADO_NF456_DANFE-NFCe.pdf',
    bobina: true,
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
      const rotulo = danfe.querySelector('.dx-campo__rotulo, .dx-bloco__titulo, .dx-nfce__itens th');
      const valor = danfe.querySelector('.dx-campo__valor, .dx-texto__valor, .dx-nfce__itens td');
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
      !t.imprimir && !t.salvar,
      'Imprimir e Salvar deveriam estar disponíveis no documento montado',
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
        if (process.env.PS_JANELA_CAPTURAS && d.captura) {
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

/**
 * Salvar e Imprimir de cada documento (src/docfiscal/nomeArquivo.ts):
 * o PDF na pasta de destino com o nome do padrão e o tamanho da folha da
 * tela (A4; a NFC-e na bobina de 80 mm), a pergunta de Substituir, Salvar
 * cópia ou Cancelar quando o PDF já existe, e a impressão até o diálogo do
 * Windows (o teste fica no lugar dele, confere as opções que o app pediu e
 * gera o PDF com elas, como faria a "Microsoft Print to PDF").
 */
async function casosSaida(c) {
  const { caso, avaliar, aguardar, confere, abrir, notas, inicio } = c;
  const A4 = { largura: 595.92, altura: 842.88 };
  const perto = (a, b) => Math.abs(a - b) < 2;

  for (const d of DOCUMENTOS) {
    await caso(`Documento: ${d.fixture} salva o PDF e imprime`, async () => {
      c.apagarPdfs();
      const alvo = path.join(notas, d.fixture);
      fs.copyFileSync(path.join(FIXTURES, d.fixture), alvo);
      abrir(alvo);
      await aguardar(
        `(() => { const e = document.getElementById('danfe'); return !!e && !e.hidden && !!e.querySelector('.${d.folha}') && !document.getElementById('btn-salvar').disabled; })()`,
        30000,
        `o ${d.nome} de ${d.fixture} não ficou pronto para salvar`,
      );
      // Avisos da nota (NFC-e) por cima: fecha antes de salvar.
      await avaliar(
        `[...document.querySelectorAll('dialog[open]')].forEach((x) => { x.dispatchEvent(new Event('cancel', { cancelable: true })); if (x.open) x.close(); }); true`,
      );
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const arquivo = await c.pdfNoDestino(d.pdf);
      confere(
        path.basename(arquivo) === d.pdf,
        `nome do PDF: ${path.basename(arquivo)}`,
      );
      const pdf = c.paginasDoPdf(arquivo);
      if (d.bobina)
        confere(
          perto(pdf.largura, (80 / 25.4) * 72) &&
            pdf.altura > pdf.largura &&
            pdf.paginas === 1,
          `PDF da NFC-e fora da bobina: ${JSON.stringify(pdf)}`,
        );
      else
        confere(
          perto(pdf.largura, A4.largura) && perto(pdf.altura, A4.altura),
          `PDF fora do A4: ${JSON.stringify(pdf)}`,
        );

      // De novo: o PDF já existe. A pergunta do app, com as três saídas;
      // Substituir grava por cima.
      const antes = fs.statSync(arquivo).mtimeMs;
      await avaliar(`document.getElementById('btn-salvar').click()`);
      await aguardar(
        `!!document.querySelector('dialog[open] .caixa-dialogo__titulo')`,
        15000,
        'a pergunta de arquivo existente não apareceu',
      );
      const pergunta = await avaliar(`(() => {
        const x = document.querySelector('dialog[open]');
        return { titulo: x.querySelector('.caixa-dialogo__titulo')?.textContent, botoes: [...x.querySelectorAll('button')].map((b) => b.textContent.trim()) };
      })()`);
      confere(
        pergunta.titulo === 'Arquivo já existe' &&
          ['Cancelar', 'Salvar cópia...', 'Substituir'].every((b) =>
            pergunta.botoes.includes(b),
          ),
        `pergunta: ${JSON.stringify(pergunta)}`,
      );
      await avaliar(
        `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Substituir').click()`,
      );
      const limite = Date.now() + 30000;
      while (fs.statSync(arquivo).mtimeMs === antes && Date.now() < limite)
        await c.espera(200);
      confere(
        fs.statSync(arquivo).mtimeMs !== antes,
        'Substituir não regravou o PDF',
      );
      await aguardar(
        `!document.getElementById('btn-salvar').disabled`,
        15000,
        'o Salvar não voltou',
      );

      // Imprimir: até o diálogo do Windows.
      const { dialog } = require('electron');
      const janela = c.janela();
      const proto = Object.getPrototypeOf(janela.webContents);
      const printOriginal = proto.print;
      const avisoOriginal = dialog.showMessageBox;
      const saida = path.join(c.tmp, `impressao-${d.fixture}.pdf`);
      let impressao = null;
      let avisos = 0;
      dialog.showMessageBox = async () => {
        avisos++;
        return { response: 0, checkboxChecked: false };
      };
      proto.print = function (opcoes, fim) {
        impressao = (async () => {
          const ps = opcoes.pageSize;
          fs.writeFileSync(
            saida,
            await this.printToPDF({
              printBackground: true,
              pageSize:
                typeof ps === 'object'
                  ? { width: ps.width / 25400, height: ps.height / 25400 }
                  : ps,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            }),
          );
          fim(true, '');
          return { opcoes, pdf: c.paginasDoPdf(saida) };
        })();
      };
      try {
        const impressoras = (await janela.webContents.getPrintersAsync()).map(
          (x) => x.name,
        );
        await avaliar(`document.getElementById('btn-imprimir').click()`);
        const fimEspera = Date.now() + 30000;
        while (!impressao && Date.now() < fimEspera) await c.espera(100);
        confere(impressao, `Imprimir do ${d.nome} não chegou ao diálogo`);
        const r = await impressao;
        confere(r.opcoes.silent === false, 'a impressão não abriria o diálogo');
        if (d.bobina)
          confere(
            r.opcoes.pageSize?.width === 80000 &&
              perto(r.pdf.largura, (80 / 25.4) * 72) &&
              avisos === 0,
            `impressão da NFC-e: ${JSON.stringify({ ...r, avisos })}`,
          );
        else
          confere(
            r.opcoes.pageSize === 'A4' &&
              perto(r.pdf.largura, A4.largura) &&
              perto(r.pdf.altura, A4.altura),
            `impressão do ${d.nome}: ${JSON.stringify(r)}`,
          );
        // Com a "Microsoft Print to PDF" instalada, ela é uma das opções do
        // diálogo (o teste não escolhe a impressora: o diálogo é do Windows).
        if (!impressoras.includes('Microsoft Print to PDF'))
          console.log('  (a Microsoft Print to PDF não está instalada aqui)');
        await aguardar(
          `!document.getElementById('btn-imprimir').disabled`,
          10000,
          'Imprimir não voltou',
        );
      } finally {
        proto.print = printOriginal;
        dialog.showMessageBox = avisoOriginal;
      }
      c.apagarPdfs();
      await inicio();
    });
  }
}

module.exports = { casosDocumentos, casosSaida, DOCUMENTOS };
