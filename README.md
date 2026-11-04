# PS Reader

Aplicativo Windows de uso interno da PS Parafusos e Segurança LTDA. Lê o XML de
uma NF-e (layout 4.00), mostra a nota em tela e salva em PDF, em dois modos:
**Conferência** (itens, totais e anotações) e **DANFE** (A4 retrato, conforme o
Manual de Orientação do Contribuinte). Funciona offline: a única chamada de
rede é a verificação online dos documentos de referência, que vem desligada e
só roda quando a pessoa liga e pede (veja Documentos de referência).

O PDF do modo Conferência é um documento de conferência interna e não substitui
o DANFE.

## Versão 1.2.0

- **Documentos de referência**: a planilha de ST de Sergipe (CONFAZ) e a TIPI
  (o `tipi.xlsx` oficial ou o texto do PDF), que a pessoa carrega. O app vem
  sem nenhum. Cada documento é conferido antes de trocar o anterior; arquivo
  errado é reconhecido e recusado com o que fazer. O relatório da leitura
  separa o ignorado de propósito dos problemas de leitura, e um semáforo
  (verde, amarelo, vermelho, sempre com texto) mostra a situação. Verificação
  online opcional, desligada por padrão.
- **Ferramenta "ST, MVA e CFOP"** no painel de conferência: diz se cada item
  tem ST em Sergipe, a MVA e o CFOP de entrada pela finalidade, lembra as
  decisões por fornecedor e produto e grava o CFOP (e, se quiser, a MVA)
  numa coluna de anotação. O painel resume os CFOPs de entrada da nota.
- **Tabela de itens** usa a largura da janela antes de mostrar as setas de
  rolagem lateral.
- **Painel de conferência** à esquerda da nota, na Conferência: o resultado
  no topo ("Tudo certo" ou "N pontos para olhar"), as verificações
  automáticas (idade da nota, totais dos itens, duplicatas, vencimentos,
  destinatário, nota já conferida), com títulos que dizem o resultado, e o
  que precisa de você (Qtd recebida
  diferente da nota). Recolhe numa barra fina. Não sai no PDF nem na
  impressão.
- **Colunas novas** no Editar colunas, escondidas no começo: **Pedido**
  (`xPed`), **IBS** e **CBS** (`vIBS` e `vCBS` de cada item).
- **Prévia em folha** no Editar colunas: uma miniatura da folha A4 em escala,
  com a mesma régua do PDF (orientação, letra reduzida e divisão em folhas).
- **Orientação** em botões lado a lado (Automática, Retrato, Paisagem) e
  **largura das anotações** num menu do próprio app, com a mesma navegação
  por teclado do seletor de perfil.
- Tela de escolha: o destaque da prévia é um só (amarelo claro, desfocado),
  com o mouse na miniatura ou nos botões **Abrir aqui** e **Nova janela**, e
  some sem deixar borda ao sair.

## Versão 1.1.2

- Tela de escolha: o desfoque da prévia com **Abrir aqui** e **Nova janela**
  só aparece com o mouse sobre a miniatura; sobre **Salvar PDF** a prévia
  fica normal.
- **Perfil: <nome>** na barra amarela, abaixo do número da nota: lista rápida
  para trocar de perfil, com **Gerenciar perfis...** no fim.
- Anotações da tabela de itens: **Enter** e **Tab** levam o foco de uma caixa
  para outra, e o texto da caixa que recebe o foco fica selecionado.

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

Ao passar o mouse sobre a miniatura da prévia (ou com o foco de teclado nela),
ela fica desfocada e semitransparente, com dois botões: **Abrir aqui** (abre nesta janela, naquele
modo) e **Nova janela** (abre numa janela nova, naquele modo; esta volta para a
tela inicial). Clicar na própria prévia é o mesmo que **Abrir aqui**. Na tela de
escolha de uma janela vazia, **Abrir aqui** fica em destaque; na escolha por
cima de uma nota aberta (ver Várias janelas), **Nova janela**. O mouse sobre
**Salvar PDF** ou sobre o nome do modo, embaixo da miniatura, não liga o
efeito.

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

