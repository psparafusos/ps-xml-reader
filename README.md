# Leitor NF-e PS

Aplicativo Windows de uso interno da PS Parafusos e Segurança LTDA. Lê o XML de
uma NF-e (layout 4.00), mostra a nota em tela e salva em PDF para conferência.
Funciona 100% offline: não faz nenhuma chamada de rede.

O PDF gerado é um documento de conferência interna e não substitui o DANFE.

## Requisitos

- Windows 10 ou 11
- Node.js e npm (desenvolvido com Node 26 e npm 11)

## Como rodar

```bash
npm install
npm start
```

Na tela inicial, clique em **Abrir XML** ou arraste um arquivo `.xml` ou
`.psxml` para a janela e escolha o modo **Conferência** (o modo DANFE ainda não
existe). Na tabela de itens, a coluna **Anotação** recebe um texto livre por
item.

- **Pasta de destino**: escolhe a pasta onde os arquivos são gravados. O caminho
  fica em `config.json`, dentro da pasta de dados do app
  (`%APPDATA%\Leitor NF-e PS`).
- **Imprimir**: abre o diálogo de impressão do Windows com a tela atual.
- **Salvar**: grava na pasta de destino `<nome>-ps.pdf` (A4 retrato) e
  `<nome>-ps.psxml` (cópia editada). Se algum dos dois já existir, pergunta
  antes de substituir.

O app nunca grava em uma NF-e original (raiz `nfeProc` ou `NFe`): qualquer
gravação cujo destino seja o próprio XML aberto é recusada. Uma cópia editada
aberta pode ser substituída, sempre com a pergunta de substituir.

A gravação é segura: os dois arquivos vão primeiro para temporários na pasta de
destino e só então substituem os finais. Se algo falhar, os arquivos antigos
ficam como estavam e os temporários são apagados.

Se houver anotações alteradas e não salvas, abrir outro arquivo ou fechar a
janela pergunta **Salvar**, **Descartar** ou **Cancelar**.

## Cópia editada (.psxml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<psCopiaEditada xmlns="urn:psparafusos:ps-xml-reader" versao="1">
  <aviso>Cópia de uso interno. Não é NF-e e não tem validade fiscal.</aviso>
  <original>
    <!-- elemento raiz do XML original (nfeProc ou NFe), sem alteração -->
  </original>
  <anotacoes>
    <anotacao nItem="5">texto</anotacao>
  </anotacoes>
</psCopiaEditada>
```

A raiz não é `nfeProc` nem `NFe`, então a cópia não é aceita como NF-e por
nenhum sistema fiscal. Ao abrir uma cópia, o app lê a nota de dentro de
`original`, devolve as anotações aos itens e mostra "Cópia editada, sem validade
fiscal" na barra e no rodapé do PDF. Salvar uma cópia reaproveita o mesmo
`original`, sem embrulhar de novo.

## Como gerar o instalador

```bash
npm run make
```

O instalador fica em `out\make\squirrel.windows\x64\`, com o nome
`Leitor NF-e PS-<versão> Setup.exe`. Não há assinatura de código configurada, então
o Windows pode mostrar o aviso do SmartScreen na primeira instalação.

## Outros comandos

| Comando             | O que faz                          |
| ------------------- | ---------------------------------- |
| `npm run typecheck` | Verifica os tipos TypeScript       |
| `npm run lint`      | Roda oxlint e confere a formatação |

## Estrutura

```
src/
  main.ts            processo principal: janela, diálogos, printToPDF
  preload.ts         contextBridge com a API psApi (abrir, pasta, salvar, imprimir)
  renderer.ts        monta a tela a partir do objeto Nota
  declarations.d.ts  tipos globais (window.psApi)
  nfe/parser.ts      texto XML ou .psxml -> Nota e anotações (usa DOMParser)
  nfe/copia.ts       monta o .psxml (original + anotações) com DOM e XMLSerializer
  nfe/colunas.ts     colunas da tabela de itens (ordem, rótulo, alinhamento, visível)
  nfe/tipos.ts       interfaces Nota, Emitente, Destinatario, Item, Totais, Transporte
  nfe/formato.ts     formatação pt-BR: moeda, quantidade, data, CNPJ, chave de acesso
  styles/tokens.css  variáveis de cor, tipografia e medidas
  styles/app.css     tela
  styles/print.css   @media print (usado pelo PDF)
index.html           estrutura da página
forge.config.mts     configuração do Electron Forge (instalador Squirrel)
samples/             XMLs de teste locais (fora do git, nunca versionar)
```

## Regras do projeto

- Tudo que aparece na tela vem do XML. Campo ausente deixa a célula vazia ou
  esconde a seção. Nenhum texto padrão é inventado.
- Sem dependências além das que o template do Electron Forge instala.
- `samples/` contém dados reais de fornecedores e está no `.gitignore`.
