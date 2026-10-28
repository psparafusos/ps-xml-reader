# PS Reader

Aplicativo Windows de uso interno da PS Parafusos e Segurança LTDA. Lê o XML de
uma NF-e (layout 4.00), mostra a nota em tela e salva em PDF, em dois modos:
**Conferência** (itens, totais e anotações) e **DANFE** (A4 retrato, conforme o
Manual de Orientação do Contribuinte). Funciona 100% offline: não faz nenhuma
chamada de rede.

O PDF do modo Conferência é um documento de conferência interna e não substitui
o DANFE.

## Versão 1.1.1

- **Abrir aqui** e **Nova janela** sobre as prévias também na tela de escolha
  de uma janela vazia.
- Arquivo que já existe (PDF ou `.psxml`): a pergunta, no visual do app, é
  **Substituir**, **Salvar cópia...** ou **Cancelar**.
- Perfis: bloco **Perfil ativo** com **Trocar perfil**, que abre a lista dos
  perfis (renomear e excluir na própria linha).

## Versão 1.1.0

- **Editar colunas** na Conferência: escolher, ordenar e dar largura às
  colunas da tabela de itens, com anotações extras (uma caixa de texto por
  item) e prévia.
- **Orientação e folha**: retrato ou paisagem automático, fonte que desce até
  7 pt e tabela dividida em partes quando não cabe, com aviso antes.
- **Salvar**: na Conferência grava o `.psxml`; a seta ao lado tem **Salvar
  PDF** e **Salvar cópia...**. Alterações não salvas: Salvar, Salvar cópia,
  Descartar ou Cancelar.
- **Várias janelas**: cada nota na sua janela, com a escolha por cima da nota
  (Abrir aqui ou Nova janela).
- **Perfis de configuração**: trocar, criar, renomear, excluir, exportar e
  importar, valendo para todas as janelas.

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

Ao passar o mouse (ou com o foco) numa prévia, ela fica desfocada e
semitransparente, com dois botões: **Abrir aqui** (abre nesta janela, naquele
modo) e **Nova janela** (abre numa janela nova, naquele modo; esta volta para a
tela inicial). Clicar na própria prévia é o mesmo que **Abrir aqui**. Na tela de
escolha de uma janela vazia, **Abrir aqui** fica em destaque; na escolha por
cima de uma nota aberta (ver Várias janelas), **Nova janela**.

Embaixo de cada miniatura, **Salvar PDF** grava só o PDF daquele modo na pasta
de destino (`<FORNECEDOR>_NF<número>_Conferencia.pdf` ou `..._DANFE.pdf`), sem
entrar no modo. Sem pasta escolhida, pede a pasta antes. Se o PDF já existe,
faz a mesma pergunta de Substituir, Salvar cópia ou Cancelar (ver Salvar
cópia). Se a nota não suporta DANFE, o **Salvar PDF** do DANFE fica
desabilitado.

### Várias janelas

Cada janela tem a sua nota. O app continua sendo um processo só (instância
única), mas um arquivo que chega abre numa janela própria:

- Arquivo que já está aberto em alguma janela: essa janela vem para a frente,
  em vez de abrir outra.
- Janela na tela inicial (sem nota): é reaproveitada.
- Duplo clique num `.psxml` (com o app fechado ou aberto): abre direto na
  **Conferência**, numa janela vazia ou numa janela nova.
- `.psxml` pelo **Abrir outro XML** (ou arrastado) com uma nota aberta: janela
  nova, direto na **Conferência**.
- XML pelo **Abrir outro XML** (ou arrastado) com uma nota aberta: a tela de
  escolha aparece por cima da nota, que fica como estava, com **Abrir aqui** e
  **Nova janela** sobre as prévias (**Nova janela** em destaque). **Abrir aqui**
  troca a nota desta janela e, com anotação não salva, pergunta antes. Os
  **Salvar PDF** das prévias continuam e gravam o PDF do XML da escolha, sem
  mexer na nota de baixo. **Voltar à nota** (ou Esc) fecha a escolha.

