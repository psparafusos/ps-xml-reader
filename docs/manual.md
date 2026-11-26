# Manual do PS Reader

Como o PS Reader funciona, tela por tela, e os formatos dos arquivos que ele
grava. Para uma visão rápida, veja o [README](../README.md); o histórico das
versões está no [CHANGELOG](../CHANGELOG.md).

## O que faz

Lê o XML de uma NF-e (layout 4.00), mostra a nota em tela e salva em PDF, em
dois modos: **Conferência** (itens, totais e anotações) e **DANFE** (A4
retrato, conforme o Manual de Orientação do Contribuinte). Funciona offline: a
única chamada de rede é a verificação online dos documentos de referência (e
o **Atualizar** que baixa a versão nova), que vem desligada e só roda quando
a pessoa liga e pede (veja Documentos de referência).

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
`.psxml`) ou arraste o arquivo para a janela: com um arquivo sobre a janela,
a zona "Anexe aqui o XML da nota" fica em destaque. O diálogo de abrir começa
na pasta do último arquivo aberto (guardada em `config.json`); se ela não
existir mais, abre no padrão do Windows.

Arquivo acima de 50 MB, ou com `<!DOCTYPE` ou `<!ENTITY`, é recusado antes
de ser lido, com o motivo na tela. Planilhas (`.xlsx`) são medidas antes de
abrir: até 30 MB, com limite por parte e no total do arquivo compactado.

### Tela de boas-vindas

Na primeira abertura normal, quando o `config.json` não tem o CNPJ da loja
(instalação nova, ou atualização de uma versão que tinha o CNPJ no código),
a janela mostra a tela de boas-vindas antes da tela inicial
(`src/boasVindas.ts`). O app que o instalador abre (`--squirrel-firstrun`) e
os eventos do Squirrel não mostram: ela fica para a primeira abertura normal.

- **CNPJ da loja** (obrigatório): 14 dígitos, com ou sem máscara, conferido
  com os dígitos verificadores. Serve para conferir se as notas abertas são
  da loja (aviso de nota de outra empresa). Com notas recentes, a tela
  sugere o CNPJ de destinatário que mais aparece nelas; a sugestão só
  preenche o campo com **Usar este CNPJ** e nada é gravado antes do
  **Começar**.
- **Nome do perfil** (opcional): o do perfil em uso; na instalação nova, o
  nome do usuário do Windows.
- **Pasta de destino** (opcional): a gravada, ou a sugerida
  `Documentos\PS Reader` (criada no Começar), com **Trocar...**.
- **Documentos de referência**: só um link para as Configurações, sem
  obrigação.

Sem CNPJ válido a tela não sai (nem com Esc); fechar o app continua valendo.
Um arquivo aberto por duplo clique ou arrastado para a janela com a tela
aberta fica guardado e abre depois do Começar. Quem atualiza não perde
perfis, pastas nem decisões: o Começar grava só o CNPJ (e o nome do perfil
ou a pasta, se mudaram).

### Tela inicial

- **Barra de título própria** (36 px, preta): a logo, **PS Reader** e
  "Conferência de notas fiscais". É arrastável, o duplo clique maximiza e os
  botões de minimizar, maximizar e fechar são os do Windows.
- **Barra preta**, na mesma altura da barra da nota, só com o **botão de
  perfil** à direita (ver Botão de perfil).
- **Zona de soltar**, com **Abrir arquivo** e, embaixo, a **pasta de
  destino**: "Salvando em", o caminho completo e **Trocar**.
- **Documentos de referência**: uma linha por documento (um por coluna, ou
  um embaixo do outro na janela estreita), com o ícone do estado, o nome, a
  versão e a vigência ("Versão 0019, vigência a partir de ..."; na TIPI,
  "TIPI 2022, atualizada até ...") e, quando há algo a
  fazer, a situação ("Faltando", "v0020 disponível"). À direita, a ação:
  **Carregar** (documento faltando ou opcional) ou **Atualizar** (versão
  nova achada pela verificação online). Clicar na linha abre o cartão do
  documento nas Configurações; **Gerenciar** abre a aba inteira.

