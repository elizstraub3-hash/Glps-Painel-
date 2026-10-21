// Cliente mínimo da API Cobranças da Efí (ex-Gerencianet). Boletos não exigem certificado,
// só Client ID e Client Secret (Efí → API → Aplicações).
import { AsaasError as ErroCobranca } from './asaas.js';

const URLS = {
  producao: 'https://cobrancas.api.efipay.com.br',
  homologacao: 'https://cobrancas-h.api.efipay.com.br',
};

export const efiAtivo = () => !!(process.env.EFI_CLIENT_ID && process.env.EFI_CLIENT_SECRET);
export const efiAmbiente = () => (process.env.EFI_AMBIENTE === 'producao' ? 'producao' : 'homologacao');

function baseUrl() {
  return process.env.EFI_URL || URLS[efiAmbiente()]; // EFI_URL: só para testes locais
}

let token = null; // { valor, expira } reaproveitado enquanto a função estiver quente

async function autorizar() {
  if (token && token.expira > Date.now() + 60_000) return token.valor;
  const basic = Buffer.from(`${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(baseUrl() + '/v1/authorize', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new ErroCobranca('A Efí recusou as credenciais. Confira EFI_CLIENT_ID, EFI_CLIENT_SECRET e EFI_AMBIENTE.', 502);
  }
  token = { valor: json.access_token, expira: Date.now() + (json.expires_in || 600) * 1000 };
  return token.valor;
}

function mensagemErro(json, status) {
  const d = json?.error_description;
  if (typeof d === 'string') return d;
  if (d?.message) return d.property ? `${d.message} (${d.property})` : d.message;
  return `A Efí respondeu ${status}.`;
}

export async function efi(path, { method = 'GET', body } = {}) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: { Authorization: `Bearer ${await autorizar()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) token = null;
  if (!res.ok) throw new ErroCobranca(mensagemErro(json, res.status), res.status === 401 ? 502 : res.status);
  return json.data ?? json;
}

// Situações da Efí traduzidas para as mesmas usadas no painel (padrão Asaas)
export function statusPadrao(s) {
  if (['paid', 'settled', 'identified'].includes(s)) return 'RECEIVED';
  if (['unpaid', 'expired'].includes(s)) return 'OVERDUE';
  if (s === 'canceled') return 'DELETED';
  if (['refunded', 'contested'].includes(s)) return 'REFUNDED';
  return 'PENDING'; // new, waiting, link
}
