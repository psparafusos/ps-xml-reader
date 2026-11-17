// Cópias dos perfis excluídos ou substituídos, na pasta de dados do app
// (perfis-excluidos\). Antes de excluir um perfil, de trocar o conteúdo dele
// pelo de um arquivo importado ou de voltar ao padrão, o processo principal
// grava aqui o perfil como estava, no mesmo formato do Exportar: a cópia
// volta pelo Importar. Ficam as 10 mais recentes; arquivo com outro nome
// nessa pasta nunca é apagado. Sem Electron: o processo principal passa a
// pasta de dados, e os testes, uma pasta temporária.

import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { carimbo, gravarAtomico } from './configSeguro';
import {
  LIMITE_PERFIS_EXCLUIDOS,
  PASTA_PERFIS_EXCLUIDOS,
  nomeArquivoPerfil,
  textoArquivoPerfil,
  type Perfil,
} from './nfe/perfis';

export { LIMITE_PERFIS_EXCLUIDOS, PASTA_PERFIS_EXCLUIDOS };

/** Por que a cópia foi feita (vai no nome do arquivo). */
export type MotivoCopiaPerfil = 'excluido' | 'substituido' | 'padrao';

const ROTULO_MOTIVO: Record<MotivoCopiaPerfil, string> = {
  excluido: 'excluido',
  substituido: 'substituido',
  padrao: 'antes do padrao',
};

/** Data, hora e número de ordem do nome de uma cópia, ou null se não é dela. */
function ordemDaCopia(nome: string): [string, number] | null {
  const m =
    /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-(\d+))? .+ - PS Reader - perfil .*\.json$/.exec(
      nome,
    );
  return m ? [m[1], m[2] ? Number(m[2]) : 1] : null;
}

/** As cópias guardadas em `pasta` (a pasta de dados), da mais nova para a mais antiga. */
export function copiasDePerfis(pasta: string): string[] {
  let nomes: string[];
  try {
    nomes = readdirSync(path.join(pasta, PASTA_PERFIS_EXCLUIDOS));
  } catch {
    return [];
  }
  return nomes
    .map((n) => ({ n, o: ordemDaCopia(n) }))
    .filter((x): x is { n: string; o: [string, number] } => x.o !== null)
    .sort((a, b) =>
      a.o[0] !== b.o[0] ? (a.o[0] < b.o[0] ? 1 : -1) : b.o[1] - a.o[1],
    )
    .map((x) => x.n);
}

/**
 * Grava a cópia de `perfil` (como estava) e apaga as que passam do limite.
 * Devolve o caminho completo da cópia. Lança se não conseguir gravar: quem
 * chama não exclui nem substitui nada sem a cópia.
 */
export function guardarCopiaPerfil(
  pasta: string,
  perfil: Perfil,
  motivo: MotivoCopiaPerfil,
  agora: Date,
): string {
  const dir = path.join(pasta, PASTA_PERFIS_EXCLUIDOS);
  const fim = `${ROTULO_MOTIVO[motivo]} - ${nomeArquivoPerfil(perfil.nome)}`;
  // Outra cópia no mesmo segundo: -2, -3... (a ordem do tempo fica no nome).
  const c = carimbo(agora);
  const mesmoSegundo = copiasDePerfis(pasta)
    .map(ordemDaCopia)
    .filter((o): o is [string, number] => o !== null && o[0] === c)
    .map((o) => o[1]);
  const nome = mesmoSegundo.length
    ? `${c}-${Math.max(...mesmoSegundo) + 1} ${fim}`
    : `${c} ${fim}`;
  const caminho = path.join(dir, nome);
  gravarAtomico(caminho, textoArquivoPerfil(perfil));
  try {
    for (const velha of copiasDePerfis(pasta).slice(LIMITE_PERFIS_EXCLUIDOS))
      rmSync(path.join(dir, velha), { force: true });
  } catch {
    // Cópia antiga presa: sai na próxima.
  }
  return caminho;
}
