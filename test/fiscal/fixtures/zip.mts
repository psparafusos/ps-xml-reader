// Só para os testes: monta .zip e .xlsx mínimos na memória.
import { crc32, deflateRawSync } from 'node:zlib';

/** Monta um .zip mínimo: um arquivo deflate e outro guardado (método 0). */
export function zip(arquivos: Record<string, string>): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let pos = 0;
  Object.entries(arquivos).forEach(([nome, texto], i) => {
    const dados = Buffer.from(texto, 'utf8');
    const metodo = i % 2 === 0 ? 8 : 0;
    const corpo = metodo === 8 ? deflateRawSync(dados) : dados;
    const n = Buffer.from(nome, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc32(dados), 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc32(dados), 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(pos, 42);
    locais.push(local, n, corpo);
    centrais.push(central, n);
    pos += local.length + n.length + corpo.length;
  });
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...locais, diretorio, fim]));
}