Teclado nas caixas de anotação (a coluna Anotação e as extras), na ordem em
que a tabela está na tela, inclusive ordenada:

- **Enter**: a mesma coluna, na linha de baixo. **Shift+Enter**: na linha de
  cima. Na última linha (ou na primeira, com Shift) o foco fica no campo.
- **Tab**: a próxima coluna de anotação da mesma linha; na última, a primeira
  coluna de anotação da linha de baixo. **Shift+Tab** faz o inverso. Depois
  da última caixa da tabela (ou antes da primeira, com Shift), o Tab segue o
  caminho normal e sai da tabela.
- Ao entrar numa caixa, por teclado ou clique, o texto dela fica selecionado:
  digitar substitui, e uma seta ou um segundo clique põe o cursor.

### Editar colunas (modo Conferência)

Na barra acima da tabela de itens, à direita, **Editar colunas** abre um painel
com todas as colunas, inclusive EAN e as anotações extras. Marque ou desmarque
cada uma e arraste pela alça (ou use as setas do teclado na alça) para mudar a
ordem. Ao lado, a prévia mostra a tabela com oito itens fictícios, o
cabeçalho em destaque e as linhas sumindo para baixo; ela muda a cada clique.
À direita dela fica a miniatura da folha A4 (ver Orientação e folha); com o
painel estreito, a folha vai para baixo da prévia. No topo do painel, o
**Perfil ativo** em fundo preto, com **Trocar perfil**.
**Aplicar** salva e remonta a tabela; **Cancelar** (ou Esc) volta ao que era.
A configuração vale para todas as notas, na tela, na impressão e no PDF. O
DANFE não muda.

Anotações extras: cada uma vira uma coluna com uma caixa de texto por item,
como a Anotação, e sai no PDF e na impressão do mesmo jeito. Há três prontas
para adicionar com um clique (**CFOP de entrada**, **Qtd recebida**,
**Observação**) e a anotação livre, com título obrigatório, de até 40
caracteres. Título igual ao de outra coluna (sem contar acento, maiúscula e
pontuação) é recusado. Um perfil salvo antes de uma coluna nova do app (por
exemplo, com uma anotação chamada Pedido) continua valendo como estava. São no máximo 10 anotações extras. O × ao lado de uma
extra a remove da tabela. A Anotação original pode ser escondida e movida, mas
não removida.

Cada coluna de anotação (a original e as extras) tem um botão de largura na
lista, que abre um menu (setas, Home e End movem; Enter escolhe; Esc fecha):
**Automática** (padrão), **Estreita**, **Média** ou **Larga**.
Automática: a coluna fica da largura do título, com um mínimo (64 px na tela,
10 mm na folha). As outras fixam a caixa: 80, 140 ou 240 px na tela e 14, 24
ou 36 mm na folha, e o título quebra em linhas se for mais comprido. A caixa
ocupa a coluna inteira, com o título centralizado em cima. A prévia acompanha
a escolha.

Na tabela de itens, todas as células têm o mesmo espaçamento e ficam
alinhadas ao meio, inclusive as de anotação. A Descrição fica com o espaço
que sobra, mas nunca abaixo de cerca de 30 caracteres; se a tabela não couber
na largura do conteúdo, o quadro de itens cresce para os lados, até a margem
da janela e sem passar por cima do painel de conferência; só o que ainda não
couber rola na horizontal, com as setas nas laterais. No PDF e na impressão a
tabela segue a folha.

### Orientação e folha (modo Conferência)

No painel, acima da prévia, **Orientação da folha**, em botões lado a lado:
**Automática** (padrão), **Retrato** ou **Paisagem**. Ao lado, um indicador
mostra como a tabela vai para a folha com as colunas do painel: "Cabe em
retrato", "Cabe em paisagem" ou "Não cabe numa folha" (o texto de ajuda diz a
fonte ou em quantas partes ela sai).

