# Histórico de mudanças

O que mudou em cada versão do PS Reader, da mais nova para a mais antiga.
Este histórico ficava no README até a versão 1.2.13; o das versões a partir
da 1.2.6 está nas mensagens de commit (`git log`).

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
