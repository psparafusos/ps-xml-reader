# Leitor NF-e PS

Aplicativo Windows de uso interno da PS Parafusos e Segurança LTDA. Lê o XML de
uma NF-e (layout 4.00), mostra a nota em tela e salva em PDF, em dois modos:
**Conferência** (itens, totais e anotações) e **DANFE** (A4 retrato, conforme o
Manual de Orientação do Contribuinte). Funciona 100% offline: não faz nenhuma
chamada de rede.

O PDF do modo Conferência é um documento de conferência interna e não substitui
o DANFE.

## Requisitos

- Windows 10 ou 11
- Node.js e npm (desenvolvido com Node 26 e npm 11)

## Como rodar

```bash
npm install
npm start
```

Na tela inicial, clique em **Abrir arquivo** (XML da NF-e ou cópia editada
`.psxml`) ou arraste o arquivo para a janela. O diálogo de abrir começa na pasta
do último arquivo aberto (guardada em `config.json`); se ela não existir mais,
abre no padrão do Windows. Ao lado de **Pasta de destino**, **Abrir pasta** abre
a pasta de destino no Explorer; fica desabilitado sem pasta escolhida e mostra
erro se a pasta não existir mais.

Um XML da NF-e abre a tela de escolha de modo: no topo, fornecedor (nome
fantasia ou razão social), número e série, data de emissão, valor total e
quantidade de itens, e o nome do arquivo em letra menor. Cada opção mostra a
miniatura da primeira página da nota naquele modo, gerada da nota aberta (só a
primeira página, depois que a tela aparece). Se a nota não suporta DANFE, a
opção aparece desabilitada com o motivo. Um `.psxml` pula essa tela e abre
direto na **Conferência**.

Na tabela de itens da conferência, a coluna **Anotação** recebe um texto livre
por item.

A janela tem tamanho mínimo de 1024 x 560 (cabe maximizada numa tela de
1366 x 768 com escala de 125%; a conta está em `src/main.ts`). Sem rolagem
horizontal na janela: só a tabela de itens rola na horizontal, dentro do
próprio quadro. Ao fechar, a janela guarda em `config.json` (chave `janela`) o
tamanho, a posição e se estava maximizada, e abre assim da próxima vez. Se a
posição salva não cai em nenhum monitor conectado (por exemplo, o segundo
monitor foi desligado), abre com o tamanho padrão, centralizada no monitor
principal.

A versão do app (do `package.json`) aparece discreta no canto da tela inicial.

### Atalhos

| Atalho                      | O que faz                                          |
| --------------------------- | -------------------------------------------------- |
| Ctrl+O                      | Abrir arquivo (tela inicial e barra da nota)       |
| Ctrl+S                      | Salvar                                             |
| Ctrl+P                      | Imprimir, com o mesmo aviso de impressora de cupom |
| Ctrl + / Ctrl - / Ctrl+roda | Zoom da conferência ou do DANFE                    |
| Ctrl+0                      | Zoom de volta a 100%                               |

O atalho aparece no texto de ajuda do botão. Se o botão não está na tela ou está
desabilitado (por exemplo Ctrl+S na tela inicial, ou durante um salvamento), o
atalho não faz nada. Na anotação, Ctrl+C, Ctrl+V e Ctrl+X seguem normais.

O zoom vale só na área do documento (conferência e DANFE), não na barra nem nas
telas inicial e de escolha, nos níveis do navegador (50% a 200%). Fora de 100%
aparece no canto o botão **Restaurar 100%**. Cada modo guarda o seu zoom
enquanto o app está aberto. A impressão e o PDF saem sempre em 100%, e o DANFE
é sempre paginado em 100%. Com zoom alto o DANFE pode rolar na horizontal, como
numa página da web.

A barra da nota tem três grupos. Quando falta espaço, a saída desce para uma
segunda linha; o título da nota nunca fica mais estreito que 240 px:

- Navegação: **Início** (volta para a tela inicial; com anotação não salva, faz a
  pergunta de sempre) e **Abrir outro XML**.
