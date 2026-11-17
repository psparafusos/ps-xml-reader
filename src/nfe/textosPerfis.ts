// Textos das confirmações e avisos de perfis (excluir, substituir por um
// importado, voltar ao padrão, exportado). Num lugar só para os testes
// conferirem o que a pessoa lê antes de cada ação. Lógica pura: o renderer
// usa.

import { LIMITE_PERFIS_EXCLUIDOS, PASTA_PERFIS_EXCLUIDOS } from './perfis';

/** Onde fica a cópia feita antes de excluir, substituir ou voltar ao padrão. */
export const TEXTO_COPIA_PERFIL = `Antes, uma cópia do perfil como está agora fica na pasta ${PASTA_PERFIS_EXCLUIDOS}, dentro da pasta de dados do app (Configurações, Dados do app), e pode voltar pelo Importar. Ficam as ${LIMITE_PERFIS_EXCLUIDOS} cópias mais recentes.`;

/** Confirmação do Excluir. `novoAtivo`: quem fica ativo, se o excluído é o ativo. */
export function textoExcluirPerfil(
  nome: string,
  novoAtivo: string | null,
): string {
  const ativo = novoAtivo
    ? ` O perfil "${novoAtivo}" passa a ser o ativo.`
    : '';
  return `O perfil "${nome}" sai da lista, com as colunas, as anotações extras e a orientação dele. O texto já salvo nos arquivos .psxml não muda.${ativo} ${TEXTO_COPIA_PERFIL}`;
}

/** Importar com o nome de um perfil que já existe: Substituir ou Importar como cópia. */
export function textoImportarRepetido(nome: string, nomeCopia: string): string {
  return `Já existe um perfil "${nome}". Substituir: as colunas, as anotações extras e a orientação dele passam a ser as do arquivo. ${TEXTO_COPIA_PERFIL} Importar como cópia: os dois ficam, e o do arquivo entra como "${nomeCopia}".`;
}

/** Confirmação do Restaurar padrão. */
export function textoRestaurarPadrao(nome: string): string {
  return `As colunas, as anotações extras, a orientação e o layout do perfil "${nome}" voltam ao padrão. O texto já salvo nos arquivos .psxml não muda. ${TEXTO_COPIA_PERFIL}`;
}

/** Aviso depois de exportar (o caminho vai à parte, selecionável). */
export function textoPerfilExportado(nome: string): string {
  return `O perfil "${nome}" foi exportado para este arquivo. Para usar em outro computador, leve o arquivo e escolha Importar em Gerenciar perfis.`;
}
