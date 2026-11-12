// Entrada do utilityProcess do serviço de leitura pesada. Recebe um pedido
// por vez do processo principal (src/servico/principal.ts), confere o
// formato, executa (src/servico/tarefas.ts) e devolve o andamento e o
// resultado. Não escolhe arquivo nenhum: o caminho (ou os bytes) vem pronto
// do principal, que já validou. Tempo, memória e cancelamento ficam do lado
// de fora: o principal mata este processo e cria outro.

import { pedidoValido, type MensagemDoFilho } from './protocolo';
import { executarTarefa } from './tarefas';

interface PortaPai {
  on(evento: 'message', ouvinte: (e: { data: unknown }) => void): void;
  postMessage(mensagem: MensagemDoFilho): void;
}

const porta = (process as unknown as { parentPort?: PortaPai }).parentPort;

if (porta) {
  porta.on('message', ({ data }) => {
    if (!pedidoValido(data)) {
      // Sem id confiável: responde com id 0, que o principal ignora.
      porta.postMessage({ id: 0, tipo: 'falha', mensagem: 'Pedido inválido.' });
      return;
    }
    const { id, tarefa } = data;
    executarTarefa(tarefa, (etapa) =>
      porta.postMessage({ id, tipo: 'progresso', etapa }),
    ).then(
      (resultado) => porta.postMessage({ id, tipo: 'resultado', resultado }),
      (erro: unknown) =>
        porta.postMessage({
          id,
          tipo: 'falha',
          mensagem: erro instanceof Error ? erro.message : String(erro),
        }),
    );
  });
}