- Modo: o seletor **Conferência | DANFE**, que alterna sem reabrir o arquivo.
  Com um `.psxml` aberto, a opção DANFE fica desabilitada, com a explicação ao
  passar o mouse (e para o leitor de tela): "O DANFE só é gerado a partir do
  XML original."
- Saída:
  - **Pasta de destino**: escolhe a pasta onde os arquivos são gravados. O
    caminho fica em `config.json`, dentro da pasta de dados do app
    (`%APPDATA%\Leitor NF-e PS`). Colado nele, **Abrir pasta**, igual ao da
    tela inicial.
  - **Imprimir**: abre o diálogo de impressão do Windows com a tela atual. Se a
    impressora padrão for de cupom, avisa antes; Cancelar não abre o diálogo. A
    lista de nomes de impressora de cupom fica em `src/impressoras.ts`: ELGIN,
    térmica, 80mm, 58mm, POS só como palavra inteira (POS-80 e POS58 casam,
    Positivo não) e TM-T seguido de dígitos (EPSON TM-T20X-II).
  - **Salvar**, o único botão principal: na conferência, grava na pasta de
    destino o PDF (A4 retrato) e a cópia editada; no DANFE, só o PDF. Se algum
    arquivo já existir, pergunta antes de substituir. Enquanto grava, mostra
    "Salvando...".

Os nomes saem dos dados da nota, não do nome do arquivo aberto
(`src/nfe/nome.ts`):

```
<FORNECEDOR>_NF<número>_Conferencia.pdf
<FORNECEDOR>_NF<número>_Conferencia.psxml
<FORNECEDOR>_NF<número>_DANFE.pdf
```

Por exemplo `CISER_NF2330596_Conferencia.pdf`. FORNECEDOR é o nome fantasia
(`xFant`) do emitente; sem ele, as duas primeiras palavras significativas da
razão social, ignorando LTDA, S/A, SA, ME, EPP, EIRELI, CIA, as preposições DE,
DA, DO, DAS, DOS, o E e letras soltas. Fica em maiúsculas, sem acento, só letras
e números, palavras unidas por hífen, com no máximo 20 caracteres. O número vai
sem zeros à esquerda; série diferente de 1 acrescenta `-S<série>`
(`NF2330596-S2`). Nota sem emitente ou sem número usa o nome do arquivo aberto.
Um `.psxml` com nome no formato antigo abre normalmente e, ao salvar, recebe o
nome novo.

Sucesso aparece como um aviso pequeno no centro da janela, que some sozinho. Ao
salvar, o aviso tem duas linhas: o nome do arquivo em cima (na conferência, o
nome base e "PDF e PSXML" em letra menor; nome longo é encurtado no meio com
reticências) e "Salvo" embaixo, por cerca de 2,5 s. "Copiado" e "Chave copiada"
continuam em uma linha, por cerca de 1,5 s. Erro aparece em vermelho, fixo na
janela, até ser fechado.

### Ordenar (modo Conferência)

Clicar no título de uma coluna alterna crescente, decrescente e ordem da nota;
coluna que ordena leva a seta dupla, e a coluna ordenada, a seta da direção em
branco sobre preto. Acima da tabela, à esquerda, a barra **Ordenar por** mostra
a escolha atual e abre as opções. Fora da ordem da nota, a escolha fica em
destaque amarelo e aparece um × ("Voltar à ordem da nota"). As opções incluem
**Agrupar por CST** (orig +
CST ou orig + CSOSN do ICMS, grupos em ordem crescente e, dentro deles, a ordem
da nota) e, para o código, **como texto** ou **como número**. Texto ordena por
`localeCompare` pt-BR e números como número; empate mantém a ordem da nota. A
ordem vale para a tela, a impressão e o PDF, e vai para o `.psxml`. O DANFE sai
sempre na ordem do XML.

### Copiar

- Botão **Copiar** ao lado da chave de acesso (44 dígitos, sem espaço).
- Botão direito: na anotação, Recortar, Copiar, Colar e Selecionar tudo; com
  texto selecionado, Copiar; numa célula da tabela de itens, "Copiar <coluna>"
  e "Copiar linha" (campos separados por tabulação, para colar no Excel); na
  chave de acesso (conferência e DANFE), "Copiar chave".

