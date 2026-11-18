// QR Code sem biblioteca (src/docfiscal/qrcode.ts): valores conhecidos da
// norma e uma leitura de volta (formato, máscara, zigue-zague, blocos,
// Reed-Solomon e modo byte), independente do desenho.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MASCARAS,
  bitsFormato,
  bitsVersao,
  correcao,
  estruturaBlocos,
  gerarQrCode,
  mapaFixo,
  modulosDeDados,
  palavrasDeDados,
  posicoesAlinhamento,
  type QrCode,
} from '../../src/docfiscal/qrcode.ts';

/** Lê o QR Code de volta: devolve o texto ou lança erro se algo não confere. */
function lerDeVolta(q: QrCode): string {
  const t = q.tamanho;
  const m = q.modulos;
  // Formato: primeira cópia, em volta do localizador de cima à esquerda.
  let formato = 0;
  const pos: [number, number][] = [];
  for (let i = 0; i <= 5; i++) pos.push([8, i]);
  pos.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) pos.push([14 - i, 8]);
  pos.forEach(([x, y], i) => {
    if (m[y][x]) formato |= 1 << i;
  });
  assert.equal(formato, bitsFormato(q.nivel, q.mascara), 'formato');
  // Segunda cópia igual à primeira.
  let segunda = 0;
  for (let i = 0; i < 8; i++) if (m[8][t - 1 - i]) segunda |= 1 << i;
  for (let i = 8; i < 15; i++) if (m[t - 15 + i][8]) segunda |= 1 << i;
  assert.equal(segunda, formato, 'segunda cópia do formato');
  assert.equal(m[t - 8][8], true, 'módulo escuro');

  const fixo = mapaFixo(q.versao);
  const bits: number[] = [];
  for (let direita = t - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let v = 0; v < t; v++)
      for (let j = 0; j < 2; j++) {
        const x = direita - j;
        const y = ((direita + 1) & 2) === 0 ? t - 1 - v : v;
        if (fixo[y][x]) continue;
        bits.push(m[y][x] !== MASCARAS[q.mascara](x, y) ? 1 : 0);
      }
  }
  const palavras: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    palavras.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  assert.equal(palavras.length, Math.floor(modulosDeDados(q.versao) / 8));

  const { blocos, grau, dadosCurto, curtos } = estruturaBlocos(
    q.versao,
    q.nivel,
  );
  const dados: number[][] = Array.from({ length: blocos }, () => []);
  const ecc: number[][] = Array.from({ length: blocos }, () => []);
  let k = 0;
  for (let p = 0; p < dadosCurto + 1; p++)
    for (let b = 0; b < blocos; b++) {
      if (p === dadosCurto && b < curtos) continue;
      dados[b].push(palavras[k++]);
    }
  for (let p = 0; p < grau; p++)
    for (let b = 0; b < blocos; b++) ecc[b].push(palavras[k++]);
  dados.forEach((d, b) =>
    assert.deepEqual(correcao(d, grau), ecc[b], `Reed-Solomon do bloco ${b}`),
  );
  const todos = dados.flat();
  assert.equal(todos.length, palavrasDeDados(q.versao, q.nivel));
  const fluxo = todos.flatMap((w) =>
    Array.from({ length: 8 }, (_, i) => (w >>> (7 - i)) & 1),
  );
  let c = 0;
  const ler = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | fluxo[c++];
    return v;
  };
  assert.equal(ler(4), 0b0100, 'modo byte');
  const n = ler(q.versao <= 9 ? 8 : 16);
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = ler(8);
  return new TextDecoder().decode(bytes);
}

describe('QR Code: valores da norma', () => {
  it('Reed-Solomon do exemplo HELLO WORLD 1-M', () => {
    const dados = [
      32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
    ];
    assert.deepEqual(
      correcao(dados, 10),
      [196, 35, 39, 119, 235, 215, 231, 226, 93, 23],
    );
  });

  it('bits de formato da tabela da norma', () => {
    assert.equal(bitsFormato('L', 0), 0b111011111000100);
    assert.equal(bitsFormato('M', 0), 0b101010000010010);
    assert.equal(bitsFormato('M', 5), 0b100000011001110);
    assert.equal(bitsFormato('L', 7), 0b110100101110110);
  });

  it('bits de versão da 7', () => {
    assert.equal(bitsVersao(7), 0x07c94);
  });

  it('capacidades conhecidas', () => {
    assert.equal(palavrasDeDados(1, 'M'), 16);
    assert.equal(palavrasDeDados(40, 'L'), 2956);
    assert.equal(palavrasDeDados(40, 'M'), 2334);
    assert.equal(palavrasDeDados(40, 'H'), 1276);
    assert.equal(modulosDeDados(1), 208);
  });

  it('alinhamento das versões 2, 7 e 32', () => {
    assert.deepEqual(posicoesAlinhamento(2), [6, 18]);
    assert.deepEqual(posicoesAlinhamento(7), [6, 22, 38]);
    assert.deepEqual(posicoesAlinhamento(32), [6, 34, 60, 86, 112, 138]);
  });
});

describe('QR Code: lido de volta', () => {
  const casos = [
    'A',
    'https://www.exemplo.gov.br/consulta?chave=12345678901234567890123456789012345678901234',
    // Texto de QR Code de NFC-e inventado (versão 2 da NT, com hash).
    `https://www.sefaz.uf.gov.br/nfce/qrcode?p=${'1'.repeat(44)}|2|1|1|${'A'.repeat(40)}`,
    'ação ç é ü € 日本',
    'x'.repeat(300),
    'y'.repeat(1200),
  ];
  for (const texto of casos)
    for (const nivel of ['L', 'M', 'Q', 'H'] as const)
      it(`${texto.length} caracteres, nível ${nivel}`, () => {
        const q = gerarQrCode(texto, nivel);
        assert.equal(q.tamanho, q.versao * 4 + 17);
        assert.equal(lerDeVolta(q), texto);
      });

  it('todas as máscaras leem de volta', () => {
    for (let m = 0; m < 8; m++)
      assert.equal(lerDeVolta(gerarQrCode('máscara', 'M', m)), 'máscara');
  });

  it('localizadores nos três cantos', () => {
    const q = gerarQrCode('canto');
    const t = q.tamanho;
    for (const [x, y] of [
      [0, 0],
      [t - 7, 0],
      [0, t - 7],
    ]) {
      assert.equal(q.modulos[y][x], true);
      assert.equal(q.modulos[y + 3][x + 3], true);
      assert.equal(q.modulos[y + 1][x + 1], false);
    }
  });

  it('texto grande demais: erro', () => {
    assert.throws(() => gerarQrCode('z'.repeat(3000), 'M'));
  });
});