Ao lado da prévia, a miniatura da folha A4 em escala, com 16 linhas
fictícias: em pé em retrato, deitada em paisagem, e em Automática a que o app
escolheria. As larguras das colunas vêm da mesma régua do PDF, medidas com os
itens da nota aberta (sem nota, com os itens de exemplo; a legenda diz qual).
Se a letra for reduzida, aparece "Letra reduzida para N pt". Se a tabela não
couber, uma linha vermelha tracejada marca a borda da folha, as colunas que
vão para a folha 2 ficam sombreadas depois dela e aparece "daqui em diante
vai para a folha 2".

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

Sem abrir o painel, a barra amarela da nota mostra, abaixo de "NF-e nº ...
série ...", a etiqueta **Perfil: <nome>** com uma seta. Clicar nela (ou Enter
ou espaço, com o foco nela) abre a lista dos perfis, com o ativo marcado (✓);
as setas navegam, Enter escolhe e Esc fecha. Clicar noutro perfil troca na hora,
em todas as janelas, e mostra o aviso "Perfil <nome> ativo". No fim da lista,
**Gerenciar perfis...** abre o painel **Editar colunas** com a lista de perfis
já aberta (novo, renomear, excluir, importar e exportar).

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

### Avisos da nota (modo Conferência)

À esquerda da nota, o painel de conferência mostra o que a nota tem a
apontar. No topo, o resultado: "✓ Tudo certo · 6 verificações" em verde, ou
"N pontos para olhar" em vermelho. Embaixo:

- **Verificações automáticas**: uma linha por verificação (idade da nota,
  total dos itens, duplicatas, vencimentos, destinatário, nota já
  conferida), com ✓ (certo), i (só informa), ! amarelo (aviso leve) ou !
  vermelho (alerta forte); clicar mostra o detalhe. O título diz o
  resultado, não a pergunta: "Totais conferem" ou "Total dos itens difere em
  R$ 2,10"; "Parcelas em dia" ou "Parcela 001 vencida há 20 dias";
  "Destinatário: P S Parafusos"; "Primeira conferência desta nota" ou "Já
  conferida em 28/10". Aviso leve e alerta
  forte contam como pontos para olhar. A "já conferida" tem **Abrir em nova
  janela**.
- **Precisa de você**: cada item com a Qtd recebida diferente da nota; clicar
  rola a tabela até a linha, destaca a linha por um instante e põe o foco na
  caixa Qtd recebida dela.
- **Ferramentas**: ações sobre a nota aberta, que mostram a prévia antes de
  mudar alguma coisa. A primeira é **ST, MVA e CFOP** (veja abaixo).
  Embaixo, **CFOPs de entrada**: a contagem por valor da coluna de anotação
  "CFOP de entrada" ("2102: 194 itens · 2403: 2 itens"), do que a ferramenta
  gravou e do que foi digitado, atualizada enquanto se digita. Clicar num
  valor lista os itens (número e descrição); clicar num item rola a tabela
  até a linha, destaca a linha e põe o foco na caixa CFOP de entrada dela.
  Valores com poucos itens (até 10% dos preenchidos, no mínimo 1, havendo
  outro valor) ficam em destaque.