Janelas novas abrem deslocadas 32 px da anterior; se passarem da área de
trabalho do monitor, voltam para o canto dele. O tamanho e a posição lembrados
valem para a primeira janela, e quem os grava ao fechar é a janela mais antiga
aberta. Todas usam o mesmo AUMID, então a barra de tarefas junta as janelas
no ícone fixado.

É de cada janela: o arquivo aberto, as anotações não salvas, a pasta de
destino do duplo clique e o título. É do app inteiro (processo principal):
a personalização da conferência e a pasta de destino salva. Quando uma delas
muda numa janela, as outras atualizam na hora (a tabela de itens é remontada
com as colunas novas; o botão **Pasta de destino** mostra a pasta nova, menos
nas janelas que têm a pasta do duplo clique).

Fechar uma janela com anotação não salva pergunta só por ela. Fechar o app
(por exemplo **Fechar todas as janelas** na barra de tarefas) pergunta por
cada janela com anotação não salva, uma de cada vez, trazendo-a para a frente;
**Cancelar** em qualquer uma interrompe o fechamento e nenhuma janela fecha.
Pedidos de fechar que chegam juntos (em até 250 ms) contam como um só.

O `.xml` continua abrindo com o programa de antes no duplo clique; um `.xml`
passado na linha de comando (`"PS Reader.exe" nota.xml`) também abre.

Um `.psxml` aberto por duplo clique faz da pasta dele a pasta de destino só
naquela janela: o botão **Pasta de destino** dela mostra essa pasta com a marca
"só nesta janela", e um aviso explica que a pasta salva volta quando a janela
fechar. Essa pasta fica só na memória e nunca é gravada no `config.json`.
Escolher uma pasta no botão vence: ela vira a pasta salva e a da janela deixa
de valer. Abrir um `.psxml` pelo **Abrir arquivo**, pelo **Abrir outro XML** ou
arrastando não muda a pasta.

Na tabela de itens da conferência, a coluna **Anotação** recebe um texto livre
por item.

### Editar colunas (modo Conferência)

Na barra acima da tabela de itens, à direita, **Editar colunas** abre um painel
com todas as colunas, inclusive EAN e as anotações extras. Marque ou desmarque
cada uma e arraste pela alça (ou use as setas do teclado na alça) para mudar a
ordem. Ao lado, a prévia mostra a tabela com quatro itens fictícios, o
cabeçalho em destaque e as linhas sumindo para baixo; ela muda a cada clique.
**Aplicar** salva e remonta a tabela; **Cancelar** (ou Esc) volta ao que era.
A configuração vale para todas as notas, na tela, na impressão e no PDF. O
DANFE não muda.

Anotações extras: cada uma vira uma coluna com uma caixa de texto por item,
como a Anotação, e sai no PDF e na impressão do mesmo jeito. Há três prontas
para adicionar com um clique (**CFOP de entrada**, **Qtd recebida**,
**Observação**) e a anotação livre, com título obrigatório, de até 40
caracteres. Título igual ao de outra coluna (sem contar acento, maiúscula e
pontuação) é recusado. São no máximo 10 anotações extras. O × ao lado de uma
extra a remove da tabela. A Anotação original pode ser escondida e movida, mas
não removida.

Cada coluna de anotação (a original e as extras) tem um seletor de largura na
lista: **Automática** (padrão), **Estreita**, **Média** ou **Larga**.
Automática: a coluna fica da largura do título, com um mínimo (64 px na tela,
10 mm na folha). As outras fixam a caixa: 80, 140 ou 240 px na tela e 14, 24
ou 36 mm na folha, e o título quebra em linhas se for mais comprido. A caixa
ocupa a coluna inteira, com o título centralizado em cima. A prévia acompanha
a escolha.

