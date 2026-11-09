// Opções de linha de comando que mudam o comportamento do app empacotado e
// não têm uso legítimo para quem abre uma nota: depuração remota (controle
// da janela por uma porta local), inspetor do Node, opções do V8 e troca da
// pasta de dados. O Chromium aceita algumas mesmo no app empacotado e não há
// fuse para elas. Lógica pura, sem Electron.
//
// Um caminho de arquivo nunca é confundido com opção: o Explorer passa o
// caminho completo ("C:\...\--remote-debugging-port=9222.xml"), que começa
// com a letra da unidade ou com \\.

/** Nomes (sem prefixo, minúsculos) recusados; "inspect" cobre inspect-brk etc. */
const PERIGOSAS: { nome: string; prefixo: boolean }[] = [
  { nome: 'remote-debugging-port', prefixo: false },
  { nome: 'remote-debugging-pipe', prefixo: false },
  { nome: 'inspect', prefixo: true },
  { nome: 'js-flags', prefixo: false },
  { nome: 'user-data-dir', prefixo: false },
];

/**
 * Prefixos de opção que o Chromium entende no Windows: "--", "-" e "/".
 * Depois de um "--" sozinho, nada mais é opção.
 */
const RE_OPCAO = /^(?:--|-|\/)([a-z][a-z0-9-]*)(?:=|$)/i;

/** Opções perigosas encontradas em `argv` (vazio se nenhuma), na ordem. */
export function opcoesPerigosas(argv: readonly string[]): string[] {
  const achadas: string[] = [];
  for (const arg of argv.slice(1)) {
    if (arg === '--') break;
    const m = RE_OPCAO.exec(arg);
    if (!m) continue;
    const nome = m[1].toLowerCase();
    if (
      PERIGOSAS.some((p) =>
        p.prefixo ? nome.startsWith(p.nome) : nome === p.nome,
      )
    )
      achadas.push(arg);
  }
  return achadas;
}
