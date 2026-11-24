# Como contribuir

O PS Reader é um app genérico de conferência de NF-e: serve a qualquer loja
que recebe notas e confere antes de lançar no seu sistema de gestão. Toda
contribuição precisa manter isso.

## Regras

- **Nenhum sistema de gestão específico no código.** Telas, textos, testes,
  comentários e documentação falam em "sistema de gestão", nunca no nome de
  um produto ou de um fornecedor de sistema, nem em termos que só um deles
  usa.
- **Dados e regras de um sistema vão para formatos genéricos documentados.**
  Se um sistema precisa de um arquivo num certo formato, ou de uma regra
  própria, o app oferece um formato aberto e descrito em `docs/` (por exemplo,
  um perfil exportado em JSON), e cada loja ajusta do lado dela.
- **Nada fixo de uma loja.** CNPJ, pastas, nomes de perfil e preferências
  ficam na configuração de quem usa (pasta de dados do app), nunca no código.
- **Notas reais nunca entram no repositório.** Nem XML, nem PDF, nem
  captura de tela com dados de uma nota de verdade.
- **Testes com dados inventados.** Notas, fornecedores, produtos e CNPJs dos
  testes são inventados (CNPJ com dígitos verificadores válidos, mas sem
  ligação com uma empresa real).

## Antes de abrir um pull request

```bash
npm run typecheck
npm run lint
npm test
npm run test:janela
```

O `test:janela` empacota o app e roda os testes de tela numa janela oculta,
com uma pasta de dados temporária que é apagada no fim.