### Modo DANFE

- A4 retrato, folhas soltas, margem de 0,5 cm; fonte Times New Roman.
- Só imprime o que está no XML; campo sem valor fica em branco, com o quadro.
- Fatura/Duplicatas só com `cobr`; Cálculo do ISSQN só com ISSQN no XML.
- Itens divididos entre as folhas medindo a altura real de cada linha; todas as
  folhas repetem o cabeçalho com "FOLHA X/Y".
- Código de barras CODE-128C da chave desenhado em SVG, sem biblioteca.
- `tpAmb = 2`: marca d'água "SEM VALOR FISCAL".
- Contingência (`tpEmis` diferente de 1, 6 e 7) ou modelo diferente de 55: o
  DANFE não é gerado; a conferência continua funcionando.
- O DANFE só é gerado de um XML original, nunca de um `.psxml`.

O app nunca grava em uma NF-e original (raiz `nfeProc` ou `NFe`): qualquer
gravação cujo destino seja o próprio XML aberto é recusada. Uma cópia editada
aberta pode ser substituída, sempre com a pergunta de substituir.

A gravação é segura: os arquivos vão primeiro para temporários na pasta de
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
  <ordem criterio="vTotal" direcao="desc"/>
</psCopiaEditada>
```

`<ordem>` guarda a ordem dos itens na conferência: `criterio` é `nota`, `cst`,
`codigo-texto`, `codigo-numero` ou o id de uma coluna (`src/nfe/colunas.ts`), e
`direcao` é `asc` ou `desc`. Cópia antiga, sem esse elemento, abre na ordem da
nota.

A raiz não é `nfeProc` nem `NFe`, então a cópia não é aceita como NF-e por
nenhum sistema fiscal. Ao abrir uma cópia, o app lê a nota de dentro de
`original`, devolve as anotações aos itens, abre direto na conferência e mostra
"Cópia editada, sem validade fiscal" na barra e no rodapé do PDF. Salvar uma cópia reaproveita o mesmo
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
  preload.ts         contextBridge com a API psApi (abrir, pasta, salvar, imprimir, copiar)
  impressoras.ts     lista de nomes de impressora de cupom (aviso antes de imprimir)
  renderer.ts        monta a tela a partir do objeto Nota
  declarations.d.ts  tipos globais (window.psApi)
  nfe/parser.ts      texto XML ou .psxml -> Nota e anotações (usa DOMParser)
  nfe/copia.ts       monta o .psxml (original + anotações) com DOM e XMLSerializer
  nfe/colunas.ts     colunas da tabela de itens (ordem, rótulo, alinhamento, visível, ordenação)
  nfe/ordem.ts       ordenação dos itens na conferência (critérios, comparação estável)
  nfe/nome.ts        nome dos arquivos salvos a partir dos dados da nota
  nfe/tipos.ts       interfaces Nota, Emitente, Destinatario, Item, Totais, Transporte
  nfe/formato.ts     formatação pt-BR: moeda, quantidade, data, CNPJ, chave de acesso
  styles/tokens.css  variáveis de cor, tipografia e medidas
  styles/app.css     tela
  styles/print.css   @media print (usado pelo PDF)
  danfe/dados.ts     XML -> campos do DANFE (separado do Nota da conferência)
  danfe/danfe.ts     montagem dos quadros e paginação do DANFE
  danfe/code128.ts   código de barras CODE-128C (tabela, DV, barras)
  danfe/danfe.css    layout do DANFE em mm/pt, tela e impressão
index.html           estrutura da página
forge.config.mts     configuração do Electron Forge (instalador Squirrel)
samples/             XMLs de teste locais (fora do git, nunca versionar)
```

## Regras do projeto

- Tudo que aparece na tela vem do XML. Campo ausente deixa a célula vazia ou
  esconde a seção. Nenhum texto padrão é inventado.
- Sem dependências além das que o template do Electron Forge instala.
- `samples/` contém dados reais de fornecedores e está no `.gitignore`.
