// Casos do test:janela para a tela do leitor genérico de XML (parte 1),
// chamados por executar.cjs. Abre XML inventado pela rota interna (evento
// 'leitor-xml-rota-interna' do app), confere as duas vistas e a busca, e
// fecha. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CATALOGO = `<?xml version="1.0" encoding="UTF-8"?>
<!-- catálogo inventado para o teste -->
<catalogo versao="2" origem="teste">
  <cliente id="C1"><nome>Loja Inventada LTDA</nome><cidade>Aracaju</cidade></cliente>
  <cliente id="C2"><nome>Comércio Fictício ME</nome><cidade>Lagarto</cidade></cliente>
  <itens>
    <item codigo="P-001"><desc>PARAFUSO &lt;script&gt;alert(1)&lt;/script&gt;</desc></item>
    <item codigo="P-002"><desc><![CDATA[<img src=x onerror=alert(1)>]]></desc></item>
  </itens>
</catalogo>
`;

const MALFORMADO = `<?xml version="1.0"?>
<pedido>
  <item>1</itens>
</pedido>
`;

/**
 * @param {object} c contexto de executar.cjs: app, notas, caso, avaliar,
 *   aguardar, confere, espera, rede, sonda.
 */
async function casosLeitorXml(c) {
  const { app, notas, caso, avaliar, aguardar, confere, espera, rede } = c;

  const gravar = (nome, conteudo) => {
    const alvo = path.join(notas, nome);
    fs.writeFileSync(alvo, conteudo);
    return alvo;
  };
  const abrirNoLeitor = (caminho) =>
    app.emit('leitor-xml-rota-interna', caminho);
  const texto = (seletor) =>
    avaliar(
      `document.querySelector(${JSON.stringify(seletor)})?.innerText ?? ''`,
    );
  const leitorAberto = `(() => { const s = document.querySelector('.leitor-xml'); return !!s && !s.hidden; })()`;
  /** Botão da tela do leitor pelo texto (nunca um "Copiar"). */
  const clicarBotao = async (rotulo) => {
    confere(!/copiar/i.test(rotulo), 'teste tentou acionar Copiar');
    const ok = await avaliar(`(() => {
      const b = [...document.querySelectorAll('.leitor-xml button')]
        .find((x) => x.textContent.trim() === ${JSON.stringify(rotulo)});
      if (!b) return false;
      b.click();
      return true;
    })()`);
    confere(ok, `botão "${rotulo}" não encontrado`);
  };
  const buscarPor = (termo) =>
    avaliar(`(() => {
      const campo = document.getElementById('leitor-xml-busca');
      campo.value = ${JSON.stringify(termo)};
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  const aguardarContador = (re, descricao) =>
    aguardar(
      `${re}.test(document.querySelector('.leitor-xml__contador')?.textContent ?? '')`,
      5000,
      descricao,
    );

  await caso(
    'Leitor de XML: árvore, texto e busca num XML inventado',
    async () => {
      const base = await avaliar(c.sonda);
      abrirNoLeitor(gravar('catalogo-inventado.xml', CATALOGO));
      await aguardar(leitorAberto, 10000, 'o leitor não abriu');
      await aguardar(
        `document.querySelectorAll('.leitor-xml__no').length > 0`,
        10000,
        'a árvore não apareceu',
      );

      // Barra: nome, caminho, tamanho e codificação.
      confere(
        (await texto('.leitor-xml__nome')) === 'catalogo-inventado.xml',
        'nome do arquivo na barra',
      );
      confere(
        (await texto('.leitor-xml__caminho')).endsWith(
          'catalogo-inventado.xml',
        ),
        'caminho na barra',
      );
      const info = await texto('.leitor-xml__info');
      confere(
        info.includes('Codificação: UTF-8 (declarada no arquivo)'),
        `info: ${info}`,
      );

      // Árvore: começa aberta (arquivo pequeno), com atributos e textos.
      const arvore = await texto('.leitor-xml__vista--arvore');
      for (const esperado of [
        '<catalogo versao="2" origem="teste">',
        '<cliente id="C1">',
        '<nome>Loja Inventada LTDA</nome>',
        '<item codigo="P-002">',
        '<desc>PARAFUSO <script>alert(1)</script></desc>',
        '<desc><![CDATA[<img src=x onerror=alert(1)>]]></desc>',
        '<!-- catálogo inventado para o teste -->',
      ]) {
        confere(
          arvore.includes(esperado),
          `árvore sem: ${esperado}\n${arvore}`,
        );
      }
      confere(
        (await avaliar(
          `document.querySelector('.leitor-xml__vista--arvore').getAttribute('role')`,
        )) === 'tree',
        'árvore sem role=tree',
      );

      // Busca na Árvore: 2 elementos <cliente>.
      await buscarPor('cliente');
      await aguardarContador('/^1 de 2$/', 'contador 1 de 2 na árvore');
      await clicarBotao('Próximo');
      await aguardarContador('/^2 de 2$/', 'contador 2 de 2 na árvore');
      confere(
        (await texto('.leitor-xml__no--achado')).includes('<cliente id="C2">'),
        'linha do achado atual na árvore',
      );

      // Vista Texto: indentada, numerada; a busca continua no mesmo lugar.
      await clicarBotao('Texto');
      await aguardar(
        `document.querySelectorAll('.leitor-xml__linha').length > 0`,
        5000,
        'a vista Texto não apareceu',
      );
      const linhas = await avaliar(
        `[...document.querySelectorAll('.leitor-xml__linha')].map((l) => [l.querySelector('.leitor-xml__numero').textContent, l.querySelector('.leitor-xml__codigo').textContent])`,
      );
      const mapa = new Map(linhas.map(([n, t]) => [t, n]));
      confere(
        mapa.get('<?xml version="1.0" encoding="UTF-8"?>') === '1',
        'linha 1',
      );
      confere(
        mapa.has('  <cliente id="C1">'),
        `sem indentação: ${JSON.stringify(linhas)}`,
      );
      confere(mapa.has('    <nome>Loja Inventada LTDA</nome>'), 'nível 2');
      confere(
        mapa.has(
          '      <desc>PARAFUSO &lt;script&gt;alert(1)&lt;/script&gt;</desc>',
        ),
        'texto bruto com entidades',
      );
      // "cliente" no texto: 2 aberturas e 2 fechamentos; o atual segue o C2.
      await aguardarContador('/^3 de 4$/', 'contador 3 de 4 no texto');
      confere(
        (await texto('.leitor-xml__linha--achado')).includes(
          '<cliente id="C2">',
        ),
        'linha do achado atual no texto',
      );
      await clicarBotao('Anterior');
      await aguardarContador('/^2 de 4$/', 'Anterior no texto');
      await buscarPor('inventada');
      await aguardarContador('/^1 de 1$/', 'busca sem diferenciar maiúsculas');
      confere(
        (await texto('.lx-achado--atual')) === 'Inventada',
        'destaque do achado atual',
      );
      await buscarPor('nada-disso');
      await aguardarContador('/^Nada encontrado$/', 'busca sem achado');

      // Nada do arquivo virou elemento nem foi para a rede.
      const s = await avaliar(c.sonda);
      confere(s.scripts === base.scripts, 'script novo na página');
      confere(s.imgX === 0, 'imagem do ataque criada');
      confere(s.alertas === 0, 'alert chamado');
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);

      // Volta para a Árvore e fecha.
      await clicarBotao('Árvore');
      await aguardar(
        `!document.querySelector('.leitor-xml__vista--arvore').hidden`,
        5000,
        'voltar para a Árvore',
      );
      await clicarBotao('Fechar');
      await aguardar(`!${leitorAberto}`, 5000, 'o leitor não fechou');
      confere(
        await avaliar(`[...document.body.children].every((e) => !e.inert)`),
        'o resto da tela ficou inerte depois de fechar',
      );
    },
  );

  await caso(
    'Leitor de XML: erro com linha e coluna, e Ver no texto',
    async () => {
      abrirNoLeitor(gravar('pedido-malformado.xml', MALFORMADO));
      await aguardar(leitorAberto, 10000, 'o leitor não abriu');
      await aguardar(
        `!document.querySelector('.leitor-xml__erro').hidden`,
        10000,
        'faixa de erro',
      );
      const erro = await texto('.leitor-xml__erro-texto');
      confere(
        erro.startsWith('O XML tem um erro na linha 3, coluna 10 do arquivo:'),
        `erro: ${erro}`,
      );
      await clicarBotao('Ver no texto');
      await aguardar(
        `!!document.querySelector('.leitor-xml__linha--erro')`,
        5000,
        'linha do erro marcada',
      );
      confere(
        (await texto('.leitor-xml__linha--erro')).includes('</itens>'),
        'linha do erro',
      );
      await clicarBotao('Fechar');
      await aguardar(`!${leitorAberto}`, 5000, 'o leitor não fechou');
    },
  );

  await caso('Leitor de XML: binário recusado com mensagem', async () => {
    abrirNoLeitor(
      gravar('binario.xml', Buffer.from([0x3c, 0x61, 0x00, 0x01, 0x02, 0x03])),
    );
    await aguardar(leitorAberto, 10000, 'o leitor não abriu');
    await aguardar(
      `(document.querySelector('.leitor-xml__estado')?.innerText ?? '').includes('não parece um XML')`,
      10000,
      'mensagem do binário',
    );
    confere(
      await avaliar(
        `[...document.querySelectorAll('.leitor-xml button')].some((b) => b.textContent === 'Abrir no Bloco de Notas' && !b.hidden)`,
      ),
      'botão do Bloco de Notas',
    );
    await clicarBotao('Fechar');
    await aguardar(`!${leitorAberto}`, 5000, 'o leitor não fechou');
    await espera(100);
  });
}

module.exports = { casosLeitorXml };