Na tabela de itens, todas as células têm o mesmo espaçamento e ficam
alinhadas ao meio, inclusive as de anotação. A Descrição fica com o espaço
que sobra, mas nunca abaixo de cerca de 30 caracteres; se a tabela não couber
na tela, ela rola na horizontal.

### Orientação e folha (modo Conferência)

No painel, acima da prévia, **Orientação da folha**: **Automática** (padrão),
**Retrato** ou **Paisagem**. Ao lado, um indicador mostra como a tabela da
nota aberta vai para a folha com as colunas do painel: "Cabe em retrato",
"Cabe em paisagem" ou "Não cabe numa folha" (o texto de ajuda diz a fonte ou
em quantas partes ela sai).

Ao salvar o PDF ou imprimir, o app mede a largura de cada coluna da tabela na
folha e decide:

1. Automática: retrato se a tabela couber; senão, paisagem. Retrato ou
   Paisagem: sempre essa.
2. Se não couber na orientação em uso, a fonte da tabela desce de 7,5 pt até
   no mínimo 7 pt, de 0,25 em 0,25.
3. Se nem com 7 pt couber, a tabela é dividida em partes, cada uma numa folha
   ("Itens, parte 1 de 2"), repetindo Nº, Código e Descrição. Antes de salvar
   o PDF ou imprimir, o app avisa e pergunta se continua.

A largura útil é a do A4 menos 10 mm de margem de cada lado: 190 mm em
retrato e 277 mm em paisagem. Esse cálculo fica num ponto só,
`src/nfe/folha.ts`, que os blocos em grade de 12 colunas também vão usar. A
folha não usa a tabela da tela: antes de salvar o PDF ou imprimir, o app monta
cópias dela para o papel (`src/folhaTabela.ts`), e a medida é feita numa
cópia escondida com as mesmas regras de CSS do papel.

A tabela de itens e a prévia rolam na horizontal dentro do próprio quadro.
Quando há colunas escondidas de um lado, aparece naquela borda uma sombra e
uma seta na altura do cabeçalho; clicar na seta rola para aquele lado. A seta
some quando não há mais nada daquele lado, e nunca sai na impressão nem no PDF.

O texto digitado nunca se perde ao mexer nas colunas: coluna escondida ou
removida continua com o texto na memória e no `.psxml`, e ele volta a aparecer
quando a coluna volta. Uma extra recriada com o mesmo título tem o mesmo id
(`anotacao-` mais o título sem acento, por exemplo `anotacao-qtd-recebida`) e
recupera o texto.

### Perfis de configuração

Um perfil guarda as colunas (ordem, visibilidade e largura das anotações), as
anotações extras, a orientação da folha e o layout dos blocos (reservado para
os blocos como widgets). Um perfil fica ativo para o app inteiro: trocar de
perfil muda todas as janelas abertas na hora.

No topo do painel **Editar colunas** fica o bloco **Perfil ativo**, com o nome
do perfil em destaque e o botão **Trocar perfil**. O botão abre a lista dos
perfis, um por linha, com o ativo marcado (✓) e com fundo amarelo; clicar
numa linha passa a usar aquele perfil e mostra o aviso "Perfil <nome> ativo".
Se o painel tem mudanças ainda não aplicadas, uma caixa pergunta antes:
**Aplicar e trocar** (grava no perfil atual), **Descartar e trocar** ou
**Cancelar**. Esc ou um clique fora fecham só a lista.

Em cada linha:

- Lápis: renomeia na própria linha. Enter salva, Esc (ou sair do campo)
  cancela. Nome vazio ou igual ao de outro perfil (sem contar acento e
  maiúscula) não vale, e o motivo aparece embaixo. Até 40 caracteres.
- Lixeira: exclui, depois de confirmar. Excluir o ativo ativa o primeiro da
  lista. O último perfil nunca pode ser excluído (a lixeira fica
  desabilitada).

No fim da lista:

- **Novo perfil**: pede o nome (sugestão "<ativo> (cópia)"); o perfil novo
  começa igual ao ativo e passa a ser o ativo.
