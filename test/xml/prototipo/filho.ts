// Protótipo (etapa 3): o lado do utilityProcess. Recebe o texto já
// decodificado pelo processo principal, roda o leitor próprio e devolve a
// árvore. Não faz parte do app; é empacotado pelo principal.mjs com o Vite.
//
// Modos de teste:
// - "ler": lerXml normal.
// - "travar": laço sem fim, para provar que o tempo limite mata o processo.
// - "memoria": aloca até estourar, para provar que o limite de memória
//   derruba só este processo.

import { lerXml } from '../../../src/xml/leitor';

interface Pedido {
  modo: 'ler' | 'travar' | 'memoria';
  texto?: string;
  devolverArvore?: boolean;
}

interface PortaPai {
  on(evento: 'message', ouvinte: (e: { data: Pedido }) => void): void;
  postMessage(mensagem: unknown): void;
}

const porta = (process as unknown as { parentPort: PortaPai }).parentPort;

porta.on('message', ({ data }) => {
  if (data.modo === 'travar') {
    for (;;) {
      // Nunca sai: o principal tem de matar pelo tempo limite.
    }
  }
  if (data.modo === 'memoria') {
    const guardados: number[][] = [];
    for (;;) guardados.push(Array(1_000_000).fill(guardados.length));
  }
  const inicio = performance.now();
  const leitura = lerXml(data.texto ?? '');
  const leituraMs = performance.now() - inicio;
  const memoria = process.memoryUsage();
  porta.postMessage({
    leituraMs,
    nos: leitura.quantidade,
    erro: leitura.erro,
    profundidadeExcedida: leitura.profundidadeExcedida,
    controles: leitura.controles,
    heapMB: Math.round(memoria.heapUsed / 1048576),
    rssMB: Math.round(memoria.rss / 1048576),
    enviadoEm: Date.now(),
    leitura: data.devolverArvore ? leitura : null,
  });
});
