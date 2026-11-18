# Formato "Cadastro do sistema de gestão", versão 1

Arquivo que a loja exporta do próprio sistema de gestão para o PS Reader
sugerir, em cada item da NF-e de compra, o produto do cadastro da loja
(código da casa), o fator de conversão da unidade de compra e os avisos
(nota já lançada, produto inativo, código reaproveitado, custo fora do
padrão).

O app só conhece este formato genérico. Cada loja gera o arquivo a partir do
seu sistema, com uma consulta, um relatório ou uma planilha; o app nunca lê
as tabelas de um sistema específico. Quem não tem como gerar JSON preenche o
modelo de planilha (CSV) e converte (veja [Modelo de planilha](#modelo-de-planilha-csv)).

O validador fica em `src/cadastro/formato.ts`, a conversão das planilhas em
`src/cadastro/csv.ts`.

## Regras gerais

- Um arquivo JSON em UTF-8 (com ou sem BOM), com um objeto de seis seções:
  `meta`, `fornecedores`, `produtos`, `vinculos`, `fatores` e
  `notas_lancadas`. As quatro primeiras são obrigatórias; `fatores` e
  `notas_lancadas` são opcionais (sem elas, o app não sugere o fator e não
  avisa nota já lançada).
- Nomes de campo em português, sem acento, em minúsculas com `_`.
- Texto como texto, número como número, sim ou não como `true` ou `false`,
  data como texto `AAAA-MM-DD`. Campo opcional pode faltar ou vir `null`;
  texto opcional vazio conta como `null`.
- **Códigos são texto.** O código do produto no fornecedor (`codigo_fornecedor`)
  tem de vir entre aspas, exatamente como sai na nota: `"009381"` e `"9381"`
  são códigos diferentes, e um número perderia os zeros à esquerda. O código
  da casa (`codigo`, `produto`) também é texto; um número inteiro é aceito e
  lido como texto.
- CNPJ (14 dígitos) ou CPF (11 dígitos) só com os dígitos, como texto.
- As seções se ligam pelo CNPJ ou CPF do fornecedor e pelo código da casa:
  `vinculos.fornecedor` e `fatores.fornecedor` com `fornecedores.cnpj_cpf`;
  `vinculos.produto` e `fatores.produto` com `produtos.codigo`.
- Campos e seções a mais são tolerados: ficam de fora e aparecem nas
  observações do relatório da leitura. Assim um sistema pode exportar mais
  do que o formato pede sem quebrar a importação.
- Tamanho máximo: 30 MB, o mesmo das planilhas de referência. Um cadastro
  real de cerca de 14 mil produtos, 27 mil vínculos, 24 mil fatores e 28 mil
  notas ocupa cerca de 17 MB.

## meta

| Campo         | Tipo   | Obrigatório | Conteúdo                                                             |
| ------------- | ------ | ----------- | -------------------------------------------------------------------- |
| `versao`      | número | sim         | sempre `1` nesta versão do formato                                   |
| `origem`      | texto  | sim         | nome livre da origem: o sistema, a loja, o jeito de extrair          |
| `extraido_em` | texto  | sim         | data da extração, `AAAA-MM-DD` ou `AAAA-MM-DDTHH:MM:SS` (hora local) |

A data da extração aparece no cartão do documento: o cadastro é uma
fotografia, e notas lançadas depois dela não estão em `notas_lancadas`.

## fornecedores

Quem emite nota para a loja: fornecedores e também clientes que emitem nota
de devolução. Cada CNPJ (cada filial) é um registro.

| Campo      | Tipo           | Obrigatório | Conteúdo                                  |
| ---------- | -------------- | ----------- | ----------------------------------------- |
| `cnpj_cpf` | texto          | sim         | CNPJ (14 dígitos) ou CPF (11), só dígitos |
| `nome`     | texto          | sim         | nome no cadastro                          |
| `ativo`    | `true`/`false` | sim         | cadastro ativo                            |

## produtos

Todos os produtos, ativos e inativos: um vínculo antigo pode apontar para
um produto inativo, e o app avisa em vez de esconder.

| Campo              | Tipo           | Obrigatório | Conteúdo                                                             |
| ------------------ | -------------- | ----------- | -------------------------------------------------------------------- |
| `codigo`           | texto          | sim         | código da casa (único na seção)                                      |
| `descricao`        | texto          | sim         | descrição do produto                                                 |
| `unidade`          | texto          | sim         | unidade de venda (e de estoque)                                      |
| `codigo_barras`    | texto          | não         | código de barras (EAN/GTIN)                                          |
| `referencia`       | texto          | não         | referência do fabricante ou da loja                                  |
| `ncm`              | texto          | não         | NCM com 8 dígitos                                                    |
| `ativo`            | `true`/`false` | sim         | produto ativo                                                        |
| `custo`            | número         | não         | custo por unidade de venda                                           |
| `preco`            | número         | não         | preço de venda                                                       |
| `reaproveitado_em` | texto          | não         | data (`AAAA-MM-DD`) em que o código passou a ser de outra mercadoria |

`reaproveitado_em` existe porque há sistemas em que o código de um produto
parado é reaproveitado para outra mercadoria: vínculos e fatores de antes
dessa data podem ser da mercadoria antiga.

## vinculos

O código do produto no fornecedor para o código da casa: o que o sistema
grava quando alguém lança a nota e liga o item ao produto.

| Campo               | Tipo  | Obrigatório | Conteúdo                                                     |
| ------------------- | ----- | ----------- | ------------------------------------------------------------ |
| `fornecedor`        | texto | sim         | CNPJ ou CPF do fornecedor dono do código                     |
| `codigo_fornecedor` | texto | sim         | código do produto no fornecedor, como veio na nota (`cProd`) |
| `produto`           | texto | sim         | código da casa                                               |

O mesmo `codigo_fornecedor` pode aparecer mais de uma vez no mesmo
fornecedor apontando para produtos diferentes: o app mostra os candidatos
como ambíguos, sem escolher.

Se o sistema grava alguns vínculos com o código de barras do item (o `cEAN`
da nota) em vez do `cProd`, exporte como está: o app também procura o `cEAN`
entre os códigos dos vínculos (caminhos (d) e (f) em
[Como o app sugere o produto](#como-o-app-sugere-o-produto)).

## fatores (opcional)

O fator de conversão por fornecedor e produto: quantas unidades de venda há
em uma unidade de compra.

| Campo            | Tipo   | Obrigatório | Conteúdo                                            |
| ---------------- | ------ | ----------- | --------------------------------------------------- |
| `fornecedor`     | texto  | sim         | CNPJ ou CPF                                         |
| `produto`        | texto  | sim         | código da casa                                      |
| `unidade_compra` | texto  | sim         | unidade da nota (`uCom`) a que o fator se refere    |
| `fator`          | número | sim         | maior que zero (pode ser menor que 1)               |
| `ultima_entrada` | texto  | não         | data da última entrada com esse fator, `AAAA-MM-DD` |

Pode haver mais de um registro para o mesmo fornecedor e produto, um por
unidade de compra.

## notas_lancadas (opcional)

Notas que já entraram no sistema, para o aviso "nota já lançada".

| Campo     | Tipo  | Obrigatório | Conteúdo                                 |
| --------- | ----- | ----------- | ---------------------------------------- |
| `chave`   | texto | sim         | chave de acesso, 44 dígitos              |
| `entrada` | texto | não         | data da entrada no sistema, `AAAA-MM-DD` |

Chave repetida é contada uma vez só.

## O que o validador recusa

O arquivo inteiro é recusado, e o documento carregado antes continua valendo,
quando:

- não é um JSON válido (a mensagem traz o erro do leitor);
- não é um objeto, ou não tem nenhuma das seções obrigatórias;
- falta uma das seções `meta`, `fornecedores`, `produtos` ou `vinculos`;
- uma seção não é lista (ou `meta` não é objeto), ou um registro não é objeto;
- `meta.versao` não é `1`, `meta.origem` está vazio ou `meta.extraido_em` não
  é uma data válida;
- um campo obrigatório falta ou tem outro tipo: `ativo` que não é
  `true`/`false` (por exemplo `"S"`), CNPJ com máscara ou com outro número de
  dígitos, `codigo_fornecedor` em número, `fator` zero ou negativo, `custo`
  negativo, data que não existe (`2026-02-30`), chave sem 44 dígitos;
- a seção `produtos` fica vazia.

A mensagem diz o que falhou e onde, com o registro contado a partir de 1:
`produtos, registro 4: ativo é obrigatório e deve ser true ou false (veio "S").`
Aparecem até 20 erros; acima disso, a contagem.

## O que é aceito com ressalva

O arquivo é aceito e o problema vai para o relatório da leitura (selo
amarelo no cartão):

- código de produto repetido: fica o primeiro;
- vínculo ou fator para um produto que não está em `produtos`: fica de fora;
- NCM que não tem 8 dígitos: o valor fica de fora, o produto entra.

E vão para as observações, sem mudar o selo: CNPJ em `vinculos` ou `fatores`
que não está em `fornecedores` (usado assim mesmo), vínculos e chaves
repetidos iguais, seções e campos a mais, e a falta das seções opcionais.

## Como o app sugere o produto

O motor fica em `src/cadastro/casamento.ts`. Para cada item da NF-e ele
recebe o CNPJ (ou CPF) do emitente e, do item, `cProd`, `cEAN`, `xProd`,
`NCM`, `uCom` e, se houver, `vUnCom`. Tenta os caminhos nesta ordem; o
primeiro que acha algum produto decide:

| Caminho                             | O que compara                                                                                                            | Confiança |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| (a) vínculo exato do emitente       | `cProd` com `codigo_fornecedor` dos vínculos do CNPJ do emitente, sem diferenciar maiúsculas e sem os espaços das pontas | alta      |
| (b) vínculo exato da raiz           | o mesmo, nos outros CNPJs com a mesma raiz (8 primeiros dígitos): as filiais                                             | média     |
| (c) código normalizado, no emitente | `cProd` e `codigo_fornecedor` sem espaços em nenhuma posição e sem zeros à esquerda                                      | média     |
| (c) código normalizado, na raiz     | o mesmo, nas filiais                                                                                                     | baixa     |
| (d) cEAN nos vínculos do emitente   | `cEAN` da nota contra os `codigo_fornecedor` com cara de GTIN dos vínculos do emitente                                   | alta      |
| (e) cEAN                            | `cEAN` da nota contra `codigo_barras` dos produtos                                                                       | média     |
| (f) cEAN nos vínculos da raiz       | o mesmo do (d), nas filiais                                                                                              | média     |
| (g) cProd com cara de EAN           | `cProd` só com dígitos e 8, 12, 13 ou 14 posições contra `codigo_barras`                                                 | baixa     |

- Códigos de barras são comparados sem os zeros à esquerda: o GTIN-14
  `07890000004022` casa com o EAN-13 `7890000004022`. `SEM GTIN` e valores
  que não são GTIN nunca casam.
- Os caminhos (d) e (f) existem porque há sistemas que, ao lançar a nota,
  gravam o vínculo com o código de barras do item (o `cEAN`) em vez do
  código do fornecedor (o `cProd`). São vínculos que a loja gravou para
  aquele fornecedor, só que pelo GTIN. No emitente têm a confiança do
  vínculo exato (alta) e vêm antes do código de barras do produto, que não
  diz de que fornecedor é. Nas filiais têm a confiança da filial (média) e
  vêm depois do código de barras, porque um vínculo antigo de filial pode
  apontar para outro produto com o mesmo GTIN.
- CPF não tem raiz: só os caminhos (a), (c) e (d) no próprio emitente, e os
  de código de barras.
- **Ambíguo**: mais de um produto no caminho que decidiu. O app mostra a
  lista de candidatos (com o ativo marcado) e não sugere nenhum. Acontece com
  o mesmo código em filiais apontando para produtos diferentes, com códigos
  que só diferem por zeros (`009381` e `9381`, quando a nota traz `09381`),
  com o mesmo código gravado duas vezes no fornecedor e com o código de
  barras repetido em dois produtos (ou o mesmo GTIN gravado como vínculo de
  dois produtos).
- **Rebaixamento**: a confiança cai um nível (alta para média, média para
  baixa) quando o produto está inativo e quando o código foi reaproveitado
  (`reaproveitado_em`) sem compra do fornecedor depois disso (pela
  `ultima_entrada` do fator).

**Fator.** Entre os fatores do emitente e das filiais para o produto
sugerido, vale primeiro o da mesma unidade da nota (`unidade_compra` igual a
`uCom`), depois o do próprio emitente, depois o da entrada mais recente. O
app diz quando o fator é de uma filial e avisa quando a unidade do fator não
é a da nota.

**Avisos** de cada item: produto inativo; código reaproveitado sem compra
depois; NCM do cadastro diferente do da nota; unidade do fator diferente da
da nota; custo fora do padrão (o `vUnCom` levado à unidade de venda pelo
fator, ou direto quando a unidade é a mesma, mais de 30% acima ou abaixo do
`custo` do cadastro; limite provisório, a calibrar com notas reais); e, nos
ambíguos, quando só um candidato está ativo.

**Nota já lançada**: a chave de acesso está em `notas_lancadas` (com a data
da entrada, se veio).

## Exemplo

Inventado, com o mínimo de cada seção:

```json
{
  "meta": {
    "versao": 1,
    "origem": "Sistema da loja, exportação manual",
    "extraido_em": "2026-11-14T12:30:00"
  },
  "fornecedores": [
    {
      "cnpj_cpf": "12345678000195",
      "nome": "Distribuidora Exemplo (matriz)",
      "ativo": true
    },
    {
      "cnpj_cpf": "12345678000276",
      "nome": "Distribuidora Exemplo (filial)",
      "ativo": true
    }
  ],
  "produtos": [
    {
      "codigo": "1001",
      "descricao": "PARAFUSO SEXTAVADO 1/4 X 2 ZINCADO",
      "unidade": "UN",
      "codigo_barras": "7890000010019",
      "referencia": "PSX-14-2",
      "ncm": "73181500",
      "ativo": true,
      "custo": 0.42,
      "preco": 0.9
    },
    {
      "codigo": "1002",
      "descricao": "BUCHA DE NYLON 8 MM",
      "unidade": "UN",
      "ncm": "39269090",
      "ativo": false
    }
  ],
  "vinculos": [
    {
      "fornecedor": "12345678000195",
      "codigo_fornecedor": "00450",
      "produto": "1001"
    },
    {
      "fornecedor": "12345678000276",
      "codigo_fornecedor": "BN-8",
      "produto": "1002"
    }
  ],
  "fatores": [
    {
      "fornecedor": "12345678000195",
      "produto": "1001",
      "unidade_compra": "CX",
      "fator": 100,
      "ultima_entrada": "2026-10-20"
    }
  ],
  "notas_lancadas": [
    {
      "chave": "28261012345678000195550010000012341000012347",
      "entrada": "2026-10-21"
    }
  ]
}
```

O primeiro produto tem um vínculo na matriz e o fator da caixa com 100
unidades; o segundo está inativo e só tem vínculo na filial.

## Modelo de planilha (CSV)

Para quem não tem como exportar JSON: o modelo fica em
[`docs/modelo-cadastro/`](modelo-cadastro/), uma planilha por seção, com o
cabeçalho e as linhas do exemplo acima:

| Arquivo              | Obrigatório | Colunas                                                                                    |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `meta.csv`           | sim         | `versao;origem;extraido_em` (uma linha de valores)                                         |
| `fornecedores.csv`   | sim         | `cnpj_cpf;nome;ativo`                                                                      |
| `produtos.csv`       | sim         | `codigo;descricao;unidade;codigo_barras;referencia;ncm;ativo;custo;preco;reaproveitado_em` |
| `vinculos.csv`       | sim         | `fornecedor;codigo_fornecedor;produto`                                                     |
| `fatores.csv`        | não         | `fornecedor;produto;unidade_compra;fator;ultima_entrada`                                   |
| `notas_lancadas.csv` | não         | `chave;entrada`                                                                            |

Regras das planilhas:

- separador `;`, UTF-8 (o Excel grava assim em "CSV UTF-8"), primeira linha
  com os nomes das colunas iguais aos do JSON, em qualquer ordem;
- célula com `;`, aspas ou quebra de linha vai entre aspas, com as aspas de
  dentro dobradas (`"PARAFUSO 1/4"" X 2"`);
- colunas opcionais podem ficar vazias ou nem existir; colunas a mais são
  levadas como campos extras (ignorados).

Converter:

```
node scripts/cadastro-csv-para-json.mjs <pasta com os CSV> <cadastro.json>
```

O script lê as planilhas da pasta, converte, passa o resultado pelo mesmo
validador do app e só grava o JSON se ele passar. Na conversão, célula a
célula:

| Coluna                              | Na planilha                                             | No JSON                |
| ----------------------------------- | ------------------------------------------------------- | ---------------------- |
| qualquer                            | vazia                                                   | campo ausente (`null`) |
| `ativo`                             | `S`, `Sim`, `1`, `X`, `true` / `N`, `Não`, `0`, `false` | `true` / `false`       |
| `versao`, `custo`, `preco`, `fator` | `12,5`, `1.234,56` ou `12.5`                            | número                 |
| `cnpj_cpf`, `fornecedor`            | `12.345.678/0001-95`                                    | `"12345678000195"`     |
| `chave`                             | com espaços                                             | só os dígitos          |
| datas                               | `14/11/2026` ou `2026-11-14`                            | `"2026-11-14"`         |
| `extraido_em`                       | `14/11/2026 12:30`                                      | `"2026-11-14T12:30"`   |
| códigos e textos                    | como estão                                              | texto, sem mudar nada  |

Os erros do validador citam o registro: o registro 4 de uma seção é a linha
5 da planilha (a linha 1 é o cabeçalho).

Cuidado com o Excel ao abrir e salvar a planilha: ele tira os zeros à
esquerda de códigos que parecem número (`00450` vira `450`) e escreve
CNPJ e código de barras em notação científica. Formate essas colunas como
texto antes de colar os dados, ou gere o CSV direto do sistema.
