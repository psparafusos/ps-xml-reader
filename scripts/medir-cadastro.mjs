#!/usr/bin/env node
// Medidor do cadastro: roda o motor de casamento (src/cadastro/casamento.ts)
// sobre uma pasta de NF-e com um cadastro no formato "Cadastro do sistema
// de gestão" e diz quanto ele sugere, por qual caminho e, com um gabarito
// (o que a loja lançou de verdade), quanto acerta.
//
// Uso: node scripts/medir-cadastro.mjs <pasta de XMLs> <cadastro.json> [gabarito.csv]
//
// Grava medicao.md e nao-casados.csv na pasta atual. Node 20 ou mais novo,
// sem dependências para rodar (o motor é preparado pelo TypeScript do
// repositório na primeira vez, veja scripts/modulos-cadastro.mjs). Não usa
// rede nem área de transferência; lê só a pasta e os arquivos indicados.
// Formato do gabarito: docs/medidor-cadastro.md.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { moduloCadastro } from './modulos-cadastro.mjs';

const [pastaXml, arqCadastro, arqGabarito] = process.argv.slice(2);
if (!pastaXml || !arqCadastro) {
  console.error(
    'Uso: node scripts/medir-cadastro.mjs <pasta de XMLs> <cadastro.json> [gabarito.csv]',
  );
  process.exit(1);
}

const formato = await moduloCadastro('formato');
const motor = await moduloCadastro('casamento');
const csv = await moduloCadastro('csv');

// ---------- leitura das NF-e ----------

const ENTIDADES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
function textoXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (m, e) => {
      if (e[0] !== '#') return ENTIDADES[e.toLowerCase()] ?? m;
      const n =
        e[1].toLowerCase() === 'x'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    })
    .trim();
}

