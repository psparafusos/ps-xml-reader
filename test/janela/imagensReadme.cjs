// Só com PS_JANELA_README (uma pasta): grava as imagens do README
// (docs/imagens/) a partir do app empacotado, com uma nota inventada de
// ferragens, o perfil "Recebimento" e o cadastro inventado (com a nota
// inventada dele para a coluna Código da casa). Nada real: nota,
// fornecedor, CNPJ e produtos são inventados. Os PNG saem com paleta de 256
// cores (ver pngOtimizado), com menos da metade do tamanho. Com a variável,
// o executar.cjs roda só este passo, com o app aberto vazio e os perfis de
// perfisReadme no config.json; sem ela, nada daqui roda. Nenhum passo
// aciona Copiar.
//
// Uso: PS_JANELA_README=<pasta> npm run test:janela
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CADASTRO = path.join(
  __dirname,
  '..',
  'fixtures',
  'cadastro',
  'cadastro.json',
);
/** Nota inventada do cadastro, com sugestões de confiança alta e média. */
const NOTA_CADASTRO = path.join(
  __dirname,
  '..',
  'fixtures',
  'cadastro',
  'nfe-1-alfa-matriz.xml',
);
const PERFIL = 'Recebimento';

// ---------- PNG sem perda e menor ----------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pedaco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii');
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}

/**
 * PNG com paleta a partir do bitmap BGRA do Electron: as 256 cores mais
 * usadas (numa tela do app, cobrem cerca de 99% dos pixels) e, para as
 * outras (bordas suavizadas do texto), a mais próxima delas. Linhas sem
 * filtro, como a libpng recomenda para paleta, e deflate no nível 9. Sai
 * com menos da metade do tamanho do PNG do capturePage.
 */
