// Tabela de municípios do IBGE embutida (src/docfiscal/municipiosIbge.ts) e
// o nome do município no DACTE e no DANFSe quando o XML só traz o código,
// com o CT-e e a NFS-e inventados sem nome de município
// (test/janela/fixtures/d08 e d09).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DOMParserMinimo } from '../apoioDom.mts';
import {
  nomeMunicipioIbge,
  totalMunicipiosIbge,
} from '../../src/docfiscal/municipiosIbge.ts';
import { lerCte } from '../../src/docfiscal/dacte.ts';
import { lerNfseAbrasf, lerNfseNacional } from '../../src/docfiscal/nfse.ts';
import type { ElementoXml } from '../../src/docfiscal/tipo.ts';

const fixture = (nome: string) =>
  readFileSync(new URL(`../janela/fixtures/${nome}`, import.meta.url), 'utf8');
const raiz = (xml: string) =>
  new DOMParserMinimo().parseFromString(xml).documentElement as ElementoXml;

describe('tabela de municípios do IBGE', () => {
  it('2800308 é Aracaju', () => {
    assert.equal(nomeMunicipioIbge('2800308'), 'Aracaju');
  });

  it('a DTB 2025 inteira: 5571 municípios, de 1100015 a 5300108', () => {
    assert.equal(totalMunicipiosIbge(), 5571);
    assert.equal(nomeMunicipioIbge('1100015'), "Alta Floresta D'Oeste");
    assert.equal(nomeMunicipioIbge('3550308'), 'São Paulo');
    assert.equal(nomeMunicipioIbge('4209102'), 'Joinville');
    assert.equal(nomeMunicipioIbge('5300108'), 'Brasília');
  });

  it('código fora da tabela ou fora do formato: vazio', () => {
    assert.equal(nomeMunicipioIbge('2899999'), '');
    assert.equal(nomeMunicipioIbge('280030'), '');
    assert.equal(nomeMunicipioIbge(''), '');
    assert.equal(nomeMunicipioIbge('28003O8'), '');
    assert.equal(nomeMunicipioIbge(' 2800308 '), 'Aracaju');
  });
});

describe('DACTE: CT-e sem nome de município', () => {
  const d = lerCte(raiz(fixture('d08-cte-sem-municipio.xml')));

  it('início, término e as partes saem com o nome da tabela', () => {
    assert.equal(d.inicio, 'Joinville - SC');
    assert.equal(d.termino, 'Aracaju - SE');
    assert.equal(d.emitente.municipio, 'Joinville');
    assert.equal(d.remetente?.municipio, 'Joinville');
    assert.equal(d.destinatario?.municipio, 'Aracaju');
  });

  it('com o nome no XML, vale o do XML', () => {
    const c = lerCte(raiz(fixture('d03-cte.xml')));
    assert.equal(c.inicio, 'JOINVILLE - SC');
    assert.equal(c.destinatario?.municipio, 'ARACAJU');
  });
});

describe('DANFSe: NFS-e sem nome de município', () => {
  it('Nacional: emissor, prestador, tomador, local e incidência pela tabela', () => {
    const d = lerNfseNacional(raiz(fixture('d09-nfse-sem-municipio.xml')));
    assert.equal(d.municipioEmissor, 'Município: Aracaju / SE');
    assert.equal(d.prestador.municipio, 'Aracaju / SE');
    assert.equal(d.tomador?.municipio, 'São Paulo / SP');
    assert.equal(d.servico.local, 'Aracaju / SE / BR');
    assert.equal(d.issqn?.incidencia, 'Aracaju / SE / BR');
  });

  it('ABRASF: só código no XML, nome pela tabela; fora dela, "IBGE nnnnnnn"', () => {
    const xml = fixture('d01-nfse-abrasf.xml');
    const d = lerNfseAbrasf(raiz(xml));
    assert.equal(d.prestador.municipio, 'Aracaju / SE');
    const fora = lerNfseAbrasf(
      raiz(
        xml.replaceAll('<CodigoMunicipio>2800308', '<CodigoMunicipio>2899999'),
      ),
    );
    assert.equal(fora.prestador.municipio, 'IBGE 2899999 / SE');
  });
});