**Pasta de destino**: na tela inicial, embaixo do **Abrir arquivo**
("Salvando em", o caminho completo e **Trocar**; sem pasta, "Escolha onde
salvar" e **Escolher**); na tela da nota, no menu da seta do **Salvar**
(seção "Salvando em", com o caminho completo, **Trocar pasta de destino...**
e **Abrir pasta no Explorer**, com erro se a pasta não existir mais). O
caminho fica em `config.json` (chave `pastaDestino`), dentro da
pasta de dados do app (`%APPDATA%\PS Reader`), e vale também depois de
reabrir o app. A mesma pasta aparece na aba Geral das Configurações.

- **Notas recentes**: as últimas 8 notas abertas ou salvas, a mais recente
  em cima, com fornecedor, número, quantidade de itens, último acesso ("hoje
  10:42", "ontem 16:05", "28/10 09:00") e a situação: **em conferência** (XML
  sem `.psxml` salvo), **conferida** (abriu ou salvou o `.psxml`) ou um
  alerta com o principal ponto do painel ("parcela vencida"). Clicar abre o
  arquivo (nesta janela, se ela estiver vazia). Cada nota tem uma entrada só:
  depois de salvar, a entrada passa a abrir o `.psxml`. Arquivo que não existe
  mais aparece esmaecido, com "arquivo movido" e **Limpar** ao lado, que tira
  essa entrada; **Limpar lista** esvazia a lista. Ficam no `config.json`,
  chave `notasRecentes`.
- No rodapé do cartão, a versão do app e os atalhos Ctrl+O e Ctrl+S.

Em 1366 a 125% (ou janela estreita), a grade passa de três para duas colunas,
com as notas recentes embaixo.

Um XML da NF-e abre direto na aba **XML**, no **DANFE** (ou na aba **PSXML**,
a Conferência, se o perfil estiver com **NF-e abre em: PSXML**); um `.psxml`
abre direto na aba **PSXML**. Se a nota não tem DANFE no PS Reader (tipo de
emissão que não existe na NF-e modelo 55, ou outro modelo), ela abre na
Conferência com o motivo numa mensagem. NF-e emitida em contingência tem
DANFE (veja Modo DANFE). CT-e, NFS-e e eventos da NF-e abrem na aba **XML**,
no modo **Documento** (veja Documentos fiscais); outro XML abre na aba
**XML**, no **Formato original**.

### Abas PSXML e XML

As abas ficam presas no canto de baixo, à esquerda, da barra preta, cada uma
com a miniatura do ícone dela:

- **PSXML**: o trabalho da loja, a **Conferência** (tabela de itens,
  anotações e o painel da conferência). Num XML que não é NF-e ela fica
  apagada; clicar nela mostra "PSXML indisponível" (só OK).
- **XML**: o arquivo original, só leitura, com o painel **Leitura** à
  esquerda (mesmo visual e mesmo jeito de recolher do painel da Conferência;
  recolhido, fica a seta para abrir e o ícone do modo de leitura atual):
  - **Modo de leitura**: **Documento** (o DANFE da NF-e, ou o documento
    auxiliar de outro documento fiscal, veja Documentos fiscais),
    **Formato original** e **.XML** (o leitor de XML de antes: Árvore e
    Texto, busca, Abrir no Bloco de Notas).
    O **Formato original** é montado pelo app a partir do próprio XML, sem
    executar nada do arquivo e sem folha de estilo (`xml-stylesheet` é só
    texto): grupos viram seções com título, que recolhem; elementos
    repetidos viram tabelas (o que não cabe nas colunas fica no detalhe de
    cada linha, que abre pela setinha); valores simples viram pares rótulo e
    valor; atributos aparecem junto do elemento. Na NF-e, todos os blocos
    (identificação, emitente, destinatário, itens com impostos, totais,
    transporte, cobrança, pagamento, informações adicionais, protocolo),
    inclusive campos que o DANFE não mostra, com o rótulo em português e a
    tag ao lado (`vProd` vira "Valor dos produtos"). Os valores saem
    formatados para leitura: datas em dd/mm/aaaa (com a hora quando houver),
    CNPJ, CPF, CEP e telefone, números no formato brasileiro sem zeros
    sobrando (valores com 2 casas, alíquotas com %), e o significado ao lado
    dos códigos comuns da NF-e (CRT 3: Regime normal; modFrete 0: Por conta
    do emitente; CST de ICMS, IPI, PIS e COFINS). O valor exato fica no .XML.
    No alto, **Buscar** (com Anterior e Próximo; abre o que estiver
    recolhido em volta do achado), **Expandir tudo** e **Recolher tudo**.
    Usa a mesma leitura do .XML, no serviço de leitura pesada; acima do
    limite do modo leve (20 MB, sem árvore) ou com mais de 200 mil
    elementos, mostra o aviso e o botão **Ver no .XML**.
    O Documento fica apagado, com o motivo embaixo, num XML que não é
    documento fiscal conhecido, no `.psxml` ("O DANFE só é gerado a partir
    do XML original da nota.") e numa NF-e sem DANFE no PS Reader; clicar
    nele mostra o motivo num diálogo (só OK).
  - **Para quem é a nota**: numa NF-e de outra empresa, um cartão de aviso
    (triângulo amarelo) "Nota de outra empresa"; numa nota que a própria
    loja emitiu (o CNPJ do emitente é o da loja), um cartão de informação
    "Nota emitida pela loja". Clicar no cartão mostra o detalhe: quem é o
    destinatário e o CNPJ da loja. Com o painel recolhido, o ícone do cartão
    continua à vista e abre o painel. Não abre janela por cima da nota e não
    sai no PDF nem na impressão.
  - **Folhas** (só no DANFE): **Uma de cada vez**, **Lado a lado** (quantas
    couberem na largura) e **Ajustar à largura** (uma folha ocupando a
    largura da área, acompanhando a janela). Mudar o zoom à mão volta para
    Uma de cada vez. Só a tela: o papel e o PDF saem uma folha A4 retrato por
    página. O arranjo fica para a próxima nota desta janela.
  - **Arquivo**: nome, tipo e versão, tamanho, data de emissão e número de
    folhas do DANFE.
- Num `.psxml`, a aba XML mostra o XML original guardado dentro da cópia
  (não a cópia inteira).
- **Imprimir** e **Salvar** valem no DANFE e na Conferência; no Formato
  original e no .XML ficam apagados.
- Arrastar um arquivo para a janela funciona em qualquer aba e modo, com as
  regras de sempre (ver Várias janelas).

### Onde a nota abre

Cada perfil escolhe onde um XML de NF-e abre em **NF-e abre em**
(Configurações, aba Ferramentas): **XML (DANFE)** (o padrão), o arquivo
original no DANFE, ou **PSXML**, direto na Conferência para anotar. Vale para
o botão Abrir, o arrastar, a nota recente e o duplo clique no Explorer. O
`.psxml` abre sempre na **Conferência**. As anotações, o **Editar colunas**,
o **Salvar cópia...** e as ferramentas do painel ficam sempre livres.

Perfis gravados por versões anteriores mantêm a escolha: a antiga **Leitura
protegida** passa a ser **XML (DANFE)** e a antiga **Conferência** passa a ser
**PSXML** (a conversão é feita ao ler a chave `ferramentasPerfis` do
`config.json`; a próxima gravação já sai com o valor novo).

O XML nunca executa nada no app. A proteção é a própria leitura: DOCTYPE e
ENTITY recusados, limites de tamanho, conteúdo sempre tratado como texto e a
janela em sandbox (ver Como rodar). O XML original nunca é alterado; o que se
anota fica na cópia (`.psxml`).

### Várias janelas

Cada janela tem a sua nota. O app continua sendo um processo só (instância
única), mas um arquivo que chega abre numa janela própria:

- Arquivo que já está aberto em alguma janela: essa janela vem para a frente,
  em vez de abrir outra.
- Janela na tela inicial (sem nota): é reaproveitada.
- Duplo clique num `.psxml` (com o app fechado ou aberto): abre direto na
  **Conferência**, numa janela vazia ou numa janela nova.
- XML ou `.psxml` pelo **Abrir outro XML** (ou arrastado) com uma nota
  aberta: janela nova (o XML no **DANFE**, o `.psxml` na **Conferência**), e a
  nota desta janela fica como estava. Arquivo recusado (grande demais, com
  DOCTYPE, pasta de rede que não responde) mostra a mensagem nesta janela e
  nenhuma janela nova abre.

Janelas novas abrem deslocadas 32 px da anterior; se passarem da área de
trabalho do monitor, voltam para o canto dele. O tamanho e a posição lembrados
valem para a primeira janela, e quem os grava ao fechar é a janela mais antiga
aberta. Todas usam o mesmo AUMID, então a barra de tarefas junta as janelas
no ícone fixado.

É de cada janela: o arquivo aberto, as anotações não salvas, a pasta de
destino do duplo clique e o título. É do app inteiro (processo principal):
a personalização da conferência e a pasta de destino salva. Quando uma delas
muda numa janela, as outras atualizam na hora (a tabela de itens é remontada
com as colunas novas; o "Salvando em" mostra a pasta nova, menos nas
janelas que têm a pasta do duplo clique).

Fechar uma janela com anotação não salva pergunta só por ela. Fechar o app
(por exemplo **Fechar todas as janelas** na barra de tarefas) pergunta por
cada janela com anotação não salva, uma de cada vez, trazendo-a para a frente;
**Cancelar** em qualquer uma interrompe o fechamento e nenhuma janela fecha.
Pedidos de fechar que chegam juntos (em até 250 ms) contam como um só.

O `.xml` continua abrindo com o programa de antes no duplo clique; um `.xml`
passado na linha de comando (`"PS Reader.exe" nota.xml`) também abre.

Um `.psxml` aberto por duplo clique faz da pasta dele a pasta de destino só
naquela janela: o "Salvando em" do menu do Salvar mostra essa pasta com a
nota "Só nesta janela", e um aviso explica que a pasta salva volta quando a
janela fechar. Essa pasta fica só na memória e nunca é gravada no
`config.json`. Escolher uma pasta em **Trocar pasta de destino...** vence: ela vira a
pasta salva e a da janela deixa de valer. Abrir um `.psxml` pelo **Abrir arquivo**, pelo **Abrir outro XML** ou
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

A Descrição mostra até 3 linhas, com reticências; numa descrição cortada,
clicar na célula mostra o texto inteiro (a linha cresce) e clicar de novo
recolhe (pelo teclado: Tab até ela, Enter ou espaço). Palavra comprida sem
espaço (código de barras colado no texto, "EAN:789...;REF:...") quebra dentro
da coluna, em vez de alargar a tabela. No PDF e na impressão a descrição sai
inteira, quebrando dentro da coluna.

### Orientação e folha (modo Conferência)

No painel da Conferência, a última seção é **Folha do PDF**: **Retrato** ou
**Paisagem**, só para a nota aberta nesta janela (vale para o Imprimir e o
Salvar PDF; não grava no perfil). Vem marcada a do perfil (na Automática, a
que a tabela pede). Outra nota volta à do perfil.

No painel do Editar colunas, acima da prévia, **Orientação da folha**, em
botões lado a lado:
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

**Botão de perfil**: na barra preta, da nota e da tela inicial, o último à
direita. Fundo branco, o ícone de pessoa, o nome do perfil e a seta. Clicar
nele (ou Enter ou espaço, com o foco nele) abre o menu **Perfil**: a lista dos
perfis, com a marca verde no atual; as setas navegam, Enter escolhe e Esc
fecha. Clicar noutro perfil troca na hora, em todas as janelas, e mostra o
aviso "Perfil <nome> ativo". Depois da lista, **Gerenciar perfis...** abre o
painel **Editar colunas** com a lista de perfis já aberta (novo, renomear,
excluir, importar e exportar), e **Configurações** abre as Configurações.

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

A janela tem tamanho mínimo de 680 x 560: encaixa na metade de uma tela de
1366 x 768 a 100%, ao lado de outra janela, e cabe maximizada num 1366 x 768
com escala de 125% (a conta está em `src/tamanhoJanela.ts`). A janela em si
nunca rola: só a área do documento rola (veja Zoom e rolagem), e a
tabela de itens rola na horizontal dentro do próprio quadro. Abaixo de 1024 a barra da nota continua numa linha só (abaixo
de 960, Início, Abrir outro XML e Imprimir ficam só com o ícone), e o DANFE
em 100% encolhe até caber na largura (a partir de uns 880 px a folha cabe em
tamanho real). Ao fechar, a janela guarda em `config.json` (chave `janela`) o
tamanho, a posição e se estava maximizada, e abre assim da próxima vez; um
tamanho salvo abaixo do mínimo sobe para o mínimo, sem perder a posição. Se a
posição salva não cai em nenhum monitor conectado (por exemplo, o segundo
monitor foi desligado), abre com o tamanho padrão, centralizada no monitor
principal.

A versão do app (do `package.json`) aparece no cartão de notas recentes da
tela inicial.

### Atalhos

| Atalho             | O que faz                                          |
| ------------------ | -------------------------------------------------- |
| Ctrl+O             | Abrir arquivo (tela inicial e barra da nota)       |
| Ctrl+S             | Salvar (.psxml na Conferência, PDF no DANFE)       |
| Ctrl+P             | Imprimir, com o mesmo aviso de impressora de cupom |
| Ctrl + / Ctrl -    | Zoom do documento, pelo centro da parte à vista    |
| Ctrl+roda ou pinça | Zoom do documento, pelo ponto embaixo do cursor    |
| Ctrl+0             | Zoom de volta a 100%                               |

O atalho aparece no texto de ajuda do botão. Se o botão não está na tela ou está
desabilitado (por exemplo Ctrl+S na tela inicial, ou durante um salvamento), o
atalho não faz nada. Na anotação, Ctrl+C, Ctrl+V e Ctrl+X seguem normais.

### Zoom e rolagem

O zoom vale só na área do documento (Conferência e Documento), não na barra
nem na tela inicial, nos níveis do navegador (50% a 200%). Fora de 100%
aparece no canto o botão **Restaurar 100%**. Cada modo guarda o seu zoom
enquanto o app está aberto. A impressão e o PDF saem sempre em 100%, e o DANFE
é sempre paginado em 100%.

- **Ctrl + roda do mouse** e a **pinça do touchpad** aproximam e afastam
  mantendo no lugar o ponto que está embaixo do cursor: dá para mirar um
  campo do DANFE e chegar nele direto.
- **Ctrl +**, **Ctrl -**, **Ctrl+0** e o botão **Restaurar 100%** mantêm o
  centro da parte que está à vista.

Só a área do documento rola, na vertical e, quando o documento fica mais
largo que a área, na horizontal. A barra de título, a barra preta, as abas e
os painéis da esquerda ficam parados em qualquer zoom, e a janela nunca rola
de lado. Com pouco zoom, o fundo da área continua preenchendo a tela.

As barras de rolagem da área são do próprio app: finas enquanto nada
acontece, mais grossas com o mouse em cima ou durante a rolagem. O polegar
pode ser arrastado, e um clique no trilho rola uma página para aquele lado.
A barra horizontal só aparece quando há o que rolar de lado. Elas não saem
no PDF nem na impressão.

### Barra da nota

No alto, a **barra de título própria** (36 px, preta, arrastável; o duplo
clique maximiza; minimizar, maximizar e fechar são os do Windows): a logo, o
emitente em negrito, "NF-e nº X série Y" e o nome do arquivo, separados por
um traço vertical discreto (na cópia editada, também "Cópia editada, sem
validade fiscal"). O título da janela na barra de tarefas e no Alt+Tab
continua o mesmo.

Abaixo, a **barra preta** com filete amarelo: à esquerda, o que troca a
vista; à direita, **Início** e **Abrir outro XML**, **Imprimir** e
**Salvar** com a seta, e o **botão de perfil** (ver Botão de perfil). A
situação da Planilha de ST e da TIPI fica no cartão da ferramenta **ST, MVA
e CFOP** do painel (pastilhas "Planilha de ST" e "TIPI", verde ok e vermelho
falta, que abrem as Configurações no cartão daquele documento). Quando falta
espaço, as ações descem para uma segunda linha:

- Navegação: **Início** (volta para a tela inicial; com anotação não salva, faz a
  pergunta de sempre) e **Abrir outro XML** (ver Várias janelas).
- Abas: **PSXML** e **XML** (ver Abas PSXML e XML), que trocam sem reabrir
  o arquivo.
- Saída:
  - **Imprimir**: abre o diálogo de impressão do Windows com a tela atual (na
    Conferência, já na orientação calculada para a tabela). Se a
    impressora padrão for de cupom, avisa antes; Cancelar não abre o diálogo. A
    lista de nomes de impressora de cupom fica em `src/impressoras.ts`: ELGIN,
    térmica, 80mm, 58mm, POS só como palavra inteira (POS-80 e POS58 casam,
    Positivo não) e TM-T seguido de dígitos (EPSON TM-T20X-II).
  - **Salvar**, o único botão principal: na Conferência grava só a cópia
    editada (`.psxml`); no DANFE, só o PDF. Enquanto grava, mostra
    "Salvando...". O Salvar grava sempre na pasta mostrada em "Salvando em"
    (menu da seta). Com um `.psxml` aberto que está nessa mesma pasta, grava
    por cima dele sem perguntar (é o próprio arquivo aberto); se ele está em
    outra pasta, ou se o aberto é o XML original, grava o `.psxml` com o nome
    padrão na pasta de destino e o aberto fica como está. Se esse `.psxml` já
    existe, pergunta **Substituir**, **Salvar cópia...** ou **Cancelar** (ver
    Salvar cópia).
  - A seta colada no Salvar abre um menu com **Salvar** (o mesmo do botão),
    **Salvar PDF** (o PDF do modo em que a tela está; na Conferência, com a
    orientação e a fonte calculadas), **Salvar cópia...** e a seção
    **Salvando em**: o caminho completo da pasta de destino, **Trocar pasta
    de destino...** e **Abrir pasta no Explorer**.

Os nomes saem dos dados da nota, não do nome do arquivo aberto
(`src/nfe/nome.ts`):

```
<FORNECEDOR>_NF<número>_Conferencia.pdf
<FORNECEDOR>_NF<número>_Conferencia.psxml
<FORNECEDOR>_NF<número>_DANFE.pdf
```

Por exemplo `EXEMPLO_NF2330596_Conferencia.pdf`. FORNECEDOR é o nome fantasia
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
o PDF da Conferência ou do DANFE), uma caixa
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
- Todos os tipos de emissão da NF-e modelo 55 têm DANFE (`tpEmis` 1 a 7),
  conforme o Manual de Orientação do Contribuinte. Na emissão normal o DANFE
  é o de sempre. Em contingência:
  - **FS-IA e FS-DA** (formulário de segurança, `tpEmis` 2 e 5): abaixo da
    chave de acesso entra um segundo código de barras, "Dados da NF-e" (36
    dígitos), e os mesmos dígitos aparecem em "DADOS DA NF-E", no lugar do
    protocolo de autorização. A expressão "DANFE em Contingência - impresso
    em decorrência de problemas técnicos" sai em negrito.
  - **EPEC** (`tpEmis` 4): a consulta indica o portal da NF-e, e o campo
    "PROTOCOLO DE AUTORIZAÇÃO DO EPEC" fica em branco, porque esse protocolo
    não vem no XML da NF-e. A expressão "DANFE impresso em contingência -
    EPEC regularmente recebida pela Receita Federal do Brasil" sai em
    negrito.
  - **SCAN, SVC-AN e SVC-RS** (`tpEmis` 3, 6 e 7): como a emissão normal.
  - Em todos, as Informações Complementares começam pela expressão
    obrigatória (quando há) e pela entrada em contingência: a data e a hora
    e a justificativa, como vieram no XML.
- Uma NF-e modelo 55 com `tpEmis` 9 (tipo de emissão que só existe na
  NFC-e) fica sem DANFE, com o motivo na tela; a NFC-e (modelo 65) tem o
  DANFE NFC-e (veja Documentos fiscais). Nesses casos a conferência continua
  funcionando.
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

### Documentos fiscais

Além da NF-e, o modo **Documento** da aba XML mostra:

- **NFC-e**: o DANFE NFC-e na bobina de 80 mm, com o QR Code da nota. A
  NFC-e abre pela tela da nota, com a Conferência, como a NF-e.
- **CT-e**: o DACTE.
- **NFS-e Nacional e ABRASF**: o DANFSe. A ABRASF não tem modelo oficial de
  impressão; o rodapé diz que o documento foi montado pelo PS Reader a
  partir do XML.
- **Eventos da NF-e** (carta de correção, cancelamento e outros): uma
  visualização simples, montada a partir do XML.

**Imprimir** e **Salvar PDF** funcionam neles como na NF-e; a cópia editada
(`.psxml`) é só da NF-e e da NFC-e.

**Nome do município**: quando o XML do CT-e ou da NFS-e traz só o código
IBGE do município, sem o nome, o app mostra o nome pela tabela de municípios
do IBGE que vem dentro dele, sem acessar a internet. No DANFSe, onde antes
saía "IBGE 2800308 / SE", sai "Aracaju / SE"; no DACTE, o município do
remetente, do destinatário e das outras partes e os do início e do fim da
prestação. O nome que vem no XML vale primeiro; um código que não está na
tabela continua aparecendo como "IBGE" e o número.

### Avisos da nota (modo Conferência)

À esquerda da nota, o painel de conferência mostra o que a nota tem a
apontar. No topo, o resultado: "✓ Tudo certo · 6 verificações" em verde, ou
"N pontos para olhar" em vermelho. Embaixo:

- **Verificações automáticas**: uma linha por verificação (idade da nota,
  total dos itens, duplicatas, vencimentos, alíquota de ICMS, destinatário,
  nota já conferida), com o ícone do estado: check verde (certo), i cinza (só
  informa), triângulo amarelo (aviso leve) ou x vermelho (alerta forte),
  os mesmos ícones dos documentos de referência (src/icones.ts); clicar
  mostra o detalhe. O título diz o
  resultado, não a pergunta: "Totais conferem" ou "Total dos itens difere em
  R$ 2,10"; "Parcelas em dia" ou "Parcela 001 vencida há 20 dias";
  "Destinatário: Ferragens Exemplo Ltda"; "Primeira conferência desta nota" ou "Já
  conferida em 28/10". A linha da alíquota de ICMS só aparece quando algum
  item destaca ICMS com uma alíquota diferente da interestadual esperada
  (aviso leve, "Item 3: alíquota de ICMS diferente da esperada" ou "2 itens
  com alíquota de ICMS diferente da esperada"); o detalhe lista os itens,
  como na ferramenta ST, MVA e CFOP. Aviso leve e alerta
  forte contam como pontos para olhar. A "já conferida" tem **Abrir em nova
  janela**.
- **Precisa de você**: com o cadastro carregado, a linha "Código da casa: N
  de M itens definidos" (veja Coluna Código da casa); e cada item com a Qtd
  recebida diferente da nota: clicar rola a tabela até a linha, destaca a
  linha por um instante e põe o foco na caixa Qtd recebida dela.
- **Ferramentas**: ações sobre a nota aberta, que mostram a prévia antes de
  mudar alguma coisa. A primeira é **ST, MVA e CFOP** (veja abaixo).
  Embaixo, **CFOPs de entrada**: a contagem por valor da coluna de anotação
  "CFOP de entrada" ("2102: 194 itens · 2403: 2 itens"), do que a ferramenta
  gravou e do que foi digitado, atualizada enquanto se digita. Clicar num
  valor lista os itens (número e descrição); clicar num item rola a tabela
  até a linha, destaca a linha e põe o foco na caixa CFOP de entrada dela.
  Valores com poucos itens (até 10% dos preenchidos, no mínimo 1, havendo
  outro valor) ficam em destaque.

A ordem das ferramentas e quais aparecem são do perfil (Configurações, aba
Ferramentas).

Ações que passam de meio segundo (como procurar a nota na pasta de destino
pela rede) mostram um círculo girando no painel. O botão no topo recolhe o
painel: sobram só dois botões flutuantes no canto de cima da área da nota,
**›** para abrir e, embaixo, o selo da situação (check verde, ou o número de
pontos em vermelho), que também abre. Janela larga (o
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
- **Nota de outra empresa**: o CNPJ do destinatário não é o da loja. Avisa
  no painel da Conferência e, na aba XML, no cartão de aviso do painel
  Leitura (veja Abas PSXML e XML); nenhuma janela abre por cima da nota.
- **Nota emitida pela loja**: o CNPJ do emitente é o da loja (uma venda ou
  uma devolução que a própria loja emitiu). Não é nota de outra empresa: a
  linha do destinatário vira "Nota emitida pela loja", só como informação,
  e na aba XML aparece o cartão de informação. O CNPJ da loja fica na chave
  `cnpjEmpresa` do `config.json`, gravada na tela de boas-vindas ou na aba
  Geral das Configurações (conferido com os dígitos verificadores,
  `src/nfe/cnpj.ts`). Não há CNPJ no código: sem CNPJ gravado, esta
  verificação não roda.
- **Nota já conferida**: há um `.psxml` com a mesma chave de acesso na pasta
  de destino em uso. Avisa no painel e num pop-up ao abrir, com o nome do
  arquivo, a data de modificação e **Abrir em nova janela**. O app lê só os
  nomes da pasta e abre apenas os `.psxml` com `_NF<número>` no nome (como o
  Salvar grava); a chave confirma. O próprio arquivo aberto não conta, e uma
  cópia salva com nome livre, sem `_NF<número>`, não é encontrada.

### Documentos de referência

Os documentos ficam na aba **Documentos de referência** das Configurações.
Ela abre pelo menu do perfil (**Configurações**), pelas pastilhas Planilha
de ST e TIPI do cartão da ferramenta ST (já no cartão daquele documento, com
o foco nele), pelas linhas e pelo **Gerenciar** da tela
inicial, e pelo atalho da ferramenta ST quando falta a planilha. O app vem
sem documentos; na primeira vez a aba explica o que carregar e para quê. Um
cartão por documento:

- **Planilha de ST de Sergipe**: o `.xlsx` da página de Sergipe do Portal
  Nacional da Substituição Tributária (CONFAZ). Necessária para a ferramenta
  ST, MVA e CFOP.
- **TIPI**: o `tipi.xlsx` da página da TIPI no site da Receita Federal, ou o
  texto `.txt` extraído do PDF. Sem ela, a ferramenta roda sem conferir NCM
  e IPI.
- **Lubrificantes do Apêndice XIV** (Ato COTEPE/ICMS 61/19): opcional. A
  planilha do CONFAZ com os apêndices empilhados numa aba só; o app acha o
  Apêndice XIV, os grupos (derivado e não derivado de petróleo), as colunas
  Internas e Interestaduais e as alíquotas, e guarda versão, UF e vigência.
  Arquivo sem o apêndice, ou de UF que não é Sergipe, é recusado. Com ele
  carregado, NCM 2710 e 3403 fora da planilha de ST vira "confirmar" na
  ferramenta.
- **Cadastro do sistema de gestão**: opcional. Um `.json` que a loja
  exporta do próprio sistema de gestão, no formato genérico descrito em
  [docs/formato-cadastro.md](formato-cadastro.md) (fornecedores,
  produtos, vínculos de código, fatores e notas já lançadas; para quem não
  tem como gerar JSON, há um modelo de planilha CSV e o conversor). O cartão
  mostra a origem, a data da extração, a data da importação, as quantidades
  e o relatório da leitura (pontos de atenção e observações). Arquivo que
  não segue o formato é recusado com a lista do que falhou, e o cadastro
  carregado continua valendo; limite de 30 MB. Com ele carregado, a coluna
  **Código da casa** da Conferência sugere o produto da loja para cada item
  (veja Coluna Código da casa).

Cada cartão mostra o ícone e o rótulo da situação, o nome do arquivo em
uso com um **X** para remover o documento (com confirmação; sem a planilha de
ST, a ferramenta volta a pedir o arquivo), a versão e a vigência, a data da
importação, as quantidades lidas e os botões **Atualizar** (baixa do site
oficial), **Trocar arquivo** e **Ver relatório da leitura**. Planilha de ST
importada por uma versão antiga, sem os protocolos, aparece em aviso
("Reimportar") no cartão, na tela inicial e na pastilha.

Erro ao carregar ou atualizar um documento aparece num aviso com **X**;
fechar volta ao estado de antes da tentativa.

O relatório separa duas coisas:

- **Ignorado de propósito**: o que o documento traz e não entra na busca, de
  propósito: abas sem coluna NCM ou sem MVA (Água mineral, Bebidas frias),
  linhas sem NCM ou sem CEST, exceções "Ex", notas e cabeçalhos da TIPI.
- **Problemas de leitura**: célula que não deu para converter (MVA ilegível,
  CEST fora do formato, NCM sem alíquota), listados por aba ou segmento, com
  célula, motivo e conteúdo.

Com só ignorados, o rótulo é verde "Carregado"; com problema de verdade,
amarelo "Carregado com N problemas". O ícone do estado, no cartão, nas
pastilhas e na tela inicial, é o check verde (ok), o triângulo amarelo
(problemas de leitura, segmentos incompletos, reimportar ou versão nova
disponível), o x vermelho (faltando, ou arquivo incompatível sem nenhum
documento carregado) ou o círculo vazado (opcional, não carregado), sempre
com o texto ao lado.

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
`st-leitura.json` e `tipi-leitura.json`, na mesma pasta. O cadastro do
sistema de gestão fica como foi importado em `cadastro.json`, com os
metadados e o relatório da leitura em `cadastro-info.json`.

**Verificação online** (embaixo, na mesma aba, e também na aba Geral): o
interruptor vem desligado e,
com ele desligado, o app nunca acessa a internet. Ligado, aparecem **Verificar
agora** e a opção **Verificar ao abrir o app** (também desligada). Nada roda em
segundo plano fora disso. A rede fica só no processo principal, com tempo
limite e uma requisição por documento:

- Planilha de ST: lê a página do CONFAZ de Sergipe, acha a maior "Versão 00XX"
  e compara pelo número (a 0018 e a 0019 têm a mesma vigência). Com versão
  nova, a tela inicial mostra "v0020 disponível" e o cartão oferece
  **Atualizar**: o app baixa (só de endereço https do CONFAZ ou do gov.br,
  sem seguir redirecionamento), lê numa pasta temporária com a mesma
  conferência da importação e só troca o documento carregado se a leitura
  passar.
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

- **Evidência na nota**: o NCM bater com uma linha da planilha não basta
  para o "Sim". Com uma linha candidata, o "Sim" automático pede também o
  CEST do item igual ao da linha (comparado pelos 7 dígitos). Sem CEST, o
  item fica em **Confirmar** e conta em "precisam de você", mesmo que o
  fornecedor tenha retido ST no item (CST 10, 30, 60, 70 ou 90, ou CSOSN
  201, 202, 203, 500 ou 900, com valores de ST; ou ICMS-ST, base do ST
  retido ou ICMS-ST retido maior que zero). O CEST é obrigatório na nota de
  produto listado nos anexos, mesmo sem ST (Convênio ICMS 142/2018,
  cláusula vigésima, I): retenção sem CEST já é nota incompleta, e o
  fornecedor pode ter retido errado. Nesse caso o motivo é "O fornecedor
  reteve ST, mas não informou o CEST, que é obrigatório para produto desta
  lista (Convênio ICMS 142/2018, cláusula vigésima, I). Confirme se o
  produto é deste segmento." Quando a nota não tem CEST e veio com
  tributação sem ST, **Sem ST** vem sugerido. CEST de outra linha ou de
  outro segmento também fica em **Confirmar**, e o motivo diz qual segmento
  o CEST da nota indica ("o CEST da nota indica o segmento Tintas (Tintas,
  linha 5)"). A caixa "Item N: o produto é do
  segmento X?" mostra as evidências em linhas curtas (NCM e linha da
  planilha, descrição da linha, segmento, CEST da nota, ST retida) e as
  escolhas **Tem ST (é deste segmento)** e **Sem ST (não é deste
  segmento)**; a MVA e a alíquota interna só valem depois de "Tem ST". A
  escolha vira decisão lembrada com o motivo ("é do segmento X" ou "não é
  do segmento X").
- **Mudar**: a palavra final é da pessoa. Todo item que não está em
  "Confirmar" (Sim, Não, lembrado, decidido) tem o lápis **Mudar**, que abre
  a mesma caixa de escolha, com "Pelo app: ..." (o que o app decidiu e por
  quê) e a escolha do app já marcada. **Tem ST** só aparece quando o NCM tem
  linha na planilha (com mais de uma, a pessoa escolhe a linha); **Sem ST**
  e **Outro** sempre. A troca vira decisão lembrada com o motivo "decisão da
  pessoa" (e o do segmento, quando houver); a linha ganha a marca **sua
  decisão** e "Pelo app: ..." com o valor original. "Precisam de você" e o
  CFOP do Aplicar seguem a escolha da pessoa.
- **Confirmar**: quando mais de uma linha da planilha serve, a caixa "Item
  N: qual linha da planilha vale?" mostra a linha da TIPI e uma explicação
  montada com a TIPI, as linhas candidatas e a nota (CEST e ST retido). A
  pessoa escolhe entre os candidatos, marca **Sem ST** ou usa **Outro**.
  **Sem ST** já vem marcado quando a descrição da TIPI e as das linhas não
  têm palavra em comum e a nota veio sem CEST e sem ST retido.
- **Outro** (CFOP manual): o CFOP (começando por 1, 2 ou 3), a MVA se
  quiser e o motivo, obrigatório. Vira decisão lembrada, aparece como "CFOP
  manual" na prévia e ganha uma marca no resumo de CFOPs do painel.
- **Pelo histórico**: quando o mesmo NCM (8 dígitos) já tem 2 ou mais
  decisões lembradas e pelo menos 80% delas na mesma escolha, aparece a
  opção "Pelo histórico" com **Usar** (nunca já marcada); abaixo de 80%,
  "Histórico dividido".
- **Apêndice XIV**: com os lubrificantes carregados, o item de NCM 2710 ou
  3403 fora da planilha de ST pergunta "Sim" ou "Não"; o "Sim" pede derivado
  ou não derivado de petróleo, e a MVA vem da coluna (interna,
  interestadual ou pela alíquota da nota), com a ressalva da contabilidade
  no motivo.
- **Autopeças**: vale só a MVA-ST 1, e o motivo diz "MVA-ST 1 (regra geral;
  a loja não tem índice de fidelização)". A MVA-ST 2 é só para fidelização
  com montadora, que a loja não tem.
- **Alíquota interestadual esperada** (src/fiscal/aliquotaInterestadual.ts):
  pela UF do emitente, pela UF do destinatário e pela origem do item
  (`orig`). Mesma UF: operação interna, não se aplica. Origem 1, 2, 3 ou 8:
  4% (Resolução do Senado 13/2012; as origens 6 e 7 ficam fora dos 4%).
  Emitente em SP, RJ, MG, PR, SC ou RS e destinatário no Norte, no
  Nordeste, no Centro-Oeste ou no ES: 7%. Demais casos: 12% (Resolução do
  Senado 22/1989). Quando o item destaca ICMS (`pICMS`) com outra
  alíquota, o item mostra o aviso "Alíquota de ICMS diferente da esperada:
  a nota traz 12%, o esperado para esta origem é 7%." (com 4% numa origem
  nacional, diz também que os 4% valem só para as origens 1, 2, 3 e 8).
  Itens sem ICMS destacado (Simples Nacional, isentos, ST já retido) não
  são comparados. O app avisa, não decide: a ST, a MVA e o CFOP não mudam.
- **Fornecedor do Simples Nacional** (item com CSOSN, sem `pICMS`) e
  produto com ST: a coluna de MVA da planilha é a da alíquota esperada, e a
  coluna MVA mostra de onde ela veio ("coluna de 12%, pela origem e pelo
  estado do fornecedor").
- **MVA retida pelo fornecedor**: com a linha da planilha certa (o app
  decidiu ou a pessoa confirmou) e na revenda, a MVA da nota (`pMVAST`) é
  comparada com a da planilha na coluna da alíquota esperada, as duas com 2
  casas. Menor: aviso "O fornecedor reteve com MVA menor que a da planilha
  (40% contra 55%). Lance com a MVA da planilha; a diferença é complementada
  na apuração. Avise o fornecedor para acertar as próximas notas." Maior:
  alerta "O fornecedor reteve com MVA maior que a da planilha (60% contra
  55%). Fale com o contador antes de lançar: a orientação é recusar ou
  devolver a mercadoria e pedir uma nota nova." Com o item em "Confirmar",
  não compara.
- **Dicas**: cabeçalhos, botões e o selo "lembrado" têm dica no visual do
  app, que abre depois de 400 ms com o mouse ou com o foco do teclado (o
  foco vale mais que o mouse) e fecha com Esc.
- **Finalidade** por item (padrão revenda), de um item ou de vários marcados
  de uma vez. CFOP pela tabela da loja (1 = emitente de Sergipe, 2 = de
  fora):

  | Finalidade           | Sem ST    | Com ST    |
  | -------------------- | --------- | --------- |
  | Revenda              | 1102/2102 | 1403/2403 |
  | Uso e consumo        | 1556/2556 | 1407/2407 |
  | Bonificação          | 1910/2910 | 1910/2910 |
  | Ativo imobilizado    | 1551/2551 | 1551/2551 |
  | Outras entradas      | 1949/2949 | 1949/2949 |
  | Devolução de cliente | 1202/2202 | 1411/2411 |

  A MVA só é calculada na revenda; nas outras finalidades com ST aparece
  "confirmar com a contabilidade", menos na devolução de cliente, que não
  tem MVA (a coluna fica "-").

- **Nota de devolução**: o app lê a finalidade da NF-e (`finNFe`) e as
  notas referenciadas (`NFref/refNFe`). Com `finNFe` 4, a ferramenta abre
  com todos os itens em **Devolução de cliente** (dá para trocar por item ou
  nos marcados), e o painel de conferência mostra a linha informativa
  "Nota de devolução" com o número e a série da nota referenciada, tirados
  da chave. "Com ST" continua vindo da planilha; o CFOP que o cliente usou
  na nota não decide nada (ele pode devolver com 5556 e a entrada ser 1202).
  Decisão com a finalidade Devolução de cliente não é lembrada nem entra no
  histórico.

- **Decisões lembradas**: cada escolha (linha da planilha, sem ST, Apêndice
  XIV, CFOP manual, finalidade) fica guardada por raiz do CNPJ do fornecedor
  (8 dígitos) e código do produto, em `decisoes.json` na mesma pasta dos
  documentos. Na próxima nota o item já vem resolvido, marcado **lembrado**,
  com **desfazer**. Vale para o mesmo NCM e enquanto a linha escolhida
  existir na planilha. A lista fica nas Configurações, aba Decisões
  lembradas. Se o Windows recusar por um instante a gravação do
  `decisoes.json` (o arquivo aberto pelo antivírus ou pela indexação, por
  exemplo), o app tenta de novo algumas vezes antes de desistir, e a decisão
  não se perde por isso.
- **Aplicar**: grava o CFOP numa coluna de anotação, por padrão **CFOP de
  entrada**; se ela não existir no perfil, o app oferece criar na hora. Sem
  coluna de destino, não aplica. No rodapé, opcionais: **Gravar a MVA em** e
  **Gravar a alíquota interna em** outra coluna; cada perfil escolhe se
  esses campos aparecem (Configurações, aba Ferramentas), e campo oculto não
  é gravado. Célula já preenchida com outro valor: o app pergunta antes
  (padrão: não substituir). Item sem CFOP definido fica como está. Grava só
  nas anotações (o `.psxml` ao salvar); o XML original nunca muda.

### Coluna Código da casa (modo Conferência)

Com o cadastro do sistema de gestão carregado (veja Documentos de
referência), a coluna **Código da casa** diz, para cada item da nota, qual é
o produto da loja: o código como está no cadastro, a descrição curta e,
quando a unidade da nota não é a de venda, o fator ("12 UN por CX": uma
caixa da nota são 12 unidades na loja). Ela fica no grupo **Cadastro** do
**Editar colunas**. Sem cadastro carregado, a coluna aparece apagada no
editor, com o motivo: "Carregue o cadastro do sistema de gestão em
Documentos de referência".

**Na primeira vez que um cadastro é carregado**, o app pergunta uma vez se a
coluna entra no perfil ativo, logo depois da Descrição: **Mostrar a coluna**
ou **Agora não**. O perfil só muda com o "Mostrar a coluna"; depois, a
coluna se liga e desliga no Editar colunas, como as outras.

**Ícone de confiança**: ao lado de cada sugestão do app, um círculo com três
barras (confiança alta), duas (média) ou uma (baixa), em verde, amarelo ou
vermelho. A confiança diz quanto o caminho que o app usou é seguro: o
código do fornecedor vinculado ao produto no cadastro é alta; um código
parecido, de uma filial ou só pelo código de barras é mais baixa (o detalhe
está em [docs/formato-cadastro.md](formato-cadastro.md)). Escolha da pessoa e
decisão lembrada levam o check verde.

**Quadro de escolha**: o botão da célula abre o quadro do item, com:

- o item da nota (código, descrição, código de barras e unidade);
- **Sugestões do app**: os produtos que o app achou, cada um com o motivo
  (quando acha mais de um pelo mesmo caminho, ele não escolhe e lista
  todos);
- **Buscar no cadastro**, por código, descrição ou código de barras;
- **Nenhum (vincular no sistema de gestão)**, para o item que ainda não tem
  produto na loja;
- o **Fator**: quantas unidades de venda há em uma unidade da nota, sugerido
  pelo cadastro e editável (aceita vírgula, como 0,5).

**Usar** grava a escolha, **Cancelar** deixa como estava e **Voltar ao
automático** (quando o item tem escolha da pessoa ou decisão lembrada) volta
para a sugestão do app.

**Decisões lembradas**: toda escolha feita no quadro fica lembrada por
fornecedor (raiz do CNPJ do emitente) e código do item, e na próxima nota
desse fornecedor o item já vem com ela, na frente da sugestão do app. Elas
aparecem nas Configurações, aba **Decisões lembradas**, com o tipo **Código
da casa**, e podem ser apagadas ali.

**Contador no painel**: na seção **Precisa de você** do painel da
Conferência, a linha "Código da casa: N de M itens definidos". Contam como
definidos a escolha da pessoa, a decisão lembrada, o "nenhum" e a sugestão
de confiança alta; precisam de você as sugestões de confiança média ou
baixa, os itens com mais de um produto possível e os sem sugestão. Clicar na
linha leva ao próximo item pendente, um de cada vez; com tudo definido, a
linha fica com o check verde.

**No `.psxml`**: ao salvar, a cópia leva o produto escolhido para cada item,
de onde veio (sugestão do app, decisão lembrada ou escolha da pessoa) e o
fator, e abre de novo do mesmo jeito (veja Cópia editada). Cópias salvas
antes desta coluna abrem normalmente, sem ela. No PDF e na impressão a
coluna sai como texto ("1001 · PARAFUSO ... · 100 UN por CX"), sem ícones
nem botões.

## Configurações

O item **Configurações** do menu do perfil (tela inicial e tela da nota) abre
as Configurações dentro da própria janela, com as abas à esquerda. Ao abrir, o
foco vai para o conteúdo; aberta pelo cartão de um documento, o foco segue
para o cartão. Seis abas:

- **Geral**: a pasta de destino (a mesma do "Salvando em", com
  **Trocar pasta...** e **Abrir pasta no Explorer**); **Empresa e avisos da
  nota**: CNPJ da loja (obrigatório, sem valor padrão), **Aviso de vencimento
  (dias)** (padrão 15) e **Nota antiga (dias)** (padrão 30), as chaves
  `cnpjEmpresa`, `diasAvisoVencimento` e `diasNotaAntiga` do `config.json`;
  e a **Verificação online**, com **Verificar ao abrir o app**.
- **Perfis e colunas**: os perfis e **Abrir o editor de colunas** (ver
  Perfis de configuração).
- **Ferramentas**: por perfil, quais ferramentas aparecem na seção
  Ferramentas do painel (**ST, MVA e CFOP** e **CFOPs de entrada**) e em que
  ordem (arrastar pela alça ou setas para cima e para baixo nela), e os
  campos do rodapé da "ST, MVA e CFOP" (**Gravar a MVA em**, **Gravar a
  alíquota interna em**). O CFOP é sempre gravado. Também **NF-e abre em**:
  **XML (DANFE)** (padrão) ou **PSXML** (ver Onde a nota abre).
  As mudanças valem na hora.
  Fica na chave `ferramentasPerfis` do `config.json`, fora dos perfis, para
  o arquivo de um perfil exportado não mudar; excluir um perfil apaga a
  entrada dele.
- **Documentos de referência**: os cartões dos documentos e a verificação
  online (ver Documentos de referência).
- **Decisões lembradas**: as escolhas feitas na ferramenta ST, MVA e CFOP e
  na coluna Código da casa (tipo **Código da casa**), com busca (fornecedor,
  produto ou NCM), filtro por tipo, **Apagar** em cada uma e **Apagar as
  selecionadas**, com confirmação na própria página. Apagada, a ferramenta
  ou a coluna volta a perguntar na próxima nota daquele produto.
- **Dados do app**: a pasta dos dados (`%APPDATA%\PS Reader`), com **Abrir
  pasta dos dados**, a tabela **O que o app guarda** e o **Backup**.

**Backup**: **Exportar backup** grava `PS Reader - backup <data>.psbackup`
(JSON) com os perfis, as ferramentas por perfil, o CNPJ, os dias dos avisos,
as preferências (verificação online) e as decisões lembradas. Os documentos
fiscais (planilha de ST, TIPI, lubrificantes) ficam de fora: são públicos e
se carregam ou baixam de novo. **Importar backup** recusa arquivo acima de
5 MB, valida o arquivo inteiro antes de mexer em qualquer coisa e mostra uma
tabela com cada parte, o que veio no backup e o que acontece ("Substitui",
"Não veio no backup: fica como está"). A pasta de destino e as notas
recentes deste computador nunca mudam. Com **Importar e substituir**, o app
copia os arquivos atuais para `antes-da-importacao-<data>` dentro da pasta
de dados (ficam as 3 mais novas) e só então grava as partes que vieram; a
que não veio fica como está.

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
  <codigosCasa>
    <item nItem="5" codigo="1001" origem="pessoa" fator="100" unidadeCompra="CX" descricao="PARAFUSO SEXTAVADO 1/4 X 2 ZINCADO" unidade="UN"/>
  </codigosCasa>
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

`<codigosCasa>` guarda o que a coluna Código da casa tem para cada item: o
produto (ou `nenhum="true"`), a `origem` (`motor`, com a `confianca`;
`lembrada`; ou `pessoa`) e o fator. Cópia sem ele, como as salvas antes
desta coluna, abre normalmente (o formato está em
[docs/formato-cadastro.md](formato-cadastro.md)).

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

Os ícones ficam em `assets\`: `ps-reader.ico` (executável, janela, instalador
e Configurações > Aplicativos), `icone-xml.ico` (arquivos `.xml` no "Abrir
com" do PS Reader), `icone-psxml.ico` (arquivos `.psxml`), `icone-xml.svg` e
`icone-psxml.svg` (miniaturas das abas XML e PSXML), `ps-logo.svg` e
`ps-logo-icone-simplificado.svg` (logo vetorizado) e `ps-logo-1024.png`. Os
dois `.ico` dos arquivos vão no pacote, em `resources\` (`extraResource` do
`forge.config.mts`).

Na instalação e em cada atualização, o app associa a extensão `.psxml` (só ela)
no registro do usuário atual, `HKCU\Software\Classes` (`src/associacao.ts`); a
desinstalação apaga essas chaves. O comando de abrir aponta para o executável
fixo da raiz, `%LocalAppData%\PSXmlReader\PS Reader.exe`, que não muda entre
versões. Os ícones dos arquivos são copiados de `resources\` para
`%LocalAppData%\PSXmlReader\icones\` (que também não muda) e o
`DefaultIcon` aponta para lá: `PSReader.psxml` com `icone-psxml.ico` e
`PSReader.xml` (o "Abrir com" do `.xml`) com `icone-xml.ico`. Se a cópia
falhar, o ícone fica o do app, como antes, e o log diz o motivo. Na
desinstalação, a pasta `icones` sai junto com as chaves. Depois de gravar ou apagar as chaves, o app avisa o
Explorer (SHChangeNotify com SHCNE_ASSOCCHANGED) para atualizar o ícone e o
nome do tipo. Na instalação e na atualização, o app também apaga os atalhos
`Leitor NF-e PS.lnk` que sobraram do nome antigo, só no menu Iniciar (a pasta
antiga do app e a raiz de Programas) e na área de trabalho do
usuário, e só se o atalho aponta para dentro de `%LocalAppData%\PSXmlReader\`.
Ainda na instalação e na atualização, antes do aviso ao Explorer, o app tira
do "Abrir com" o que sobrou de versões antigas. Para quem usa, o efeito é
que o "Abrir com" do `.xml` e do `.psxml` deixa de oferecer o instalador
(que, escolhido por engano, reinstalava a versão antiga) e o executável da
primeira versão, e passa a mostrar só o PS Reader atual. O que sai, em
detalhe (`src/abrirComAntigo.ts`): as
subchaves de `HKCU\Software\Classes\Applications` com nome
`PS Reader-*Setup.exe` (o instalador, que escolhido por engano reinstalava a
versão antiga) ou `Leitor NF-e PS*.exe` (o executável da 1.0.0), e os valores
de uma letra com esses nomes no `OpenWithList` do `.xml` e do `.psxml`
(`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts`), com a
letra tirada do `MRUList`. Nada mais: o `UserChoice`, o `MuiCache` e as
entradas de outros programas ficam como estão. A limpeza tem prazo de 3 s;
um erro vai para o log e a instalação segue.
Cada instalação, atualização ou desinstalação sobrescreve um log curto em
`%TEMP%\ps-reader-associacao.log` (evento, resultado de cada chamada ao
`reg.exe`, cópia dos ícones, registros antigos apagados do "Abrir com" e o
tempo da limpeza, saída do aviso ao Explorer, atalhos antigos apagados ou
mantidos e tempo total). Se o Explorer mesmo
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
   administrador, e abre o app. A versão aparece no cartão de notas recentes
   da tela inicial.

## Outros comandos

| Comando                                                                          | O que faz                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                              | Verifica os tipos TypeScript                                                                                                                                                                                                    |
| `npm run lint`                                                                   | Roda oxlint e confere a formatação                                                                                                                                                                                              |
| `npm test`                                                                       | Roda os testes automáticos                                                                                                                                                                                                      |
| `npm run test:janela`                                                            | Gera o pacote e roda o app numa janela oculta com NF-e inventadas de ataque (test/janela): o texto delas tem de aparecer literal. No fim, apaga as pastas temporárias que criou no `%TEMP%` (test/janela/rodar.cjs)             |
| `PS_JANELA_README=<pasta> npm run test:janela`                                   | Gera as imagens do README (as de `docs/imagens/`) com nota, perfis e cadastro inventados (test/janela/imagensReadme.cjs)                                                                                                        |
| `PS_JANELA_CATALOGO=<pasta> npm run test:janela`                                 | Grava o catálogo visual: cada peça da tela em cada estado (normal, mouse em cima, foco, pressionado, desabilitado), em 1366 e 1920, e a barra em cada faixa de largura, com nota e perfis inventados (test/janela/catalogo.cjs) |
| `node scripts/medir-cadastro.mjs <pasta de XMLs> <cadastro.json> [gabarito.csv]` | Mede o motor de casamento do cadastro sobre uma pasta de NF-e; grava `medicao.md` e `nao-casados.csv` na pasta atual ([docs/medidor-cadastro.md](medidor-cadastro.md))                                                          |
| `node scripts/cadastro-csv-para-json.mjs <pasta com os CSV> <cadastro.json>`     | Converte o modelo de planilha do cadastro (`docs/modelo-cadastro`) para o JSON, só se passar no validador                                                                                                                       |

## Estrutura

```
src/
  main.ts            processo principal: janelas (estado de cada uma), diálogos, printToPDF
  preload.ts         contextBridge com a API psApi (abrir, pasta, salvar, imprimir, copiar)
  impressoras.ts     lista de nomes de impressora de cupom (aviso antes de imprimir)
  associacao.ts      associação do .psxml no registro do usuário (eventos do Squirrel)
  abrirComAntigo.ts  o que a limpeza do "Abrir com" apaga (instalador e executável antigos)
  renderer.ts        monta a tela a partir do objeto Nota
  editorColunas.ts   painel Editar colunas (lista, arrastar, anotações extras, prévia)
  dom.ts             utilitários de DOM (el, icone, botao)
  boasVindas.ts      tela de boas-vindas (CNPJ da loja, perfil e pasta na primeira abertura)
  nfe/cnpj.ts        CNPJ: dígitos verificadores, destinatário no texto e sugestão das notas
  declarations.d.ts  tipos globais (window.psApi)
  nfe/config.ts      personalização da conferência: tipo, padrão, validação e migração
  nfe/perfis.ts      perfis de configuração: lista, migração, arquivo exportado e importado
  nfe/folha.ts       folha A4: largura útil por orientação, plano da tabela e régua da miniatura
  folhaTabela.ts     cópias da tabela de itens para o papel e medida das colunas
  miniaturaFolha.ts  miniatura da folha A4 no painel Editar colunas
  nfe/avisos.ts      avisos da nota: quantidade, totais, outra empresa, já conferida (lógica pura)
  nfe/conferencia.ts resumo do painel de conferência (verificações e pendências, lógica pura)
  nfe/resumoCfop.ts  contagem dos CFOPs de entrada por valor, para o painel
  nfe/recentes.ts    notas recentes da tela inicial: lista, situação e último acesso
  nfe/ferramentas.ts ferramentas do painel (Rodar, prévia, Aplicar; e as de janela própria)
  nfe/ferramentasPerfil.ts ferramentas do painel por perfil: ordem, visíveis, campos do rodapé
  painelConferencia.ts painel de conferência à esquerda da nota
  ferramentaST.ts    janela da ferramenta ST, MVA e CFOP (prévia, decisões, Aplicar)
  previaST.ts        linhas da prévia da ferramenta ST (MVA, alíquota, motivo)
  explicacaoST.ts    explicação da escolha da linha e sugestão de "Sem ST"
  historicoST.ts     sugestão pelo histórico do NCM e comparação da MVA do fornecedor
  tooltip.ts         dicas no visual do app (atraso, foco do teclado, Esc)
  configuracoes.ts   tela de Configurações (as seis abas)
  filtroDecisoes.ts  busca e filtro por tipo das decisões lembradas
  dadosApp.ts        o que o app guarda e o backup (.psbackup)
  areaDocumentos.ts  aba Documentos de referência (cartões, relatório, verificação online)
  estadoDocumentos.ts estado visível de cada documento (ícone, texto, versão nova)
  icones.ts          conjunto único de ícones, inclusive os de estado
  onlineSimulado.ts  gancho de desenvolvimento para testar a verificação online sem rede
  documentos.ts      documentos no processo principal: importação, rede, análise, decisões
  cadastroGestao.ts  cadastro do sistema de gestão no processo principal: carregar, gravar, remover
  cadastro/formato.ts   formato do cadastro (versão 1) e o validador
  cadastro/csv.ts       modelo de planilha do cadastro: leitura e conversão para o JSON
  cadastro/casamento.ts motor de casamento: produto da casa, caminho, confiança, fator e avisos
  cadastro/documento.ts o cadastro como documento: leitura, cadastro-info.json e o selo
  cadastro/codigoCasa.ts coluna Código da casa: escolha de cada item, resumo e texto (puro)
  codigoCasaTela.ts  célula e quadro de escolha da coluna Código da casa
  rolagemArea.ts     rolagem da área do documento: barras próprias e zoom pelo cursor
  fiscal/xlsx.ts     leitor mínimo de .xlsx (com fiscal/zip.ts)
  fiscal/st.ts       planilha de ST de Sergipe (Portal ST do CONFAZ)
  fiscal/tipi.ts     TIPI: texto do PDF e tipi.xlsx
  fiscal/combustiveis.ts lubrificantes do Apêndice XIV (Ato COTEPE/ICMS 61/19)
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
  styles/tokens.css  variáveis de cor, tipografia e medidas (inclui as do visual Bancada)
  styles/app.css     tela
  styles/bancada.css visual Bancada, só na tela: tela inicial, cartões, pastilhas, botões das janelas
  styles/janela.css  barra de título própria, barra preta, abas, menus, painel Leitura
  styles/boasVindas.css tela de boas-vindas
  painelLeitura.ts   painel Leitura da aba XML: modo de leitura, Folhas, Arquivo
  nfe/folhasDanfe.ts Folhas do DANFE na tela e a orientação da Folha do PDF
  formatoOriginal/montar.ts  Formato original: blocos, tabelas e valores formatados (puro)
  formatoOriginal/rotulos.ts rótulos da NF-e e o significado dos códigos
  formatoOriginal/tela.ts    tela do Formato original: seções, tabelas, busca
  styles/print.css   @media print (usado pelo PDF)
  danfe/dados.ts     XML -> campos do DANFE (separado do Nota da conferência)
  danfe/danfe.ts     montagem dos quadros e paginação do DANFE
  danfe/code128.ts   código de barras CODE-128C (tabela, DV, barras)
  danfe/contingencia.ts o que muda no DANFE emitido em contingência
  docfiscal/         DANFE NFC-e, DACTE, DANFSe, eventos e a tabela de municípios do IBGE
  danfe/danfe.css    layout do DANFE em mm/pt, tela e impressão
  ipcSeguro.ts       envoltório de todos os canais do IPC (confere o remetente)
  seguranca/argumentos.ts opções de linha de comando perigosas recusadas no app instalado
  seguranca/remetente.ts  quem pode falar com o processo principal (quadro principal do app)
  xml/decodificar.ts leitor genérico: bytes -> texto (BOM, UTF-16, declaração, windows-1252)
  xml/leitor.ts      leitor genérico: XML próprio, sem recursão e sem DTD
  xml/arvore.ts      leitor genérico: árvore compacta em colunas (typed arrays)
  xml/busca.ts       leitor genérico: busca nos nomes, atributos e textos
  xml/limites.ts     leitor genérico: árvore até 20 MB, só texto até 100 MB
test/janela/         app numa janela oculta com NF-e inventadas de ataque (npm run test:janela)
test/fixtures/cadastro/ cadastro inventado, 6 NF-e inventadas e o gabarito delas (motor e medidor)
scripts/             medidor e conversor do cadastro (Node, sem dependências para rodar)
docs/                manual, formato do cadastro, modelo de planilha, medidor e imagens do README
index.html           estrutura da página
assets/              ícone do app (ps-reader.ico) e logo da PS
forge.config.mts     configuração do Electron Forge (instalador Squirrel)
samples/             XMLs de teste locais (fora do git, nunca versionar)
```

## Licença e contribuição

Código aberto sob a licença MIT (arquivo `LICENSE`). Para contribuir, veja
`CONTRIBUTING.md`: o app é genérico, sem nenhum sistema de gestão específico
no código, e os testes usam só dados inventados.

## Regras do projeto

- Tudo que aparece na tela vem do XML. Campo ausente deixa a célula vazia ou
  esconde a seção. Nenhum texto padrão é inventado.
- Sem dependências além das que o template do Electron Forge instala.
- `samples/` contém dados reais de fornecedores e está no `.gitignore`.
