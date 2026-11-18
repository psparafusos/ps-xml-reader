// Só com PS_JANELA_DANFE (uma pasta): abre cada NF-e inventada de
// test/janela/fixtures (raiz nfeProc, modelo 55) como num duplo clique e
// grava o HTML do DANFE montado em <pasta>/<fixture>.html. Serve para
// comparar o DANFE de duas versões do app (rodando o test:janela de cada
// uma com a mesma pasta de saída e comparando os arquivos). Chamado por
// executar.cjs. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');

async function casosDanfeHtml(c) {
  const pasta = process.env.PS_JANELA_DANFE;
  if (!pasta) return;
  fs.mkdirSync(pasta, { recursive: true });
  const nfes = fs
    .readdirSync(FIXTURES)
    .filter((n) => n.endsWith('.xml'))
    .filter((n) => {
      const t = fs.readFileSync(path.join(FIXTURES, n), 'utf8');
      return /<nfeProc\b/.test(t) && /<mod>55<\/mod>/.test(t);
    });
  for (const nome of nfes) {
    await c.caso(`DANFE em HTML para comparar: ${nome}`, async () => {
      const alvo = path.join(c.notas, `danfe-html-${nome}`);
      fs.copyFileSync(path.join(FIXTURES, nome), alvo);
      c.abrir(alvo);
      // NF-e que o app recusa (caractere inválido, por exemplo): grava a
      // mensagem, que também precisa ser a mesma nas duas versões.
      await c.aguardar(
        `(() => { const d = document.getElementById('danfe'); const m = document.getElementById('mensagem'); return (!!d && !d.hidden && d.querySelectorAll('.folha').length > 0) || (!!m && !m.hidden); })()`,
        30000,
        `o DANFE de ${nome} não apareceu`,
      );
      await c.espera(300);
      const html = await c.avaliar(`(() => {
        const d = document.getElementById('danfe');
        if (!d.hidden && d.querySelector('.folha')) return d.innerHTML;
        return 'RECUSADO: ' + document.getElementById('mensagem-texto').textContent;
      })()`);
      fs.writeFileSync(path.join(pasta, `${nome}.html`), html);
      await c.inicio();
    });
  }
}

module.exports = { casosDanfeHtml };