- **Importar** lê um arquivo, valida o arquivo inteiro e acrescenta o perfil à
  lista (o ativo não muda). Se já existe um perfil com esse nome, pergunta:
  **Substituir** (o perfil com esse nome fica com o conteúdo do arquivo) ou
  **Manter os dois** (o importado entra como "<nome> (2)", "(3)"...). Arquivo
  inválido, de outro tipo ou de versão mais nova mostra o motivo no painel e
  nada muda. O arquivo de configuração exportado antes dos perfis
  (`PS Reader - configuracao.json`) também é aceito e entra como o perfil
  "Configuração importada".
- **Exportar perfil ativo** grava o perfil ativo (como está salvo) num arquivo
  `PS Reader - perfil <nome>.json`, onde você escolher. Pasta de destino,
  última pasta aberta e tamanho da janela não vão junto (são da máquina).

**Aplicar** grava no perfil ativo e mostra o aviso "Alterações salvas no
perfil <nome>". **Restaurar padrão**, no rodapé do painel, pergunta antes e
volta o perfil ativo (colunas, anotações extras, orientação e layout) ao
padrão; o nome fica.

Na primeira abertura desta versão, a configuração anterior (chave
`conferencia` do `config.json`) vira o primeiro perfil, sem perder nada, com o
nome do usuário do Windows. A chave antiga fica como estava, para uma versão
anterior do app ainda conseguir ler. Os perfis ficam na chave `perfis`
(`src/nfe/perfis.ts`):

```json
{
  "versao": 1,
  "ativo": "p-k3x9q2",
  "lista": [
    {
      "id": "p-k3x9q2",
      "nome": "Recebimento",
      "colunas": [
        { "id": "nItem", "visivel": true },
        { "id": "anotacao", "visivel": true },
        { "id": "ean", "visivel": false },
        {
          "id": "anotacao-qtd-recebida",
          "visivel": true,
          "largura": "estreita"
        }
      ],
      "anotacoes": [
        { "id": "anotacao-qtd-recebida", "titulo": "Qtd recebida" }
      ],
      "orientacao": "paisagem",
      "layout": {
        "blocos": [{ "id": "emitente", "visivel": true, "largura": 6 }]
      }
    }
  ],
  "fornecedores": {}
}
```

O arquivo de um perfil exportado tem o mesmo conteúdo de um item da lista,
sem o id, com o tipo e a versão do arquivo:

```json
{
  "tipo": "perfil-ps-reader",
  "versao": 1,
  "nome": "Recebimento",
  "colunas": [{ "id": "nItem", "visivel": true }],
  "anotacoes": [{ "id": "anotacao-qtd-recebida", "titulo": "Qtd recebida" }],
  "orientacao": "paisagem",
  "layout": { "blocos": [{ "id": "emitente", "visivel": true, "largura": 6 }] }
}
```

(Os exemplos estão encurtados: o arquivo real lista todas as colunas e os oito
blocos.) `colunas` é a ordem da tabela; `largura` (`automatica`, `estreita`,
`media` ou `larga`) só existe nas colunas de anotação e, sem ela, vale
`automatica`. `orientacao` é `automatica`, `retrato` ou `paisagem`; sem ela
(configuração anterior), `automatica`. `layout` guarda os blocos da
conferência numa grade de 12 colunas; nesta versão ele ainda não é editável.
`fornecedores` fica reservado para a configuração por fornecedor e por
enquanto é sempre vazio. Coluna que falte no arquivo entra no fim com a
visibilidade padrão.

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
| Ctrl+S                      | Salvar (.psxml na Conferência, PDF no DANFE)       |
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
  pergunta de sempre) e **Abrir outro XML** (ver Várias janelas).
- Modo: o seletor **Conferência | DANFE**, que alterna sem reabrir o arquivo.
  Com um `.psxml` aberto, a opção DANFE fica desabilitada, com a explicação ao
  passar o mouse (e para o leitor de tela): "O DANFE só é gerado a partir do
  XML original."
