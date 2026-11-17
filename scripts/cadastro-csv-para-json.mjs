#!/usr/bin/env node
// Converte o modelo de planilha do cadastro (uma planilha CSV por seção,
// separador ";", docs/modelo-cadastro) para o JSON do formato "Cadastro do
// sistema de gestão" (docs/formato-cadastro.md). Passa o resultado pelo
// mesmo validador do app e só grava se ele passar.
//
// Uso: node scripts/cadastro-csv-para-json.mjs <pasta com os CSV> <cadastro.json>
// Node 20 ou mais novo. Lê só a pasta indicada e grava só o arquivo de saída.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { moduloCadastro } from './modulos-cadastro.mjs';

const [pasta, saida] = process.argv.slice(2);
if (!pasta || !saida) {
  console.error(
    'Uso: node scripts/cadastro-csv-para-json.mjs <pasta com os CSV> <cadastro.json>',
  );
  process.exit(1);
}

const csv = await moduloCadastro('csv');
const formato = await moduloCadastro('formato');

const planilhas = {};
for (const nome of csv.PLANILHAS_CADASTRO) {
  const arquivo = join(pasta, `${nome}.csv`);
  if (existsSync(arquivo)) planilhas[nome] = readFileSync(arquivo, 'utf8');
}
if (Object.keys(planilhas).length === 0) {
  console.error(
    `Nenhuma planilha do cadastro em ${pasta} (meta.csv, fornecedores.csv, produtos.csv, vinculos.csv...).`,
  );
  process.exit(1);
}

const { dados, problemas } = csv.converterPlanilhas(planilhas);
if (problemas.length > 0) {
  console.error('As planilhas têm problemas; nada foi gravado:');
  for (const p of problemas) console.error(`- ${p}`);
  process.exit(2);
}
const r = formato.validarCadastro(dados);
if (!r.ok) {
  console.error('O resultado não segue o formato; nada foi gravado:');
  for (const e of r.erros) console.error(`- ${e}`);
  process.exit(2);
}

// Um registro por linha: o arquivo continua JSON válido e fica fácil de
// comparar duas extrações.
const secoes = Object.entries(dados).map(([nome, valor]) =>
  Array.isArray(valor)
    ? `${JSON.stringify(nome)}: [\n${valor.map((x) => JSON.stringify(x)).join(',\n')}\n]`
    : `${JSON.stringify(nome)}: ${JSON.stringify(valor)}`,
);
writeFileSync(saida, `{\n${secoes.join(',\n')}\n}\n`, 'utf8');

const q = r.relatorio.quantidades;
console.log(
  `Gravado ${saida}: ${q.fornecedores} fornecedores, ${q.produtos} produtos (${q.produtosAtivos} ativos), ${q.vinculos} vínculos, ${q.fatores} fatores, ${q.notasLancadas} notas lançadas.`,
);
if (r.relatorio.totalPontos > 0) {
  console.log(`${r.relatorio.totalPontos} pontos de atenção:`);
  for (const p of r.relatorio.pontos.slice(0, 30))
    console.log(`- ${p.onde}: ${p.motivo} (${p.valor})`);
}
for (const o of r.relatorio.observacoes) console.log(`Observação: ${o}`);