/** Todos os elementos `nome` (com ou sem prefixo) dentro de `xml`: atributos e conteúdo. */
function elementos(xml, nome) {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${nome}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nome}>`,
    'g',
  );
  return [...xml.matchAll(re)].map((m) => ({
    atributos: m[1] ?? '',
    conteudo: m[2],
  }));
}
const primeiro = (xml, nome) => elementos(xml, nome)[0] ?? null;
const valor = (xml, nome) => {
  const e = primeiro(xml, nome);
  return e ? textoXml(e.conteudo) : '';
};

function lerTexto(caminho) {
  const bytes = readFileSync(caminho);
  const cabeca = bytes.subarray(0, 200).toString('latin1');
  const cod =
    /encoding\s*=\s*["']([^"']+)/i.exec(cabeca)?.[1]?.toLowerCase() ?? 'utf-8';
  const texto = /8859|latin|1252/.test(cod)
    ? bytes.toString('latin1')
    : bytes.toString('utf8');
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** A NF-e do arquivo, ou null se não for NF-e com itens. */
function lerNfe(caminho) {
  let xml;
  try {
    xml = lerTexto(caminho);
  } catch {
    return null;
  }
  const inf = primeiro(xml, 'infNFe');
  if (!inf) return null;
  const chave =
    /Id\s*=\s*["']NFe(\d{44})["']/.exec(inf.atributos)?.[1] ??
    (valor(xml, 'chNFe') || null);
  const emit = primeiro(inf.conteudo, 'emit')?.conteudo ?? '';
  const ide = primeiro(inf.conteudo, 'ide')?.conteudo ?? '';
  const itens = elementos(inf.conteudo, 'det').map((det) => {
    const prod = primeiro(det.conteudo, 'prod')?.conteudo ?? '';
    const v = Number(valor(prod, 'vUnCom'));
    return {
      nItem: Number(
        /nItem\s*=\s*["'](\d+)["']/.exec(det.atributos)?.[1] ?? NaN,
      ),
      cProd: valor(prod, 'cProd'),
      cEAN: valor(prod, 'cEAN'),
      xProd: valor(prod, 'xProd'),
      NCM: valor(prod, 'NCM'),
      uCom: valor(prod, 'uCom'),
      vUnCom: Number.isFinite(v) && v > 0 ? v : null,
    };
  });
  if (itens.length === 0) return null;
  return {
    arquivo: relative(pastaXml, caminho) || basename(caminho),
    chave,
    cnpj: valor(emit, 'CNPJ') || null,
    cpf: valor(emit, 'CPF') || null,
    nome: valor(emit, 'xNome'),
    devolucao: valor(ide, 'finNFe') === '4',
    itens,
  };
}

function listarXml(pasta) {
  const saida = [];
  for (const nome of readdirSync(pasta)) {
    const c = join(pasta, nome);
    const s = statSync(c);
    if (s.isDirectory()) saida.push(...listarXml(c));
    else if (/\.xml$/i.test(nome)) saida.push(c);
  }
  return saida.sort();
}

// ---------- cadastro e gabarito ----------

const lido = formato.validarTextoCadastro(readFileSync(arqCadastro, 'utf8'));
if (!lido.ok) {
  console.error(`${arqCadastro} não segue o formato do cadastro:`);
  for (const e of lido.erros) console.error(`- ${e}`);
  process.exit(2);
}
const cadastro = lido.cadastro;
const indice = motor.prepararCadastro(cadastro);

/** chave -> nItem -> { codigo, fator } */
const gabarito = new Map();
let temFator = false;
if (arqGabarito) {
  const [cab, ...linhas] = csv.lerCsv(readFileSync(arqGabarito, 'utf8'));
  const col = (n) => (cab ?? []).findIndex((c) => c.trim().toLowerCase() === n);
  const [iChave, iItem, iCodigo, iFator] = [
    'chave',
    'item',
    'codigo',
    'fator',
  ].map(col);
  if (iChave < 0 || iItem < 0 || iCodigo < 0) {
    console.error(
      `${arqGabarito}: o cabeçalho precisa das colunas chave;item;codigo (fator é opcional).`,
    );
    process.exit(2);
  }
  temFator = iFator >= 0;
  linhas.forEach((l, i) => {
    const chave = (l[iChave] ?? '').replace(/\s/g, '');
    const item = Number(l[iItem]);
    const codigo = (l[iCodigo] ?? '').trim();
    if (!/^\d{44}$/.test(chave) || !Number.isInteger(item) || !codigo) {
      console.error(
        `${arqGabarito}, linha ${i + 2}: ignorada (chave com 44 dígitos, item e codigo são obrigatórios).`,
      );
      return;
    }
    const f = temFator
      ? Number(String(l[iFator] ?? '').replace(',', '.'))
      : NaN;
    if (!gabarito.has(chave)) gabarito.set(chave, new Map());
    gabarito
      .get(chave)
      .set(item, { codigo, fator: Number.isFinite(f) && f > 0 ? f : null });
  });
}

// ---------- medição ----------

const pct = (n, d) =>
  d ? `${((100 * n) / d).toFixed(1).replace('.', ',')}%` : '-';
const zeros = (lista) => Object.fromEntries(lista.map((k) => [k, 0]));

const m = {
  arquivos: 0,
  ignorados: 0,
  repetidas: 0,
  notas: 0,
  itens: 0,
  cpf: 0,
  devolucoes: 0,
  emitenteDesconhecido: 0,
  jaLancadas: 0,
  porCaminho: zeros(motor.CAMINHOS),
  semSugestao: 0,
  ambiguos: 0,
  ambiguosUmAtivo: 0,
  porConfianca: zeros(['alta', 'media', 'baixa']),
  avisos: {},
  comFator: 0,
  g: {
    notas: 0,
    itens: 0,
    semItemNoXml: 0,
    acertos: 0,
    erros: 0,
    ambiguoComCerto: 0,
    ambiguoSemCerto: 0,
    semSugestao: 0,
    porCaminho: Object.fromEntries(
      motor.CAMINHOS.map((k) => [k, { acertos: 0, erros: 0 }]),
    ),
    porConfianca: Object.fromEntries(
      ['alta', 'media', 'baixa'].map((k) => [k, { acertos: 0, erros: 0 }]),
    ),
    errosComAviso: 0,
    fatorIgual: 0,
    fatorDiferente: 0,
    fatorSem: 0,
    fatorDiferencas: [],
  },
};
const naoCasados = [];
const vistas = new Set();
const arquivos = listarXml(pastaXml);
m.arquivos = arquivos.length;

for (const caminho of arquivos) {
  const nota = lerNfe(caminho);
  if (!nota) {
    m.ignorados++;
    continue;
  }
  if (nota.chave && vistas.has(nota.chave)) {
    m.repetidas++;
    continue;
  }
  if (nota.chave) vistas.add(nota.chave);
  m.notas++;
  if (!nota.cnpj) m.cpf++;
  if (nota.devolucao) m.devolucoes++;
  const r = motor.sugerirNota(indice, {
    cnpjEmitente: nota.cnpj,
    cpfEmitente: nota.cpf,
    chave: nota.chave,
    itens: nota.itens,
  });
  if (!r.emitenteConhecido) m.emitenteDesconhecido++;
  if (r.notaLancada) m.jaLancadas++;
  const gNota = nota.chave ? gabarito.get(nota.chave) : undefined;
  if (gNota) {
    m.g.notas++;
    const nItens = new Set(nota.itens.map((i) => i.nItem));
    for (const k of gNota.keys()) if (!nItens.has(k)) m.g.semItemNoXml++;
  }

  nota.itens.forEach((item, i) => {
    const s = r.itens[i];
    m.itens++;
    if (s.caminho) m.porCaminho[s.caminho]++;
    else m.semSugestao++;
    if (s.ambiguo) {
      m.ambiguos++;
      if (s.candidatos.filter((c) => c.ativo).length === 1) m.ambiguosUmAtivo++;
    }
    if (s.codigo) m.porConfianca[s.confianca]++;
    if (s.fator) m.comFator++;
    for (const a of s.avisos) m.avisos[a.tipo] = (m.avisos[a.tipo] ?? 0) + 1;

    let situacao = s.codigo
      ? 'sugerido'
      : s.ambiguo
        ? 'ambíguo'
        : 'sem sugestão';
    const g = gNota?.get(item.nItem);
    if (g) {
      m.g.itens++;
      if (s.codigo === g.codigo) {
        situacao = 'acerto';
        m.g.acertos++;
        m.g.porCaminho[s.caminho].acertos++;
        m.g.porConfianca[s.confianca].acertos++;
      } else if (s.codigo) {
        situacao = 'erro';
        m.g.erros++;
        m.g.porCaminho[s.caminho].erros++;
        m.g.porConfianca[s.confianca].erros++;
        if (s.avisos.length > 0) m.g.errosComAviso++;
      } else if (s.ambiguo) {
        const dentro = s.candidatos.some((c) => c.codigo === g.codigo);
        situacao = dentro
          ? 'ambíguo (o certo está entre os candidatos)'
          : 'ambíguo (o certo não está entre os candidatos)';
        if (dentro) m.g.ambiguoComCerto++;
        else m.g.ambiguoSemCerto++;
      } else m.g.semSugestao++;
      if (temFator && s.codigo && g.fator !== null) {
        if (!s.fator) m.g.fatorSem++;
        else if (Math.abs(s.fator.fator - g.fator) < 1e-6) m.g.fatorIgual++;
        else {
          m.g.fatorDiferente++;
          m.g.fatorDiferencas.push(
            `${nota.arquivo} item ${item.nItem}: produto ${s.codigo}, fator sugerido ${s.fator.fator} (${s.fator.unidadeCompra}), lançado ${g.fator} (nota em ${item.uCom})`,
          );
        }
      }
    }
    if (!s.codigo || situacao === 'erro') {
      const produtoLancado = g ? indice.produtos.get(g.codigo) : undefined;
      naoCasados.push({
        arquivo: nota.arquivo,
        chave: nota.chave ?? '',
        emitente_cnpj_cpf: nota.cnpj ?? nota.cpf ?? '',
        emitente: nota.nome,
        nItem: item.nItem,
        cProd: item.cProd,
        cEAN: item.cEAN,
        xProd: item.xProd,
        NCM: item.NCM,
        uCom: item.uCom,
        situacao,
        caminho: s.caminho ? motor.ROTULO_CAMINHO[s.caminho] : '',
        sugerido: s.codigo ?? '',
        candidatos: s.candidatos
          .map((c) => `${c.codigo}${c.ativo ? '' : ' (inativo)'}`)
          .join('|'),
        avisos: s.avisos.map((a) => a.texto).join(' | '),
        lancado: g?.codigo ?? '',
        descricao_lancado: produtoLancado?.descricao ?? '',
      });
    }
  });
}

// ---------- relatório ----------

const L = [];
const linha = (...c) => L.push(`| ${c.join(' | ')} |`);
L.push('# Medição do cadastro', '');
L.push(
  `Gerada em ${new Date().toISOString().slice(0, 19).replace('T', ' ')} (UTC). Cadastro: ${cadastro.meta.origem}, extraído em ${cadastro.meta.extraidoEm}.`,
);
L.push(
  `Pasta lida: ${pastaXml}${arqGabarito ? `. Gabarito: ${basename(arqGabarito)}` : ''}.`,
  '',
);
L.push('## Visão geral', '', '| Medida | Valor |', '|---|---:|');
linha('Arquivos XML lidos', m.arquivos);
linha('Ignorados (não são NF-e com itens)', m.ignorados);
linha('Repetidos (mesma chave)', m.repetidas);
linha('Notas', m.notas);
linha('Itens', m.itens);
linha('Notas de devolução (finNFe 4)', m.devolucoes);
linha('Notas com emitente CPF', m.cpf);
linha(
  'Notas de emitente sem cadastro (nem o CNPJ nem a raiz)',
  m.emitenteDesconhecido,
);
linha('Notas já lançadas (chave em notas_lancadas)', m.jaLancadas);
L.push(
  '',
  '## Itens por caminho',
  '',
  '| Caminho | Itens | % dos itens |',
  '|---|---:|---:|',
);
for (const k of motor.CAMINHOS)
  linha(
    motor.ROTULO_CAMINHO[k],
    m.porCaminho[k],
    pct(m.porCaminho[k], m.itens),
  );
linha('sem sugestão', m.semSugestao, pct(m.semSugestao, m.itens));
L.push('');
L.push(
  `- Ambíguos (mais de um produto no caminho que decidiu): ${m.ambiguos} (${pct(m.ambiguos, m.itens)}); em ${m.ambiguosUmAtivo} deles só um candidato está ativo.`,
);
const sugeridos =
  m.porConfianca.alta + m.porConfianca.media + m.porConfianca.baixa;
L.push(
  `- Sugestão única: ${sugeridos} (${pct(sugeridos, m.itens)}); confiança alta ${m.porConfianca.alta}, média ${m.porConfianca.media}, baixa ${m.porConfianca.baixa}. Com fator conhecido: ${m.comFator}.`,
);
const NOMES_AVISO = {
  inativo: 'produto inativo',
  reaproveitado: 'código reaproveitado sem compra depois',
  'ambiguo-um-ativo': 'ambíguo com um só ativo',
  'ncm-diferente': 'NCM diferente',
  'unidade-diferente': 'unidade do fator diferente da nota',
  'custo-fora': 'custo fora do padrão',
};
const avisos = Object.entries(m.avisos);
L.push(
  `- Avisos: ${avisos.length ? avisos.map(([t, n]) => `${NOMES_AVISO[t] ?? t} ${n}`).join('; ') : 'nenhum'}.`,
);
L.push('', '## Contra o gabarito', '');
const g = m.g;
if (!arqGabarito) L.push('Sem gabarito.');
else if (!g.notas) L.push('Nenhuma nota da pasta está no gabarito.');
else {
  L.push('| Medida | Valor |', '|---|---:|');
  linha('Notas no gabarito', g.notas);
  linha('Itens comparados', g.itens);
  linha('Itens do gabarito sem item no XML', g.semItemNoXml);
  linha('Acertos', `${g.acertos} (${pct(g.acertos, g.itens)})`);
  linha(
    'Erros (sugeriu outro produto)',
    `${g.erros} (${pct(g.erros, g.itens)})`,
  );
  linha('Erros que vieram com aviso', g.errosComAviso);
  linha('Ambíguos com o certo entre os candidatos', g.ambiguoComCerto);
  linha('Ambíguos sem o certo', g.ambiguoSemCerto);
  linha('Sem sugestão', `${g.semSugestao} (${pct(g.semSugestao, g.itens)})`);
  L.push('', '| Caminho | Acertos | Erros |', '|---|---:|---:|');
  for (const k of motor.CAMINHOS)
    linha(
      motor.ROTULO_CAMINHO[k],
      g.porCaminho[k].acertos,
      g.porCaminho[k].erros,
    );
  L.push('', '| Confiança | Acertos | Erros |', '|---|---:|---:|');
  for (const k of ['alta', 'media', 'baixa'])
    linha(
      k === 'media' ? 'média' : k,
      g.porConfianca[k].acertos,
      g.porConfianca[k].erros,
    );
  if (temFator) {
    L.push('', '### Fator', '');
    L.push(
      `- Nos itens com sugestão certa ou errada e fator no gabarito: igual ${g.fatorIgual}, diferente ${g.fatorDiferente}, sem fator conhecido ${g.fatorSem}.`,
    );
    for (const d of g.fatorDiferencas.slice(0, 50)) L.push(`  - ${d}`);
    if (g.fatorDiferencas.length > 50)
      L.push(`  - ... e mais ${g.fatorDiferencas.length - 50}`);
  }
}
L.push(
  '',
  `Itens sem sugestão, ambíguos ou errados: ${naoCasados.length} linhas em nao-casados.csv.`,
);
const md = `${L.join('\n')}\n`;
writeFileSync('medicao.md', md, 'utf8');

const COLUNAS = [
  'arquivo',
  'chave',
  'emitente_cnpj_cpf',
  'emitente',
  'nItem',
  'cProd',
  'cEAN',
  'xProd',
  'NCM',
  'uCom',
  'situacao',
  'caminho',
  'sugerido',
  'candidatos',
  'avisos',
  'lancado',
  'descricao_lancado',
];
const celula = (v) => {
  const t = v == null ? '' : String(v);
  return /[;"\r\n]/.test(t) || /^\s|\s$/.test(t)
    ? `"${t.replace(/"/g, '""')}"`
    : t;
};
writeFileSync(
  'nao-casados.csv',
  `﻿${[COLUNAS.join(';'), ...naoCasados.map((r) => COLUNAS.map((c) => celula(r[c])).join(';'))].join('\r\n')}\r\n`,
  'utf8',
);

console.log(md);
console.log('Gravados medicao.md e nao-casados.csv na pasta atual.');