- Saída:
  - **Pasta de destino**: escolhe a pasta onde os arquivos são gravados e
    mostra a pasta onde o Salvar vai gravar. O caminho fica em `config.json`
    (chave `pastaDestino`), dentro da pasta de dados do app
    (`%APPDATA%\PS Reader`), e vale também depois de reabrir o app. Colado
    nele, **Abrir pasta**, igual ao da tela inicial.
  - **Imprimir**: abre o diálogo de impressão do Windows com a tela atual (na
    Conferência, já na orientação calculada para a tabela). Se a
    impressora padrão for de cupom, avisa antes; Cancelar não abre o diálogo. A
    lista de nomes de impressora de cupom fica em `src/impressoras.ts`: ELGIN,
    térmica, 80mm, 58mm, POS só como palavra inteira (POS-80 e POS58 casam,
    Positivo não) e TM-T seguido de dígitos (EPSON TM-T20X-II).
  - **Salvar**, o único botão principal: na Conferência grava só a cópia
    editada (`.psxml`); no DANFE, só o PDF. Enquanto grava, mostra
    "Salvando...". O Salvar grava sempre na pasta mostrada no botão **Pasta
    de destino**. Com um `.psxml` aberto que está nessa mesma pasta, grava
    por cima dele sem perguntar (é o próprio arquivo aberto); se ele está em
    outra pasta, ou se o aberto é o XML original, grava o `.psxml` com o nome
    padrão na pasta do botão e o aberto fica como está. Se esse `.psxml` já
    existe, pergunta **Substituir**, **Salvar cópia...** ou **Cancelar** (ver
    Salvar cópia).
  - A seta colada no Salvar abre um menu com **Salvar PDF** (o PDF do modo
    em que a tela está; na Conferência, com a orientação e a fonte
    calculadas) e **Salvar cópia...**.

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
Um `.psxml` com nome no formato antigo abre normalmente. Se ele está na pasta
de destino, o Salvar grava por cima dele e ele mantém o nome; o PDF sai com o
nome novo.

### Arquivo que já existe e Salvar cópia

Quando o arquivo a gravar já existe na pasta de destino (o `.psxml` do Salvar,
o PDF da Conferência ou do DANFE, ou o **Salvar PDF** das prévias), uma caixa
no visual do app pergunta: **Substituir**, **Salvar cópia...** ou
**Cancelar**. Regravar o `.psxml` aberto na própria pasta dele não pergunta.

**Salvar cópia...** (no menu da seta do Salvar, ou nessa pergunta) abre uma
caixa com o nome sugerido, todo selecionado para editar, e a pasta onde vai
gravar: `<FORNECEDOR>_NF<número>_Conferencia_copia1` para o `.psxml` e o PDF
da Conferência, `<FORNECEDOR>_NF<número>_DANFE_copia1` para o DANFE (ou
`copia2`, `copia3`... se já existir). Caracteres que o Windows não aceita
(`< > : " / \ | ? *` e de controle), nome terminado em ponto e nomes
reservados (CON, PRN, AUX, NUL, COM1 a COM9, LPT1 a LPT9) são recusados na
hora, com o motivo. Se o nome escolhido já existe, pergunta **Substituir** ou
**Cancelar** (que volta à caixa do nome). A cópia vai para a pasta de destino
em uso; o arquivo aberto não muda (gravar a cópia do `.psxml` por cima dele é
recusado). Depois de salvar a cópia do `.psxml`, a janela passa a trabalhar
nela, como um "Salvar como": o título da janela mostra o nome dela e os
próximos Salvar (Ctrl+S) vão para ela.

O título da janela começa pelo nome do arquivo em que ela está trabalhando.

