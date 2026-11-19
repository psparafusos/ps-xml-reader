// NF-e INVENTADAS para as colunas fiscais da Conferência (dados fictícios,
// sem valor fiscal): usadas pelo npm test (test/catalogo.test.mts) e pelo
// test:janela (colunasFiscais.cjs), que grava os arquivos na pasta
// temporária dele. Nada aqui vem de nota real.
'use strict';

/** Grupos de imposto de exemplo, um por tipo de tributação. */
const ICMS = {
  icms00: (vBC, p, v) =>
    `<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${vBC}</vBC><pICMS>${p}</pICMS><vICMS>${v}</vICMS></ICMS00></ICMS>`,
  icms00Fcp: (vBC, p, v) =>
    `<ICMS><ICMS00><orig>1</orig><CST>00</CST><modBC>3</modBC><vBC>${vBC}</vBC><pICMS>${p}</pICMS><vICMS>${v}</vICMS><pFCP>2.00</pFCP><vFCP>1.00</vFCP></ICMS00></ICMS>`,
  icms10: () =>
    `<ICMS><ICMS10><orig>0</orig><CST>10</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>12.00</pICMS><vICMS>12.00</vICMS><modBCST>4</modBCST><pMVAST>40.00</pMVAST><vBCST>140.00</vBCST><pICMSST>18.00</pICMSST><vICMSST>13.20</vICMSST><vBCFCPST>140.00</vBCFCPST><pFCPST>2.00</pFCPST><vFCPST>2.80</vFCPST></ICMS10></ICMS>`,
  icms20: () =>
    `<ICMS><ICMS20><orig>0</orig><CST>20</CST><modBC>3</modBC><pRedBC>33.33</pRedBC><vBC>66.67</vBC><pICMS>12.00</pICMS><vICMS>8.00</vICMS></ICMS20></ICMS>`,
  icms60: () =>
    `<ICMS><ICMS60><orig>0</orig><CST>60</CST><vBCSTRet>120.00</vBCSTRet><pST>18.00</pST><vICMSSubstituto>12.00</vICMSSubstituto><vICMSSTRet>9.60</vICMSSTRet></ICMS60></ICMS>`,
  icms90: () =>
    `<ICMS><ICMS90><orig>2</orig><CST>90</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>4.00</pICMS><vICMS>4.00</vICMS></ICMS90></ICMS>`,
  sn101: () =>
    `<ICMS><ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>2.56</pCredSN><vCredICMSSN>2.56</vCredICMSSN></ICMSSN101></ICMS>`,
  sn102: () =>
    `<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>`,
};

const IPI = {
  trib: (vBC, p, v) =>
    `<IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>${vBC}</vBC><pIPI>${p}</pIPI><vIPI>${v}</vIPI></IPITrib></IPI>`,
  nt: () => `<IPI><cEnq>999</cEnq><IPINT><CST>53</CST></IPINT></IPI>`,
};

const PIS_COFINS = `<PIS><PISAliq><CST>01</CST><vBC>100.00</vBC><pPIS>1.65</pPIS><vPIS>1.65</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vBC>100.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>7.60</vCOFINS></COFINSAliq></COFINS>`;

const ICMS_UF_DEST = `<ICMSUFDest><vBCUFDest>100.00</vBCUFDest><vBCFCPUFDest>100.00</vBCFCPUFDest><pFCPUFDest>2.00</pFCPUFDest><pICMSUFDest>18.00</pICMSUFDest><pICMSInter>12.00</pICMSInter><pICMSInterPart>100.00</pICMSInterPart><vFCPUFDest>2.00</vFCPUFDest><vICMSUFDest>6.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet></ICMSUFDest>`;

const IBS_CBS = `<IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>100.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.10</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.10</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>0.90</vCBS></gCBS></gIBSCBS></IBSCBS>`;

const RASTRO = `<rastro><nLote>L-0001</nLote><qLote>10.000</qLote><dFab>2026-01-15</dFab><dVal>2028-01-15</dVal></rastro><rastro><nLote>L-0002</nLote><qLote>5.000</qLote><dFab>2026-02-10</dFab><dVal>2028-02-10</dVal></rastro>`;

/**
 * Um det. `prodExtra` entra no fim de prod (antes do fechamento), `imposto`
 * é o conteúdo de <imposto>, `fim` vem depois de </imposto>.
 */
function det(n, { cProd, xProd, vProd, prodExtra = '', imposto, fim = '' }) {
  return `<det nItem="${n}"><prod><cProd>${cProd}</cProd><cEAN>SEM GTIN</cEAN><xProd>${xProd}</xProd><NCM>73181500</NCM><CFOP>6102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>${vProd}</vUnCom><vProd>${vProd}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>CX</uTrib><qTrib>0.5000</qTrib><vUnTrib>${vProd}</vUnTrib><indTot>1</indTot>${prodExtra}</prod><imposto>${imposto}</imposto>${fim}</det>`;
}

