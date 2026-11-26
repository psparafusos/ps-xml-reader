# Histórico de mudanças

O que mudou em cada versão do PS Reader, da mais nova para a mais antiga.
O detalhe de cada mudança está no [manual](docs/manual.md) e nas mensagens
de commit (`git log`).

## Versão 1.2.13

- **Coluna Código da casa** na Conferência: com o cadastro do sistema de
  gestão carregado, cada item mostra o produto da loja, a descrição curta e
  o fator ("12 UN por CX"), com um ícone de confiança em que a cor diz o
  que fazer: verde, nada a conferir; amarelo, conferir a sugestão; vermelho
  (círculo sem barras, sem sugestão ou com mais de um produto), escolher.
  As barras dizem o quanto bateu.
- Código da casa pelo código de barras do produto, sem vínculo do
  fornecedor, passa a ser confiança alta; NCM diferente, unidade do fator
  diferente da nota ou custo fora do padrão deixam a sugestão em média.
- Quadro de escolha do Código da casa: o item da nota, as sugestões do app
  com o motivo, a busca no cadastro, "Nenhum (vincular no sistema de
  gestão)" e o fator, que dá para mudar.
- Toda escolha do Código da casa fica lembrada por fornecedor e aparece em
  Configurações, Decisões lembradas, com o tipo Código da casa.
- O painel da Conferência mostra "Código da casa: N de M itens definidos",
  e o clique leva ao próximo item que precisa de você.
- O `.psxml` guarda o Código da casa de cada item; cópias antigas abrem
  normalmente. No PDF e na impressão a coluna sai como texto.
- Ao carregar o primeiro cadastro, o app pergunta uma vez se a coluna
  Código da casa entra no perfil ativo.
- A gravação das decisões lembradas tenta de novo quando o Windows recusa
  por um instante (arquivo aberto pelo antivírus ou pela indexação).
- **DANFE em contingência**: a NF-e emitida em FS-IA, FS-DA, EPEC, SCAN,
  SVC-AN ou SVC-RS passa a ter DANFE, com os campos e as expressões que o
  manual da NF-e pede para cada caso.
- DACTE e DANFSe mostram o nome do município pela tabela do IBGE quando o
  XML traz só o código, sem internet.
- A instalação tira do "Abrir com" do `.xml` e do `.psxml` o instalador e o
  executável de versões antigas.
- Só a área do documento rola: a barra de título, a barra preta, as abas e
  os painéis ficam parados em qualquer zoom.
- Ctrl + roda e a pinça do touchpad aproximam no ponto embaixo do cursor;
  Ctrl +, Ctrl - e Ctrl+0 mantêm o centro da parte à vista.
- Barras de rolagem novas na área do documento: finas em repouso, mais
  grossas com o mouse em cima, com polegar arrastável e clique no trilho.
- Nota de outra empresa: um cartão de aviso no painel Leitura no lugar da
  janela que abria por cima da nota.
- Nota emitida pela própria loja: cartão de informação e a linha "Nota
  emitida pela loja" na Conferência, em vez do alerta de outra empresa.
- Ferramenta ST, MVA e CFOP: o NCM bater com a planilha não basta para o
  "Sim"; é preciso o CEST da linha ou ST retida na nota, senão o item vai
  para Confirmar.
- Ferramenta ST, MVA e CFOP: o lápis **Mudar** em todo item deixa a pessoa
  trocar a decisão do app, que fica lembrada como "decisão da pessoa".
- O aviso "Letra reduzida para N pt" da miniatura da folha não quebra mais
  uma palavra por linha.
- A mensagem "a pasta de rede não respondeu" só aparece para caminho de
  rede (`\\servidor\...` ou unidade mapeada de rede); arquivo no disco do
  computador não tem mais o prazo de 2 segundos.
- As imagens do README usam uma nota com datas fixas e só mudam quando a
  tela muda.
