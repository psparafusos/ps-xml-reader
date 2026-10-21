// Monta a cópia editada (.psxml): o elemento raiz do XML original, copiado sem
// alteração, mais as anotações dos itens. Usa só DOM: o texto do usuário entra
// por createTextNode e setAttribute, nunca concatenado em string XML.

import { lerDocumento, localizarOriginal, NS_PS } from './parser';

const AVISO = 'Cópia de uso interno. Não é NF-e e não tem validade fiscal.';

// Caracteres que não podem existir em XML 1.0. O XMLSerializer não os
// rejeita, e o arquivo sairia ilegível.
// oxlint-disable-next-line no-control-regex -- justamente os caracteres de controle inválidos em XML
const INVALIDOS_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/**
 * Gera o texto do .psxml. `textoArquivo` é o arquivo aberto (XML de NF-e ou
 * cópia editada); de uma cópia, reaproveita o original de dentro dela.
 * Só itens com anotação não vazia entram em <anotacoes>.
 */
export function montarCopia(
  textoArquivo: string,
  anotacoes: Map<string, string>,
): string {
  const { original } = localizarOriginal(lerDocumento(textoArquivo));

  const doc = document.implementation.createDocument(
    NS_PS,
    'psCopiaEditada',
    null,
  );
  const raiz = doc.documentElement;
  raiz.setAttribute('versao', '1');

  const quebra = (recuo: string) => doc.createTextNode(`\n${recuo}`);
  const elemento = (nome: string) => doc.createElementNS(NS_PS, nome);

  const aviso = elemento('aviso');
  aviso.textContent = AVISO;

  const elOriginal = elemento('original');
  elOriginal.append(
    quebra('    '),
    doc.importNode(original, true),
    quebra('  '),
  );

  const elAnotacoes = elemento('anotacoes');
  const ordenadas = [...anotacoes].sort(([a], [b]) => Number(a) - Number(b));
  for (const [nItem, texto] of ordenadas) {
    const limpo = texto.replace(INVALIDOS_XML, '');
    if (!limpo.trim()) continue;
    const a = elemento('anotacao');
    a.setAttribute('nItem', nItem);
    a.textContent = limpo;
    elAnotacoes.append(quebra('    '), a);
  }
  if (elAnotacoes.childNodes.length > 0) elAnotacoes.append(quebra('  '));

  raiz.append(
    quebra('  '),
    aviso,
    quebra('  '),
    elOriginal,
    quebra('  '),
    elAnotacoes,
    quebra(''),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}\n`;
}
