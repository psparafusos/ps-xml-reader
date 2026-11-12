// Ponte da tela do leitor genérico de XML (bloco do leitor em src/preload.ts).
interface Window {
  psLeitorXml: import('./tipos').PsLeitorXmlApi;
}

// Imagem importada como endereço (o Vite copia o arquivo e devolve a URL).
declare module '*.svg?url' {
  const url: string;
  export default url;
}
