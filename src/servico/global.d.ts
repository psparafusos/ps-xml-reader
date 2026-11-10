// Ponte do cartão de andamento do serviço de leitura pesada (bloco do
// serviço em src/preload.ts).
interface Window {
  psServico: import('./ponte').PsServicoApi;
}
