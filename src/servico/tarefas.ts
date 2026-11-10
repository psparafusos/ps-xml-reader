// As tarefas do serviço de leitura pesada: XML genérico, NF-e grande e
// planilhas de referência. Sem Electron: o mesmo código roda no
// utilityProcess (src/servico/servicoPesado.ts) e, só se o filho não subir,
// no processo principal como reserva (src/servico/principal.ts).

import { lerPlanilha } from '../fiscal/leituraPlanilha';
import { lerParaLeitor } from '../leitorXml/arquivo';
import { lerXmlSeguro } from '../seguranca/arquivo';
import { ArquivoRecusadoError } from '../seguranca/xml';
import type { EtapaProgresso, ResultadoNfe, Tarefa } from './protocolo';

/** Executa a tarefa; lança só em falha inesperada (o arquivo nunca derruba). */
export async function executarTarefa(
  tarefa: Tarefa,
  aoEtapa: (etapa: EtapaProgresso) => void = () => {},
): Promise<unknown> {
  if (tarefa.tipo === 'xml') {
    return lerParaLeitor(tarefa.caminho, undefined, undefined, aoEtapa);
  }
  if (tarefa.tipo === 'nfe') {
    aoEtapa('lendo');
    try {
      const texto = await lerXmlSeguro(tarefa.caminho);
      return { ok: true, texto } satisfies ResultadoNfe;
    } catch (erro) {
      if (erro instanceof ArquivoRecusadoError)
        return { ok: false, mensagem: erro.message } satisfies ResultadoNfe;
      throw erro;
    }
  }
  aoEtapa('planilha');
  return lerPlanilha(tarefa.documento, tarefa.dados);
}
