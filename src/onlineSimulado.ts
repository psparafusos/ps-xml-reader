// Só para desenvolvimento: troca o acesso à internet da verificação online
// e do Atualizar por arquivos locais, para testar e fazer as capturas sem
// rede. Vale só com o app NÃO empacotado e a variável de ambiente
// PS_READER_ONLINE_SIMULADO apontando para uma pasta com:
//   pagina-st.html  a página do CONFAZ (links "Versão 00XX" com o .xlsx)
//   tipi.xlsx       o arquivo da TIPI
//   <nome>.xlsx     cada planilha que a página aponta, pelo nome no endereço
// PS_READER_ONLINE_ATRASO_MS (opcional) faz o download andar em 20 pedaços
// com essa pausa entre eles, para ver o indicador de progresso.
// No app instalado isto não faz nada: a busca é sempre o net.fetch.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ARQUIVO_TIPI, PAGINA_ST, type Buscar } from './fiscal/online';

export function buscaSimulada(empacotado: boolean): Buscar | null {
  const pasta = process.env.PS_READER_ONLINE_SIMULADO;
  if (empacotado || !pasta) return null;
  const atraso = Math.max(
    0,
    Number(process.env.PS_READER_ONLINE_ATRASO_MS) || 0,
  );
  console.warn(`Verificação online simulada com os arquivos de ${pasta}.`);
  return async (url, init) => {
    const arquivo =
      url === PAGINA_ST
        ? 'pagina-st.html'
        : url === ARQUIVO_TIPI
          ? 'tipi.xlsx'
          : path.basename(decodeURIComponent(new URL(url).pathname));
    const caminho = path.join(pasta, arquivo);
    let dados: Uint8Array;
    let modificado: Date;
    try {
      dados = new Uint8Array(await readFile(caminho));
      modificado = (await stat(caminho)).mtime;
    } catch {
      return new Response('não encontrado', { status: 404 });
    }
    const cabecalhos = new Headers({
      'last-modified': modificado.toUTCString(),
    });
    // Verificação da TIPI: só o primeiro byte, como no servidor da Receita.
    if (new Headers(init.headers).get('range') === 'bytes=0-0') {
      cabecalhos.set('content-range', `bytes 0-0/${dados.length}`);
      return new Response(dados.slice(0, 1), {
        status: 206,
        headers: cabecalhos,
      });
    }
    cabecalhos.set('content-length', String(dados.length));
    const corpo = new ReadableStream<Uint8Array>({
      async start(c) {
        const pedaco =
          atraso > 0 ? Math.max(1, Math.ceil(dados.length / 20)) : dados.length;
        for (let i = 0; i < dados.length; i += pedaco) {
          if (atraso > 0) await new Promise((r) => setTimeout(r, atraso));
          c.enqueue(dados.slice(i, i + pedaco));
        }
        c.close();
      },
    });
    return new Response(corpo, { status: 200, headers: cabecalhos });
  };
}