- Textos da tela corrigidos: o cartão do cadastro diz que ele alimenta a
  coluna Código da casa, e as contagens de um saem no singular ("Nenhuma
  decisão lembrada", "1 sem CFOP (precisa de você) fica como está").
- README novo, mais curto, com imagens; o texto detalhado foi para o
  manual (`docs/manual.md`) e o histórico para este arquivo.

## Versão 1.2.12

- O editor de colunas oferece todos os campos de item da NF-e, agrupados,
  com busca por nome, tag e sigla e o filtro "Só os campos desta nota".
- Coluna ligada cujo campo não existe na nota some da tabela e do PDF e
  volta na próxima nota que tiver o campo.
- Campos que o app não conhece aparecem em "Outros campos do XML".
- Padrão novo com Alíq. IPI e Alíq. ICMS ao lado dos valores; perfis
  gravados não mudam.
- Números ordenam como número e datas como data.

## Versão 1.2.11

- **Documentos fiscais**: o modo Documento da aba XML mostra o DACTE do
  CT-e, o DANFSe da NFS-e Nacional e ABRASF, o DANFE NFC-e e os eventos da
  NF-e (carta de correção, cancelamento e outros).
- Imprimir e Salvar PDF nesses documentos, com a mesma pasta de destino e
  as mesmas perguntas da NF-e, e nome de arquivo no padrão do app.
- NF-e dos leiautes 1.10 e 2.00 abrem com a data de emissão.
- NF-e gravada com BOM UTF-8 abre como nota, e não no leitor de XML.
- **Cadastro do sistema de gestão**: cartão novo nos Documentos de
  referência para carregar o cadastro da loja num formato aberto (JSON ou
  planilha CSV convertida), com o relatório da leitura.
- Tela de boas-vindas na primeira abertura, que pede o CNPJ da loja.
- O CNPJ da loja deixa de vir no app: sem CNPJ gravado, a verificação de
  nota de outra empresa não roda.
- Telas e textos sem nome de nenhum sistema de gestão.
- Projeto aberto, com licença MIT.

## Versão 1.2.10

- Rascunho contínuo das anotações: com alteração não salva, a nota é
  guardada sozinha, e ao abrir o app depois de um fechamento inesperado
  aparece a opção de recuperar, descartar ou decidir depois.

## Versão 1.2.9

- A janela pode ficar mais estreita, até 680 px, para caber ao lado de
  outro programa numa tela de 1366; a barra da nota fica numa linha só e
  os botões viram só ícone quando falta espaço.
- Tamanho salvo abaixo do mínimo sobe para o mínimo sem perder a posição.

## Versão 1.2.8

- Antes de excluir um perfil, substituir por importação ou restaurar o
  padrão, o app guarda uma cópia do perfil em `perfis-excluidos`, que volta
  pelo Importar.
- Importar e exportar perfis mais claros: o caminho do arquivo exportado
  aparece com Abrir pasta, e a importação com nome repetido oferece
  Importar como cópia.
- Renomear perfil com os botões de confirmar e cancelar; o Aplicar grava o
  nome que está sendo editado.
- Painel da Conferência: linha do frete (CIF ou FOB e como lançar).
- Painel da Conferência: vencimentos escritos nas informações
  complementares, quando a nota não tem duplicatas.
- Painel da Conferência: lembrete na nota de devolução para não deixar o
  preço de venda virar custo no sistema de gestão.
- Títulos curtos nas linhas do frete e da devolução, com a explicação no
  detalhe.
- Ferramenta ST: reconhece "não destinados ao uso automotivo" nas
  informações da nota.
- Gravação mais segura do `config.json`: arquivo temporário, cópia `.bak`,
  recuperação dos perfis e gravação garantida mesmo com o arquivo aberto
  por outro programa.
- Ícone novo dos arquivos `.xml` no Explorer, legível nos tamanhos
  pequenos.

## Versão 1.2.7

- **Abas PSXML e XML**: a Conferência numa aba e o arquivo original na
  outra, com o painel Leitura (modo de leitura, folhas do DANFE e dados do
  arquivo).
- Modo **Formato original** da aba XML: o XML montado em seções, tabelas e
  pares rótulo e valor, com busca em todas as linhas.
- Barra de título própria e barra preta nova, com os menus do Salvar e do
  perfil.
- Sai a leitura protegida; cada perfil escolhe em **NF-e abre em** se o XML
  abre no DANFE ou na Conferência.
- Finalidade **Devolução de cliente** na ferramenta ST, MVA e CFOP, e a
  linha "Nota de devolução" no painel.
- "Ao imprimir e no PDF": a miniatura da folha no painel da Conferência.
- Lado a lado fica apagado quando o DANFE tem uma folha só.
- Barra de rolagem fina por cima do conteúdo, sem a faixa da barra nativa.
- Animação das abas PSXML e XML (sem movimento com as animações desligadas
  no Windows).
- Ícones próprios dos arquivos `.xml` e `.psxml` no Explorer.

## Versão 1.2.6

- XML abre direto: NF-e no DANFE, `.psxml` na Conferência, sem a tela "Como
  deseja abrir a nota?"; com uma nota aberta, o arquivo novo vai para uma
  janela nova.
- XML que não é NF-e abre no leitor de XML (Árvore e Texto, com busca).
- XML grande e planilhas são lidos num processo à parte, com andamento e
  Cancelar.
- O PS Reader aparece no "Abrir com" do `.xml`, sem mudar o programa
  padrão.
- Leitura protegida da NF-e, com a opção por perfil (retirada na 1.2.7).
- DANFE indisponível explicado num diálogo do app.
- Barra da nota em dois grupos e X no canto das janelas grandes; a página
  de baixo não rola nem pula com uma janela aberta por cima.
- Ferramenta ST: aviso de outras linhas da planilha com o mesmo começo de
  NCM e da frase "não é da linha automotiva" nas informações da nota.
- Segurança: a tela carrega pelo protocolo próprio do app, que só serve os
  arquivos do próprio app.

## Versão 1.2.5

- **Seleção de texto**: a interface (botões, títulos, rótulos, menus, dicas
  e diálogos) não é selecionável; os dados são (campos e itens da nota e do
  DANFE, caminhos e nomes de arquivo, versão e vigência dos documentos, erros
  e avisos, relatórios, explicação da ST e tabelas das Configurações).
  Ctrl+A na tela da nota seleciona só a nota. PDF e impressão sem mudança.
- **Segurança, etapa 1**:
  - Zip preguiçoso: o leitor de `.xlsx` lê só o diretório central e
    descomprime cada parte quando ela é pedida, conferindo o tamanho
    declarado antes e depois.
  - Navegação, quadros, janelas novas e `<webview>` bloqueados em toda
    página.
  - O app instalado sai antes de abrir janela quando recebe opções perigosas
    (`--remote-debugging-port`, `--remote-debugging-pipe`, `--inspect`,
    `--js-flags`, `--user-data-dir`).
  - Os canais entre a janela e o processo principal só atendem o quadro
    principal da página do app.
  - Arquivo solto (linha de comando, duplo clique) conferido: só arquivo
    comum, sem link, pasta ou caminho de dispositivo.
  - Pasta de rede que não responde: prazo de 2 s; quando a pessoa pede para
    abrir, aparece a mensagem "a pasta de rede não respondeu em 2 segundos".
    As checagens de fundo usam o mesmo prazo, em silêncio.
  - Os dados dos documentos de referência são conferidos campo a campo ao
    serem lidos do disco.
  - `npm run test:janela`: o app numa janela oculta com NF-e inventadas de
    ataque; o texto delas tem de aparecer literal.
- **Leitor de XML genérico**: o motor (decodificação, leitor próprio sem
  DTD, árvore compacta e busca) já está pronto e testado, ainda sem tela.
- oxfmt 0.78.0 (só na máquina de desenvolvimento; muda só a formatação).

## Versão 1.2.4

- **Configurações**: a engrenagem na faixa preta (tela inicial e tela da
  nota) abre as Configurações dentro da janela, com seis abas: **Geral**,
  **Perfis e colunas**, **Ferramentas**, **Documentos de referência**,
  **Decisões lembradas** e **Dados do app** (veja Configurações).
- **Ferramentas por perfil**: ordem, mostrar ou ocultar cada ferramenta do
  painel e os campos do rodapé da "ST, MVA e CFOP". Campo oculto não é
  gravado no Aplicar.
- **Decisões lembradas** em aba própria, com busca, filtro por tipo e apagar
  uma ou as selecionadas.
- **Backup** (`.psbackup`): exportar e importar a configuração, os perfis,
  as ferramentas, as preferências e as decisões lembradas.
- As pastilhas **ST** e **TIPI** abrem a aba Documentos das Configurações já
  no cartão do documento, com o foco nele.
- **Acabamento visual**: ícones de estado iguais em todo o app (check verde,
  i cinza, triângulo amarelo, x vermelho); painel recolhido vira dois botões
  flutuantes (abrir e o selo da situação); botão **Rodar** preto; títulos
  dos blocos da nota em negrito; planilha de ST importada sem os protocolos
  aparece em aviso ("Reimportar"); palavra comprida da descrição quebra
  dentro da coluna (na tela até 3 linhas, inteira ao clicar; no PDF
  inteira); parcela vencida diz "Falar com o fornecedor" uma vez só.

## Versão 1.2.3 (hotfix de segurança)

- Electron 44.9.1 para 44.10.2 (correções de segurança do Chromium).
- NF-e e `.psxml` com `<!DOCTYPE` ou `<!ENTITY` são recusados antes de
  qualquer leitura, na janela e no processo principal.
- Tamanho conferido antes de ler: NF-e e `.psxml` acima de 50 MB são
  recusados.
- Leitor de `.xlsx` com limites (64 MB por parte, 200 MB no total, 2.000
  partes, células dentro dos limites do Excel); a planilha só é lida depois
  de medida (até 30 MB).
- Verificação online e **Atualizar** não seguem redirecionamento; a página
  do CONFAZ é lida até 5 MB.
- Permissões do navegador negadas; sandbox, `webSecurity` e ferramentas de
  desenvolvedor configurados de forma explícita.

## Versão 1.2.2

- **Documentos de referência com estados visíveis**: na tela inicial, uma
  linha por documento com o ícone do estado (ok, aviso, faltando, opcional),
  versão, vigência e a ação ao lado (**Carregar** ou **Atualizar**). Versão
  nova achada pela verificação online mostra "v0020 disponível"; o
  **Atualizar** baixa só do CONFAZ e do gov.br, lê numa pasta temporária e
  só troca o documento se a leitura passar.
- **Apêndice XIV** lido do arquivo real do CONFAZ (aba única, apêndices
  empilhados), com versão, UF e vigência; recusa o arquivo sem o apêndice ou
  de outra UF. Na ferramenta, o "Sim" pergunta se o lubrificante é derivado
  ou não derivado de petróleo.
- **Ferramenta ST, MVA e CFOP**: explicação montada com a TIPI, as linhas
  candidatas e a nota; "Sem ST" já marcado quando nada combina; opção
  **Outro** (CFOP manual, com motivo obrigatório); sugestão **Pelo
  histórico** das decisões no mesmo NCM; comparação da MVA do fornecedor
  com a da planilha; dicas nos cabeçalhos e botões.
- **Fim da MVA-ST 2**: em Autopeças vale só a MVA-ST 1 (a loja não tem
  índice de fidelização). Decisões lembradas com a MVA-ST 2 passam a usar a
  MVA-ST 1.
- **Pasta de destino na faixa preta**: a pastilha "Salvando em" (ou
  "Escolha onde salvar") substitui o cartão da tela inicial e os botões da
  barra da nota.
- Aviso de erro de documento com **X** para fechar, que volta ao estado de
  antes da tentativa.
- `npm start` não perde mais a tela inicial com a recarga do servidor de
  desenvolvimento.

## Versão 1.2.1

- **Visual Bancada em todas as telas e janelas**: a barra da nota vai para a
  faixa preta com filete amarelo (logo, emitente, número, pastilhas ST e
  TIPI e perfil); painel de conferência como cartão; uma família de botões e
  um conjunto único de ícones. O PDF e o DANFE não mudam.
- **Lubrificantes do Apêndice XIV** (Ato COTEPE/ICMS 61/19): terceiro
  documento de referência, opcional. Com ele carregado, NCM 2710 e 3403 fora
  da planilha de ST vira "confirmar" na ferramenta, com a escolha lembrada
  por fornecedor e produto.

## Versão 1.2.0

- **Visual "Bancada"**: tela inicial nova (faixa preta com a logo e as
  pastilhas de ST, TIPI e perfil, zona de soltar, cartões da pasta de
  destino e dos documentos) e o mesmo acabamento no resto do app: fundo
  bege, cartões brancos, pastilhas, títulos de seção e botões das janelas
  (primário amarelo, secundário branco, perigo vermelho). O PDF e a
  impressão não mudam.
- **Notas recentes** na tela inicial: as últimas 8 notas abertas ou salvas,
  com a situação (em conferência, conferida ou alerta) e o último acesso.
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