- **Rodapé**: o semáforo dos documentos de referência ("● ST ok · ● TIPI
  falta"); clicar abre a área deles.

Ações que passam de meio segundo (como procurar a nota na pasta de destino
pela rede) mostram um círculo girando no painel. O botão no topo recolhe o
painel numa barra fina, com o ✓ ou o número de pontos. Janela larga (o
painel cabe na sobra à esquerda da nota, como 1920 a 100%): ele fica aberto
ao lado, sem empurrar a nota, e a janela lembra se você recolheu. Janela
estreita (1366, ou 1920 a 125%): começa recolhido e abre por cima da nota;
Esc, um clique fora ou o Tab para fora fecham. Tudo funciona pelo teclado.
O painel é só da tela: não sai no PDF nem na impressão, e não aparece no
modo DANFE.

- **Quantidade divergente**: com a coluna de anotação **Qtd recebida** na
  configuração, o número digitado é comparado com a Qtd da nota, na unidade
  da nota (aceita vírgula, como 2,5 ou 1.000,5). Diferente: a linha fica em
  vermelho na hora, na tela, no PDF e na impressão, e conta um ponto. Texto
  que não é número não gera aviso.
- **Totais**: soma do valor dos itens contra o total dos produtos, e soma das
  duplicatas contra o valor total da nota (só se houver duplicatas), com
  tolerância de R$ 0,01. O aviso mostra os dois valores e a diferença.
- **Idade da nota**: sempre uma linha "Emitida há X dias (dd/mm/aaaa)",
  contada a partir de hoje ("Emitida hoje", "Emitida ontem"). Até 30 dias só
  informa; acima disso vira aviso leve: "Emitida há X dias: confira
  vencimentos e pedido". Os 30 dias vêm da chave `diasNotaAntiga` do
  `config.json`.
- **Vencimentos**: cada duplicata comparada com a data de hoje (não com a
  emissão), com a distância até hoje ("venceu há 20 dias", "vence hoje",
  "vence em 10 dias"). Parcela vencida: alerta forte, com número, data, valor
  e há quantos dias venceu, e "Falar com o fornecedor para prorrogar"; o
  detalhe já abre à mostra. Parcela que vence em até 15 dias: aviso leve. Os
  15 dias vêm da chave `diasAvisoVencimento` do `config.json`.
- **Nota de outra empresa**: o CNPJ do destinatário não é o da empresa. Avisa
  no painel e num pop-up ao abrir. O CNPJ padrão é 09.076.777/0001-04
  (`CNPJ_EMPRESA_PADRAO` em `src/nfe/avisos.ts`); a chave `cnpjEmpresa` do
  `config.json` troca esse valor.
- **Nota já conferida**: há um `.psxml` com a mesma chave de acesso na pasta
  de destino em uso. Avisa no painel e num pop-up ao abrir, com o nome do
  arquivo, a data de modificação e **Abrir em nova janela**. O app lê só os
  nomes da pasta e abre apenas os `.psxml` com `_NF<número>` no nome (como o
  Salvar grava); a chave confirma. O próprio arquivo aberto não conta, e uma
  cópia salva com nome livre, sem `_NF<número>`, não é encontrada.

### Documentos de referência

A área **Documentos de referência** abre pelo rodapé do painel de conferência
e pelo botão da tela inicial. O app vem sem documentos; na primeira vez a área
explica o que carregar e para quê. Um cartão por documento:

- **Planilha de ST de Sergipe**: o `.xlsx` da página de Sergipe do Portal
  Nacional da Substituição Tributária (CONFAZ). Necessária para a ferramenta
  ST, MVA e CFOP.
- **TIPI**: o `tipi.xlsx` da página da TIPI no site da Receita Federal, ou o
  texto `.txt` extraído do PDF. Sem ela, a ferramenta roda sem conferir NCM
  e IPI.
- **Planilha de derivados de petróleo**: opcional, ainda não usada pelo app;
  por enquanto não há importação.

Cada cartão mostra o semáforo e o rótulo da situação, o nome do arquivo em
uso com um **X** para remover o documento (com confirmação; sem a planilha de
ST, a ferramenta volta a pedir o arquivo), a versão e a vigência, a data da
importação, as quantidades lidas e os botões **Atualizar** e **Ver relatório
da leitura**.

O relatório separa duas coisas:

- **Ignorado de propósito**: o que o documento traz e não entra na busca, de
  propósito: abas sem coluna NCM ou sem MVA (Água mineral, Bebidas frias),
  linhas sem NCM ou sem CEST, exceções "Ex", notas e cabeçalhos da TIPI.
- **Problemas de leitura**: célula que não deu para converter (MVA ilegível,
  CEST fora do formato, NCM sem alíquota), listados por aba ou segmento, com
  célula, motivo e conteúdo.

Com só ignorados, o rótulo é verde "Carregado"; com problema de verdade,
amarelo "Carregado com N problemas". O semáforo do cartão, do rodapé do
painel e da tela inicial é verde (ok), amarelo (problemas de leitura,
segmentos incompletos ou versão nova disponível) ou vermelho (faltando, ou
arquivo incompatível sem nenhum documento carregado), sempre com o texto ao
lado.

Ao importar, o arquivo é lido e conferido antes de trocar o anterior:

- **Arquivo errado**: o app diz o que ele parece ("Este arquivo parece a
  planilha de combustíveis (Ato COTEPE), não a de ST de Sergipe"; "parece a
  TIPI: carregue no cartão da TIPI") e o que fazer, em destaque. Nenhum dado
  é usado e o documento anterior continua carregado.
- **Planilha de ST com segmento não lido** (aba de segmento sem o cabeçalho
  ITEM e CEST): o app lista os segmentos afetados e só ativa a planilha com
  a confirmação "Os segmentos com problema não afetam meu trabalho. Usar o
  resto." marcada. Sem confirmar, o documento anterior continua valendo.

A base já lida fica na pasta de dados do app
(`%APPDATA%\PS Reader\documentos`), nunca no repositório: `st.json` e
`tipi.json`, com os metadados de cada um em `st-info.json` e
`tipi-info.json` (versão, vigência, data da importação e, para arquivo
baixado pelo app, a data e o tamanho do servidor). O resumo da leitura
(ignorados, problemas e os segmentos incompletos da planilha de ST) fica em
`st-leitura.json` e `tipi-leitura.json`, na mesma pasta.

**Verificação online** (embaixo, na mesma área): o interruptor vem desligado e,
com ele desligado, o app nunca acessa a internet. Ligado, aparecem **Verificar
agora** e a opção **Verificar ao abrir o app** (também desligada). Nada roda em
segundo plano fora disso. A rede fica só no processo principal, com tempo
limite e uma requisição por documento:

- Planilha de ST: lê a página do CONFAZ de Sergipe, acha a maior "Versão 00XX"
  e compara pelo número (a 0018 e a 0019 têm a mesma vigência). Com versão
  nova, oferece **Baixar e importar**, que passa pela mesma conferência da
  importação.
- TIPI: pede só o primeiro byte do `tipi.xlsx` (o site da Receita recusa o
  pedido só de cabeçalhos) e compara o tamanho, e a data quando o servidor
  informa, com o guardado na importação. Sem como comparar (TIPI carregada do
  texto do PDF, por exemplo): "Não consegui verificar a TIPI", com **Abrir no
  navegador**.

O resultado de cada documento é "atualizado", "versão nova disponível", "sem
conexão" ou "não consegui verificar". Falha de rede nunca interrompe o app.

### Ferramenta ST, MVA e CFOP

Primeira ferramenta do painel de conferência. Precisa da planilha de ST
carregada; sem ela, mostra "Carregue a planilha de ST de Sergipe" com atalho
para os documentos. **Rodar** analisa os itens (o círculo de processando só
aparece se passar de meio segundo) e abre a prévia numa janela própria, porque
a tabela não cabe no painel.

A prévia tem uma linha por item: descrição, NCM, **ST em Sergipe** (sim, não
ou confirmar), segmento e CEST, MVA, CFOP sugerido, finalidade e motivo. O
filtro **Só os que precisam de mim** deixa só o que pede decisão. O que vem da
TIPI (NCM que não existe, IPI diferente: "conferir exceções") aparece como
observação, não como erro.

- **Confirmar**: quando mais de uma linha da planilha serve, a pessoa escolhe
  entre os candidatos ou marca **Sem ST**, com os motivos à vista.
- **Finalidade** por item (padrão revenda), de um item ou de vários marcados
  de uma vez. CFOP pela tabela da loja (1 = fornecedor de Sergipe, 2 = de
  fora):

  | Finalidade        | Sem ST    | Com ST    |
  | ----------------- | --------- | --------- |
  | Revenda           | 1102/2102 | 1403/2403 |
  | Uso e consumo     | 1556/2556 | 1407/2407 |
  | Bonificação       | 1910/2910 | 1910/2910 |
  | Ativo imobilizado | 1551/2551 | 1551/2551 |
  | Outras entradas   | 1949/2949 | 1949/2949 |

  A MVA só é calculada na revenda; nas outras finalidades com ST aparece
  "confirmar com a contabilidade".

- **Decisões lembradas**: cada escolha (linha da planilha, sem ST,
  finalidade) fica guardada por raiz do CNPJ do fornecedor (8 dígitos) e
  código do produto, em `decisoes.json` na mesma pasta dos documentos. Na
  próxima nota o item já vem resolvido, marcado **lembrado**, com
  **desfazer**. Vale para o mesmo NCM e enquanto a linha escolhida existir na
  planilha. A área de documentos lista as decisões, com **Apagar**.
- **Aplicar**: grava o CFOP numa coluna de anotação, por padrão **CFOP de
  entrada**; se ela não existir no perfil, o app oferece criar na hora. Sem
  coluna de destino, não aplica. Opcional: gravar a MVA em outra coluna.
  Célula já preenchida com outro valor: o app pergunta antes (padrão: não
  substituir). Item sem CFOP definido fica como está. Grava só nas anotações
  (o `.psxml` ao salvar); o XML original nunca muda.

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

1. Suba a versão em `package.json` (`"version"`, por exemplo de 1.1.2 para
   1.2.0) antes do `npm run make`. O Squirrel só atualiza por cima uma versão
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
| `npm test`          | Roda os testes automáticos         |

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
  nfe/folha.ts       folha A4: largura útil por orientação, plano da tabela e régua da miniatura
  folhaTabela.ts     cópias da tabela de itens para o papel e medida das colunas
  miniaturaFolha.ts  miniatura da folha A4 no painel Editar colunas
  nfe/avisos.ts      avisos da nota: quantidade, totais, outra empresa, já conferida (lógica pura)
  nfe/conferencia.ts resumo do painel de conferência (verificações e pendências, lógica pura)
  nfe/resumoCfop.ts  contagem dos CFOPs de entrada por valor, para o painel
  nfe/ferramentas.ts ferramentas do painel (Rodar, prévia, Aplicar; e as de janela própria)
  painelConferencia.ts painel de conferência à esquerda da nota
  ferramentaST.ts    janela da ferramenta ST, MVA e CFOP (prévia, decisões, Aplicar)
  areaDocumentos.ts  área Documentos de referência (cartões, relatório, verificação online)
  documentos.ts      documentos no processo principal: importação, rede, análise, decisões
  fiscal/xlsx.ts     leitor mínimo de .xlsx (com fiscal/zip.ts)
  fiscal/st.ts       planilha de ST de Sergipe (Portal ST do CONFAZ)
  fiscal/tipi.ts     TIPI: texto do PDF e tipi.xlsx
  fiscal/analise.ts  análise fiscal por item (ST, MVA, CFOP de revenda, TIPI)
  fiscal/base.ts     base normalizada: importar, validar, gravar e carregar cada documento
  fiscal/documentos.ts situação, resumo e pontos não entendidos de cada documento
  fiscal/online.ts   verificação online (página do CONFAZ, cabeçalhos da TIPI)
  fiscal/entrada.ts  finalidade, CFOP de entrada, decisões lembradas e Aplicar
  leituraDocumentos.ts ignorado e problemas de leitura, reconhecer arquivo errado, semáforo
  indicador.ts       indicador de processando (só depois de 500 ms)
  dialogos.ts        caixas de diálogo no visual do app (pergunta, nome da cópia)
  nfe/parser.ts      texto XML ou .psxml -> Nota e anotações (usa DOMParser)
  nfe/copia.ts       monta o .psxml (original + anotações) com DOM e XMLSerializer
  nfe/colunas.ts     colunas da tabela de itens (ordem, rótulo, alinhamento, visível, ordenação)
  nfe/ordem.ts       ordenação dos itens na conferência (critérios, comparação estável)
  nfe/navegacao.ts   Enter e Tab entre as caixas de anotação (destino do foco)
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