function pngOtimizado(bgra, largura, altura) {
  const total = largura * altura;
  const cor = (i) =>
    (bgra[i * 4 + 2] << 16) | (bgra[i * 4 + 1] << 8) | bgra[i * 4];
  const contagem = new Map();
  for (let i = 0; i < total; i++) {
    const c = cor(i);
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  const paleta = [...contagem.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 256)
    .map(([c]) => c);
  const indice = new Map(paleta.map((c, i) => [c, i]));
  const maisProxima = (c) => {
    let melhor = 0;
    let menor = Infinity;
    for (const [i, p] of paleta.entries()) {
      const dr = ((c >> 16) & 255) - ((p >> 16) & 255);
      const dg = ((c >> 8) & 255) - ((p >> 8) & 255);
      const db = (c & 255) - (p & 255);
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < menor) [menor, melhor] = [d, i];
    }
    indice.set(c, melhor);
    return melhor;
  };
  const linhas = Buffer.alloc((largura + 1) * altura);
  for (let y = 0; y < altura; y++) {
    const base = y * (largura + 1);
    linhas[base] = 0; // sem filtro
    for (let x = 0; x < largura; x++) {
      const c = cor(y * largura + x);
      linhas[base + 1 + x] = indice.get(c) ?? maisProxima(c);
    }
  }
  const plte = Buffer.alloc(paleta.length * 3);
  for (const [i, c] of paleta.entries()) {
    plte[i * 3] = (c >> 16) & 255;
    plte[i * 3 + 1] = (c >> 8) & 255;
    plte[i * 3 + 2] = c & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por índice
  ihdr[9] = 3; // paleta
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('PLTE', plte),
    pedaco('IDAT', zlib.deflateSync(linhas, { level: 9, memLevel: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- a nota inventada ----------

// Datas fixas, inventadas (o mês bate com o AAMM da chave): as imagens só
// mudam quando a tela muda. A emissão é 4 dias antes de HOJE e as parcelas
// vencem 26 e 56 dias depois; durante as imagens, o "hoje" da janela é HOJE
// (fixarHoje), para "Emitida há 4 dias" e "Parcelas em dia" não andarem com
// o calendário.
const HOJE = '2026-11-14';
const data = (dias) => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Na janela, o relógio passa a começar em HOJE (andando a partir dali, para
 * os prazos e esperas da tela continuarem certos). Só nas imagens do README;
 * soltarHoje devolve o relógio de verdade.
 */
const FIXAR_HOJE = `(() => {
  if (window.__dataReal) return true;
  const Real = Date;
  const desvio = new Real('${HOJE}T10:00:00-03:00').getTime() - Real.now();
  class DataFixa extends Real {
    constructor(...a) {
      if (a.length === 0) super(Real.now() + desvio);
      else super(...a);
    }
    static now() {
      return Real.now() + desvio;
    }
  }
  window.__dataReal = Real;
  window.Date = DataFixa;
  return true;
})()`;
const SOLTAR_HOJE = `(() => {
  if (window.__dataReal) {
    window.Date = window.__dataReal;
    delete window.__dataReal;
  }
  return true;
})()`;

// SP para SE, origem 0: 7% interestadual (Resolução do Senado 22/1989), e a
// MVA retida é a da coluna de 7% da planilha inventada (56,94%).
const ICMS00 = (v) =>
  `<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${v}</vBC><pICMS>7.00</pICMS><vICMS>${(v * 0.07).toFixed(2)}</vICMS></ICMS00></ICMS>`;
const ICMS10 = (v) => {
  const bcst = (v * 1.5694).toFixed(2);
  const st = (bcst * 0.19 - v * 0.07).toFixed(2);
  return `<ICMS><ICMS10><orig>0</orig><CST>10</CST><modBC>3</modBC><vBC>${v}</vBC><pICMS>7.00</pICMS><vICMS>${(v * 0.07).toFixed(2)}</vICMS><modBCST>4</modBCST><pMVAST>56.94</pMVAST><vBCST>${bcst}</vBCST><pICMSST>19.00</pICMSST><vICMSST>${st}</vICMSST></ICMS10></ICMS>`;
};

/** [código, descrição, NCM, CEST ou '', unidade, quantidade, valor unitário, com ST] */
const ITENS = [
  [
    'PAR-0830',
    'PARAFUSO SEXTAVADO M8 X 30 ZINCADO',
    '73181500',
    '0101900',
    'PC',
    500,
    0.42,
    true,
  ],
  [
    'POR-0800',
    'PORCA SEXTAVADA M8 ZINCADA',
    '73181600',
    '0101900',
    'PC',
    500,
    0.18,
    true,
  ],
  [
    'ARR-0800',
    'ARRUELA LISA M8 ZINCADA',
    '73182200',
    '',
    'PC',
    500,
    0.06,
    false,
  ],
  ['BRO-0600', 'BROCA ACO RAPIDO 6 MM', '82075011', '', 'PC', 20, 7.9, false],
  ['BUC-0800', 'BUCHA DE NYLON 8 MM', '39269090', '', 'PC', 300, 0.12, false],
  [
    'DIS-1150',
    'DISCO DE CORTE 115 X 1,0 MM',
    '68042211',
    '',
    'PC',
    50,
    3.25,
    false,
  ],
  [
    'PAR-0616',
    'PARAFUSO ALLEN M6 X 16 INOX',
    '73181500',
    '0101900',
    'PC',
    200,
    0.55,
    true,
  ],
  [
    'ABR-0350',
    'ABRACADEIRA NYLON 3,5 X 150 MM',
    '39269090',
    '',
    'PCT',
    10,
    4.8,
    false,
  ],
];

function notaReadme() {
  const numero = 48213;
  const n = String(numero).padStart(9, '0');
  const chave = `3526111122233300018155001${n}1${n.slice(1)}5`;
  let total = 0;
  const dets = ITENS.map(([cProd, xProd, ncm, cest, un, q, vUn, st], i) => {
    const v = (q * vUn).toFixed(2);
    total += Number(v);
    const cfop = st ? '6403' : '6102';
    return `<det nItem="${i + 1}"><prod><cProd>${cProd}</cProd><cEAN>SEM GTIN</cEAN><xProd>${xProd}</xProd><NCM>${ncm}</NCM>${cest ? `<CEST>${cest}</CEST>` : ''}<CFOP>${cfop}</CFOP><uCom>${un}</uCom><qCom>${q.toFixed(4)}</qCom><vUnCom>${vUn.toFixed(4)}</vUnCom><vProd>${v}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${un}</uTrib><qTrib>${q.toFixed(4)}</qTrib><vUnTrib>${vUn.toFixed(4)}</vUnTrib><indTot>1</indTot></prod><imposto>${st ? ICMS10(v) : ICMS00(v)}</imposto></det>`;
  });
  const vNF = total.toFixed(2);
  const metade = (total / 2).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- NF-e INVENTADA para as imagens do README (dados fictícios, sem valor fiscal). -->
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide><cUF>35</cUF><cNF>${n.slice(1)}</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${numero}</nNF><dhEmi>${data(-4)}T09:30:00-03:00</dhEmi><tpNF>1</tpNF><idDest>2</idDest><tpEmis>1</tpEmis><tpAmb>2</tpAmb><finNFe>1</finNFe></ide>
      <emit><CNPJ>11222333000181</CNPJ><xNome>Distribuidora Modelo de Ferragens Ltda</xNome><xFant>Ferragens Modelo</xFant><enderEmit><xLgr>Rua das Ferramentas</xLgr><nro>100</nro><xBairro>Distrito Industrial</xBairro><xMun>Campinas</xMun><UF>SP</UF><CEP>13000000</CEP></enderEmit><IE>111111111111</IE><CRT>3</CRT></emit>
      <dest><CNPJ>12345678000195</CNPJ><xNome>Loja Exemplo de Parafusos Ltda</xNome><enderDest><xLgr>Avenida Exemplo</xLgr><nro>200</nro><xBairro>Centro</xBairro><xMun>Aracaju</xMun><UF>SE</UF><CEP>49000000</CEP></enderDest><IE>270000000</IE></dest>
      ${dets.join('\n      ')}
      <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vST>0.00</vST><vProd>${vNF}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vIPI>0.00</vIPI><vOutro>0.00</vOutro><vNF>${vNF}</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete></transp>
      <cobr><fat><nFat>${numero}</nFat><vOrig>${vNF}</vOrig><vLiq>${vNF}</vLiq></fat><dup><nDup>001</nDup><dVenc>${data(26)}</dVenc><vDup>${metade}</vDup></dup><dup><nDup>002</nDup><dVenc>${data(56)}</dVenc><vDup>${metade}</vDup></dup></cobr>
      <pag><detPag><tPag>15</tPag><vPag>${vNF}</vPag></detPag></pag>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>${data(-4)}T09:31:00-03:00</dhRecbto><nProt>135260000048213</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;
}

// ---------- o perfil ----------

/**
 * Perfis do config.json da rodada das imagens: "Recebimento" (o ativo) e
 * "Fiscal", os dois com a Qtd recebida e o CFOP de entrada ao lado da Qtd e
 * a Anotação escondida. Vão no config.json antes de o app abrir
 * (executar.cjs): a janela que grava um perfil pela API não recebe o aviso
 * da mudança.
 */
function perfisReadme() {
  const ids = [
    'nItem',
    'codigo',
    'descricao',
    // Sem cadastro carregado a coluna não entra na tabela; com ele, é a da
    // imagem codigo-casa.png.
    'codigoCasa',
    'ncm',
    'cfop',
    'un',
    'qtd',
    'anotacao-qtd-recebida',
    'anotacao-cfop-de-entrada',
    'vUnit',
    'vTotal',
    'ipi',
    'xml:imposto/IPI/pIPI',
    'icms',
    'xml:imposto/ICMS/pICMS',
  ];
  const escondidas = ['anotacao', 'ean', 'pedido', 'ibs', 'cbs'];
  const meia = new Set(['emitente', 'destinatario']);
  const perfil = (id, nome) => ({
    id,
    nome,
    colunas: [
      ...ids.map((id) =>
        id.startsWith('anotacao-')
          ? { id, visivel: true, largura: 'estreita' }
          : { id, visivel: true },
      ),
      ...escondidas.map((id) => ({ id, visivel: false })),
    ],
    anotacoes: [
      { id: 'anotacao-qtd-recebida', titulo: 'Qtd recebida' },
      { id: 'anotacao-cfop-de-entrada', titulo: 'CFOP de entrada' },
    ],
    orientacao: 'automatica',
    layout: {
      blocos: [
        'emitente',
        'destinatario',
        'dados',
        'itens',
        'totais',
        'transporte',
        'duplicatas',
        'adicionais',
      ].map((id) => ({ id, visivel: true, largura: meia.has(id) ? 6 : 12 })),
    },
  });
  return {
    versao: 1,
    ativo: 'p-readme',
    lista: [perfil('p-readme', PERFIL), perfil('p-fiscal', 'Fiscal')],
    fornecedores: {},
  };
}

// ---------- os passos ----------

async function casosImagensReadme(ctx) {
  const pasta = process.env.PS_JANELA_README;
  if (!pasta) return;
  const {
    caso,
    avaliar,
    aguardar,
    espera,
    janela,
    abrirNota,
    irParaConferencia,
    inicio,
    tmp,
    carregarPlanilhaST,
    estadoLimpo,
  } = ctx;
  const { dialog } = require('electron');
  fs.mkdirSync(pasta, { recursive: true });
  const arquivoNota = path.join(tmp, 'Ferragens-Modelo-NF48213.xml');
  fs.writeFileSync(arquivoNota, notaReadme(), 'utf8');

  /** Grava a janela, como está, em <pasta>/<nome>. */
  async function gravar(nome) {
    await avaliar(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
    );
    janela().webContents.invalidate();
    await espera(400);
    const img = await janela().webContents.capturePage(undefined, {
      stayHidden: true,
    });
    const { width, height } = img.getSize();
    fs.writeFileSync(
      path.join(pasta, nome),
      pngOtimizado(img.toBitmap(), width, height),
    );
  }
  const tamanho = async (w, h) => {
    janela().setContentSize(w, h);
    await espera(500);
  };

  await caso(
    'Imagens do README (PS_JANELA_README): nota inventada, perfil Recebimento e cadastro inventado',
    async () => {
      await estadoLimpo();
      const [largura, altura] = janela().getContentSize();
      try {
        await carregarPlanilhaST();

        // DANFE da nota (abre no XML).
        await tamanho(1366, 768);
        await avaliar(FIXAR_HOJE);
        await abrirNota(arquivoNota);
        await gravar('danfe.png');

        // Conferência com o painel aberto e a Qtd recebida digitada.
        await tamanho(1920, 1040);
        await irParaConferencia();
        // Qtd recebida item a item (a tabela se refaz a cada digitação); a
        // do item 3 diferente da nota.
        for (const [i, it] of ITENS.entries()) {
          const rotulo = `Qtd recebida do item ${i + 1}`;
          await aguardar(
            `!!document.querySelector('input[aria-label="${rotulo}"]')`,
            10000,
            `sem a caixa "${rotulo}"`,
          );
          await avaliar(`(() => {
            const c = document.querySelector('input[aria-label="${rotulo}"]');
            c.value = '${i === 2 ? it[5] - 50 : it[5]}';
            c.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
          await espera(150);
        }
        await avaliar('document.activeElement?.blur(); true');
        await avaliar(
          `document.querySelector('.conferencia__expandir')?.click(); true`,
        );
        await espera(500);
        await avaliar(`(() => {
          const t = document.querySelector('#nota table.tabela--itens');
          t.scrollIntoView({ block: 'start' });
          // Sobe um pouco: o título "Itens" e o Ordenar por à mostra.
          let r = t.parentElement;
          while (r && !(r.scrollHeight > r.clientHeight && /auto|scroll/.test(getComputedStyle(r).overflowY))) r = r.parentElement;
          r = r || document.scrollingElement;
          r.scrollTop = Math.max(0, r.scrollTop - 150);
          return true;
        })()`);
        await gravar('conferencia.png');

        // Editar colunas.
        await tamanho(1366, 768);
        await avaliar(
          `document.getElementById('btn-editar-colunas').click(); true`,
        );
        await aguardar(
          `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`,
          15000,
          'o Editar colunas não abriu',
        );
        await gravar('colunas.png');
        await avaliar(`(() => {
          const d = document.getElementById('painel-colunas-titulo').closest('dialog[open]');
          d.dispatchEvent(new Event('cancel', { cancelable: true }));
          return true;
        })()`);
        await espera(400);

        // Ferramenta ST, MVA e CFOP.
        await avaliar(`[...document.querySelectorAll('.conferencia__ferramenta')]
          .find((li) => li.textContent.includes('ST, MVA e CFOP'))
          .querySelector('.botao--ferramenta:not(:disabled)').click()`);
        await aguardar(
          `!!document.querySelector('dialog.painel--st[open] .st__situacao')`,
          30000,
          'a ferramenta ST não abriu',
        );
        await avaliar('document.activeElement?.blur(); true');
        await gravar('ferramenta-st.png');
        await avaliar(
          `document.querySelector('dialog.painel--st .painel__fechar').click(); true`,
        );
        await espera(400);

        // Menu do perfil na barra da nota.
        await avaliar(`document.getElementById('btn-perfil').click(); true`);
        await aguardar(
          `!!document.querySelector('#menu-perfil:not([hidden])')`,
          15000,
          'o menu do perfil não abriu',
        );
        await gravar('perfis.png');
        await avaliar(`document.getElementById('btn-perfil').click(); true`);
        await aguardar(
          `!!document.querySelector('#menu-perfil[hidden]')`,
          15000,
          'o menu do perfil não fechou',
        );

        // Cadastro do sistema de gestão nos Documentos de referência.
        await estadoLimpo();
        const original = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [CADASTRO],
        });
        try {
          const r = await avaliar('window.psApi.importarCadastro()');
          if (r.status !== 'ok')
            throw new Error(`cadastro: ${JSON.stringify(r)}`);
        } finally {
          dialog.showOpenDialog = original;
        }
        await avaliar(`document.getElementById('btn-documentos').click()`);
        const cartao = `document.getElementById('documento-cadastro')?.closest('article')`;
        await aguardar(`!!${cartao}`, 15000, 'sem o cartão do cadastro');
        await espera(300);
        await avaliar(`${cartao}.scrollIntoView({ block: 'start' }); true`);
        await gravar('cadastro.png');

        // Coluna Código da casa, com o cadastro carregado e a nota inventada
        // dele (destinatário trocado pelo CNPJ inventado da loja, para o
        // painel não mostrar nota de outra empresa).
        await estadoLimpo();
        const notaCasa = path.join(tmp, 'Ferragens-Alfa-NF1201.xml');
        fs.writeFileSync(
          notaCasa,
          fs
            .readFileSync(NOTA_CADASTRO, 'utf8')
            .replace(
              '<dest><CNPJ>99999999000191</CNPJ>',
              '<dest><CNPJ>12345678000195</CNPJ>',
            ),
          'utf8',
        );
        await tamanho(1920, 1040);
        await avaliar(FIXAR_HOJE);
        await abrirNota(notaCasa);
        await irParaConferencia();
        await aguardar(
          `!!document.querySelector('#nota td.col-codigoCasa .codigo-casa__codigo')`,
          15000,
          'a coluna Código da casa não respondeu',
        );
        // O painel e a tabela se refazem quando o motor responde: a rolagem
        // só depois de assentar.
        await espera(1500);
        await avaliar('document.activeElement?.blur(); true');
        await avaliar(
          `document.querySelector('.conferencia__expandir')?.click(); true`,
        );
        await espera(500);
        await avaliar(`(() => {
          const t = document.querySelector('#nota table.tabela--itens');
          t.scrollIntoView({ block: 'start' });
          let r = t.parentElement;
          while (r && !(r.scrollHeight > r.clientHeight && /auto|scroll/.test(getComputedStyle(r).overflowY))) r = r.parentElement;
          r = r || document.scrollingElement;
          r.scrollTop = Math.max(0, r.scrollTop - 150);
          return true;
        })()`);
        await gravar('codigo-casa.png');
      } finally {
        await avaliar(SOLTAR_HOJE).catch(() => null);
        await estadoLimpo();
        await avaliar('window.psApi.removerCadastro()').catch(() => null);
        janela().setContentSize(largura, altura);
        await inicio().catch(() => null);
      }
    },
  );
}

module.exports = {
  casosImagensReadme,
  notaReadme,
  perfisReadme,
  pngOtimizado,
};
