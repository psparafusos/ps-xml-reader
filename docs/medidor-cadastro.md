# Medidor do cadastro

`scripts/medir-cadastro.mjs` roda o motor de casamento
(`src/cadastro/casamento.ts`, descrito em
[formato-cadastro.md](formato-cadastro.md#como-o-app-sugere-o-produto)) sobre
uma pasta de NF-e com um cadastro no formato "Cadastro do sistema de
gestão" e mede quanto ele sugere, por qual caminho e, com um gabarito,
quanto acerta. Serve para decidir, com notas reais da loja, o que a
Conferência vai mostrar.

```
node scripts/medir-cadastro.mjs <pasta de XMLs> <cadastro.json> [gabarito.csv]
```

- Node 20 ou mais novo, sem dependências para rodar. Na primeira vez (e
  sempre que `src/cadastro` mudar), o motor é convertido de TypeScript para
  JavaScript pelo TypeScript do próprio repositório e guardado em
  `node_modules/.cache/ps-reader-cadastro`; por isso o repositório precisa
  do `npm ci`.
- Lê a pasta (e as subpastas) e os dois arquivos indicados; não usa rede.
- Grava `medicao.md` e `nao-casados.csv` na pasta atual: rode de uma pasta
  de trabalho, fora do repositório.
- Arquivos que não são NF-e com itens são ignorados (e contados); a mesma
  chave em dois arquivos conta uma vez.
- O cadastro passa pelo mesmo validador do app: se for recusado, o medidor
  para e mostra os erros.

## O que sai

`medicao.md`:

- **Visão geral**: arquivos lidos, ignorados, repetidos, notas, itens,
  devoluções (`finNFe` 4), emitentes CPF, emitentes sem cadastro (nem o
  CNPJ nem a raiz) e notas já lançadas.
- **Itens por caminho**: quantos itens cada caminho decidiu, com o
  percentual sobre todos os itens, e os sem sugestão; ambíguos (e em
  quantos só um candidato está ativo); sugestões únicas por confiança;
  itens com fator conhecido; contagem de cada aviso.
- **Contra o gabarito** (só com o gabarito): acertos, erros (sugeriu outro
  produto), erros que vieram com algum aviso, ambíguos com e sem o produto
  certo entre os candidatos, sem sugestão; acertos e erros por caminho e por
  confiança; e, se o gabarito tiver a coluna `fator`, fator igual, diferente
  (com a lista) ou desconhecido.

`nao-casados.csv` (separador `;`, UTF-8 com BOM, abre direto no Excel): uma
linha por item sem sugestão, ambíguo ou errado, com o arquivo, a chave, o
emitente, os campos do item, a situação, o caminho, o sugerido, os
candidatos (os inativos marcados), os avisos e, com gabarito, o código
lançado e a descrição dele no cadastro.

## Gabarito

O que a loja lançou de verdade, item a item. Planilha CSV, separador `;`,
UTF-8, com cabeçalho:

| Coluna   | Obrigatória | Conteúdo                                                  |
| -------- | ----------- | --------------------------------------------------------- |
| `chave`  | sim         | chave de acesso da nota, 44 dígitos                       |
| `item`   | sim         | número do item na NF-e (`nItem` do `det`)                 |
| `codigo` | sim         | código da casa com que o item foi lançado                 |
| `fator`  | não         | fator de conversão usado no lançamento (vírgula ou ponto) |

As colunas podem vir em qualquer ordem; colunas a mais são ignoradas.
Linha sem chave de 44 dígitos, sem item ou sem código é ignorada com aviso
no terminal. Item que o sistema lançou mas não está no XML aparece em
"Itens do gabarito sem item no XML"; item do XML que não está no gabarito
fica fora da comparação.

Exemplo:

```
chave;item;codigo;fator
28261111111111000191550010000012011000012013;1;100;100
28261111111111000191550010000012011000012013;2;101;50
```

Cuidado com notas já lançadas: os vínculos e os fatores do cadastro podem
ter sido gravados pelo próprio lançamento da nota medida. Para notas assim
o acerto é otimista; a medida que vale é a de notas que ainda não entraram
no sistema na data da extração.

## Notas inventadas

`test/fixtures/cadastro/` tem um cadastro inventado (`cadastro.json`), seis
NF-e inventadas que cobrem os casos difíceis e o gabarito delas:

| Arquivo                    | Emitente                     | O que cobre                                                                                                                                                  |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nfe-1-alfa-matriz.xml`    | matriz da Ferragens Alfa     | vínculo exato (também em minúsculas e com espaço no fim), vínculo só na filial, cEAN, item sem nada que case; nota já lançada                                |
| `nfe-2-alfa-filial.xml`    | filial da Ferragens Alfa     | código próprio da filial, código que só a matriz tem (fator da matriz), custo fora do padrão, código da matriz com um zero na frente (c na raiz)             |
| `nfe-3-beta.xml`           | Parafusos Beta               | códigos que só diferem por zeros (exato, ambíguo e com zeros a menos), espaço no meio do código, produto inativo, unidade diferente da do fator              |
| `nfe-4-gama.xml`           | filial 3 da Ferramentas Gama | mesmo código nas filiais 1 e 2 para produtos diferentes, EAN repetido, GTIN-14 com zero na frente, cProd que é um EAN                                        |
| `nfe-5-delta-sem-gtin.xml` | Distribuidora Delta          | todos os itens SEM GTIN; código reaproveitado sem compra depois (o gabarito mostra o erro), reaproveitado com compra depois, NCM diferente, item sem vínculo |
| `nfe-6-devolucao.xml`      | cliente (fora do cadastro)   | devolução com NFref; o cProd é o próprio código da casa                                                                                                      |

```
node scripts/medir-cadastro.mjs test/fixtures/cadastro test/fixtures/cadastro/cadastro.json test/fixtures/cadastro/gabarito.csv
```