/** A NF-e inteira com estes dets (o número entra na chave inventada). */
function nfe(numero, dets, comentario) {
  const n = String(numero).padStart(9, '0');
  const chave = `282611${'0'.repeat(14)}55001${n}1${n.slice(1)}0`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${comentario}
     NF-e INVENTADA para os testes (dados fictícios, sem valor fiscal). -->
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide><cUF>28</cUF><cNF>${n.slice(1)}</cNF><natOp>Venda de teste</natOp><mod>55</mod><serie>1</serie><nNF>${numero}</nNF><dhEmi>2026-11-18T10:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>2</idDest><tpEmis>1</tpEmis><tpAmb>2</tpAmb><finNFe>1</finNFe></ide>
      <emit><CNPJ>00000000000000</CNPJ><xNome>Fornecedor Inventado de Teste</xNome><enderEmit><xLgr>Rua de Teste</xLgr><nro>1</nro><xBairro>Centro</xBairro><xMun>Sao Paulo</xMun><UF>SP</UF><CEP>00000000</CEP></enderEmit><IE>000000000</IE></emit>
      <dest><CNPJ>12345678000195</CNPJ><xNome>Destinatario Inventado</xNome><enderDest><xLgr>Rua Destino</xLgr><nro>2</nro><xBairro>Centro</xBairro><xMun>Aracaju</xMun><UF>SE</UF><CEP>00000000</CEP></enderDest><IE>000000000</IE></dest>
      ${dets.join('\n      ')}
      <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vST>0.00</vST><vProd>0.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vIPI>0.00</vIPI><vOutro>0.00</vOutro><vNF>0.00</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete></transp>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>2026-11-18T10:01:00-03:00</dhRecbto><nProt>0000000000${n.slice(4)}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;
}

/**
 * Nota com um item de cada tributação (catálogo e Conferência): ICMS00 a
 * 12% e a 4%, ICMS10, ICMS20, ICMS60, ICMS90, Simples (101 e 102), IPI
 * tributado e não tributado, item sem IPI, ICMSUFDest, rastro, IBS/CBS e
 * um campo inventado fora do catálogo (nomeDoCachorro, dentro de prod).
 */
function notaVariada() {
  return nfe(
    2001,
    [
      det(1, {
        cProd: 'V01',
        xProd: 'PARAFUSO A 12 POR CENTO',
        vProd: '100.00',
        imposto:
          ICMS.icms00('100.00', '12.00', '12.00') +
          IPI.trib('100.00', '5.00', '5.00') +
          PIS_COFINS,
      }),
      det(2, {
        cProd: 'V02',
        xProd: 'PORCA A 4 POR CENTO IMPORTADA',
        vProd: '50.00',
        imposto: ICMS.icms00Fcp('50.00', '4.00', '2.00') + IPI.nt(),
      }),
      det(3, {
        cProd: 'V03',
        xProd: 'ARRUELA COM ST',
        vProd: '100.00',
        imposto: ICMS.icms10() + IPI.trib('100.00', '10.00', '10.00'),
      }),
      det(4, {
        cProd: 'V04',
        xProd: 'BROCA COM REDUCAO DE BASE',
        vProd: '100.00',
        imposto: ICMS.icms20(),
      }),
      det(5, {
        cProd: 'V05',
        xProd: 'DISCO COM ST RETIDA',
        vProd: '100.00',
        imposto: ICMS.icms60(),
      }),
      det(6, {
        cProd: 'V06',
        xProd: 'FITA OUTRAS TRIBUTACOES',
        vProd: '100.00',
        imposto: ICMS.icms90() + ICMS_UF_DEST,
      }),
      det(7, {
        cProd: 'V07',
        xProd: 'LUVA DO SIMPLES COM CREDITO',
        vProd: '100.00',
        imposto: ICMS.sn101(),
      }),
      det(8, {
        cProd: 'V08',
        xProd: 'OCULOS DO SIMPLES COM RASTRO',
        vProd: '100.00',
        prodExtra: RASTRO,
        imposto: ICMS.sn102(),
      }),
      det(9, {
        cProd: 'V09',
        xProd: 'TRAVA COM IBS E CBS',
        vProd: '100.00',
        prodExtra: '<nomeDoCachorro>Rex</nomeDoCachorro>',
        imposto: ICMS.icms00('100.00', '12.00', '12.00') + IBS_CBS,
        fim: '<infAdProd>Item com campo inventado</infAdProd><vItem>100.00</vItem>',
      }),
    ],
    'Colunas fiscais: um item de cada tributação e um campo inventado.',
  );
}

/**
 * Nota de 25 itens com muitas colunas fiscais: alíquota de ICMS 12% e 4%
 * alternadas, IPI em parte dos itens, ST e FCP em outros.
 */
function nota25Itens() {
  const dets = [];
  for (let n = 1; n <= 25; n++) {
    const doze = n % 2 === 1;
    const v = (10 + n).toFixed(2);
    const icms = (((10 + n) * (doze ? 12 : 4)) / 100).toFixed(2);
    let imposto = ICMS.icms00(v, doze ? '12.00' : '4.00', icms);
    if (n % 5 === 0) imposto = ICMS.icms10();
    if (n % 3 === 0)
      imposto += IPI.trib(v, '6.50', ((10 + n) * 0.065).toFixed(2));
    imposto += PIS_COFINS;
    dets.push(
      det(n, {
        cProd: `M${String(n).padStart(3, '0')}`,
        xProd: `ITEM INVENTADO NUMERO ${n} COM DESCRICAO LONGA DE TESTE`,
        vProd: v,
        prodExtra:
          n % 4 === 0 ? '<vDesc>1.00</vDesc><vFrete>2.00</vFrete>' : '',
        imposto,
      }),
    );
  }
  return nfe(2002, dets, 'Colunas fiscais: 25 itens, ICMS a 12% e a 4%.');
}

/** Nota do Simples sem alíquota de ICMS nem IPI (as colunas somem). */
function notaSemAliquota() {
  return nfe(
    2003,
    [1, 2, 3].map((n) =>
      det(n, {
        cProd: `S0${n}`,
        xProd: `PRODUTO DO SIMPLES ${n}`,
        vProd: '20.00',
        imposto: ICMS.sn102(),
      }),
    ),
    'Colunas fiscais: Simples Nacional, sem pICMS e sem IPI.',
  );
}

module.exports = { notaVariada, nota25Itens, notaSemAliquota };
