// Ponte do aviso de configuração recuperada (bloco do config.json seguro em
// src/preload.ts).
interface Window {
  psConfigSeguro: import('./configSeguro').PsConfigSeguroApi;
}