Sucesso aparece como um aviso pequeno no centro da janela, que some sozinho. Ao
salvar, o aviso mostra o nome do arquivo em cima (nome longo é encurtado no
meio com reticências),
a pasta onde gravou ("em C:\…\Notas") e "Salvo" embaixo, por cerca de 3,5 s. A
pergunta de arquivo que já existe também mostra a pasta, encurtada. "Copiado" e "Chave copiada" continuam em uma linha, por cerca de
1,5 s. Erro aparece em vermelho, fixo na janela, até ser fechado; o aviso da
pasta desta sessão aparece no mesmo lugar, em escuro.

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
aberta só é regravada pelo Salvar quando está na pasta de destino.

A gravação é segura: os arquivos vão primeiro para temporários na pasta onde
serão gravados e só então substituem os finais. Se algo falhar, os arquivos antigos
ficam como estavam e os temporários são apagados.

Se houver anotações alteradas e não salvas, abrir outro arquivo, ir para o
Início ou fechar a janela mostra uma caixa no visual do app com **Salvar**,
**Salvar cópia...**, **Descartar** e **Cancelar** (Esc). Salvar cópia abre a
caixa do nome; concluída, a ação pedida segue (fechar, abrir o outro arquivo
etc.). Cancelar, ali ou na caixa do nome, deixa tudo como estava.

## Cópia editada (.psxml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<psCopiaEditada xmlns="urn:psparafusos:ps-xml-reader" versao="2">
  <aviso>Cópia de uso interno. Não é NF-e e não tem validade fiscal.</aviso>
  <original>
    <!-- elemento raiz do XML original (nfeProc ou NFe), sem alteração -->
  </original>
  <anotacoes titulo="Anotação">
    <anotacao nItem="5">texto</anotacao>
    <coluna id="anotacao-qtd-recebida" titulo="Qtd recebida">
      <anotacao nItem="5">390</anotacao>
    </coluna>
  </anotacoes>
  <ordem criterio="vTotal" direcao="desc"/>
</psCopiaEditada>
```

A coluna Anotação fica nos `<anotacao nItem>` direto em `<anotacoes>`, como na
versão 1.0.1, e o atributo `titulo` guarda o título dela. Cada anotação extra
fica num `<coluna>` com o id e o título, para o arquivo ser legível sozinho.
Só entram itens com texto. Uma cópia salva pela 1.0.1 (sem `<coluna>`, com
`versao="1"`) abre com a anotação dela na coluna Anotação. Uma cópia nova
aberta na 1.0.1 mostra a coluna Anotação; as extras ela ignora, e se ela
salvar por cima, as extras se perdem. Coluna que está no arquivo mas não na
configuração é regravada como veio, com o título lido do arquivo.

`<ordem>` guarda a ordem dos itens na conferência: `criterio` é `nota`, `cst`,
`codigo-texto`, `codigo-numero` ou o id de uma coluna (`src/nfe/colunas.ts`,
ou de uma anotação extra), e `direcao` é `asc` ou `desc`. Cópia antiga, sem
esse elemento, ou com o critério de uma coluna escondida, abre na ordem da
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
`PS Reader-<versão> Setup.exe`. Não há assinatura de código configurada, então
o Windows pode mostrar o aviso do SmartScreen na primeira instalação.

O nome de exibição é **PS Reader** (`productName` no `package.json`): é o nome
da janela, dos atalhos, do executável (`PS Reader.exe`) e da pasta de dados
(`%APPDATA%\PS Reader`). A instalação fica em `%LocalAppData%\PSXmlReader\`
(nome do Squirrel, sem espaço) e não pede administrador.

Os ícones ficam em `assets\`: `ps-reader.ico` (executável, janela, instalador,
arquivos `.psxml` e Configurações > Aplicativos), `ps-logo.svg` e
`ps-logo-icone-simplificado.svg` (logo vetorizado) e `ps-logo-1024.png`.

Na instalação e em cada atualização, o app associa a extensão `.psxml` (só ela)
no registro do usuário atual, `HKCU\Software\Classes` (`src/associacao.ts`); a
desinstalação apaga essas chaves. O comando de abrir e o ícone apontam para o
executável fixo da raiz, `%LocalAppData%\PSXmlReader\PS Reader.exe`, que não
muda entre versões. Depois de gravar ou apagar as chaves, o app avisa o
Explorer (SHChangeNotify com SHCNE_ASSOCCHANGED) para atualizar o ícone e o
nome do tipo. Na instalação e na atualização, o app também apaga os atalhos
`Leitor NF-e PS.lnk` que sobraram do nome antigo, só no menu Iniciar (pasta
"PS Parafusos e Segurança LTDA" e raiz de Programas) e na área de trabalho do
usuário, e só se o atalho aponta para dentro de `%LocalAppData%\PSXmlReader\`.
Cada instalação, atualização ou desinstalação sobrescreve um log curto em
`%TEMP%\ps-reader-associacao.log` (evento, resultado de cada chamada ao
`reg.exe`, saída do aviso ao Explorer, atalhos antigos apagados ou mantidos e
tempo total). Se o Explorer mesmo
assim não mostrar o ícone novo, reinicie o Explorer ou saia e entre no Windows.

O ícone em Configurações > Aplicativos vem de `iconUrl` (`forge.config.mts`): o
instalador baixa `assets/ps-reader.ico` do GitHub na primeira instalação. Sem
internet nessa hora, a instalação segue normal, só sem esse ícone. O app em si
não faz chamada de rede.

### Gerar e entregar uma versão nova

1. Suba a versão em `package.json` (`"version"`, por exemplo de 1.1.1 para
   1.1.2) antes do `npm run make`. O Squirrel só atualiza por cima uma versão
   maior que a instalada.
2. Rode `npm run make`.
3. Leve só o `out\make\squirrel.windows\x64\PS Reader-<versão> Setup.exe`. Os
   outros arquivos da pasta (`.nupkg`, `RELEASES`) não são necessários para
   instalar.
4. No computador, rode o Setup.exe: ele instala ou atualiza por cima, sem
   administrador, e abre o app. A versão aparece no canto da tela inicial.

## Outros comandos

| Comando             | O que faz                          |
| ------------------- | ---------------------------------- |
| `npm run typecheck` | Verifica os tipos TypeScript       |
| `npm run lint`      | Roda oxlint e confere a formatação |

## Estrutura

```
src/
  main.ts            processo principal: janelas (estado de cada uma), diálogos, printToPDF
  preload.ts         contextBridge com a API psApi (abrir, pasta, salvar, imprimir, copiar)
  impressoras.ts     lista de nomes de impressora de cupom (aviso antes de imprimir)
  associacao.ts      associação do .psxml no registro do usuário (eventos do Squirrel)
  renderer.ts        monta a tela a partir do objeto Nota
  editorColunas.ts   painel Editar colunas (lista, arrastar, anotações extras, prévia)
  dom.ts             utilitários de DOM (el, icone, botao)
  declarations.d.ts  tipos globais (window.psApi)
  nfe/config.ts      personalização da conferência: tipo, padrão, validação e migração
  nfe/perfis.ts      perfis de configuração: lista, migração, arquivo exportado e importado
  nfe/folha.ts       folha A4: largura útil por orientação e plano da tabela (fonte, partes)
  folhaTabela.ts     cópias da tabela de itens para o papel e medida das colunas
  dialogos.ts        caixas de diálogo no visual do app (pergunta, nome da cópia)
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
assets/              ícone do app (ps-reader.ico) e logo da PS
forge.config.mts     configuração do Electron Forge (instalador Squirrel)
samples/             XMLs de teste locais (fora do git, nunca versionar)
```

## Regras do projeto

- Tudo que aparece na tela vem do XML. Campo ausente deixa a célula vazia ou
  esconde a seção. Nenhum texto padrão é inventado.
- Sem dependências além das que o template do Electron Forge instala.
- `samples/` contém dados reais de fornecedores e está no `.gitignore`.
