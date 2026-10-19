// Cliente mínimo da API v3 do Asaas — https://docs.asaas.com
const URLS = {
  producao: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
};

export class AsaasError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function baseUrl() {
  if (process.env.ASAAS_URL) return process.env.ASAAS_URL; // usado em testes locais
  return process.env.ASAAS_AMBIENTE === 'producao' ? URLS.producao : URLS.sandbox;
}

export async function asaas(path, { method = 'GET', body, query } = {}) {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new AsaasError('ASAAS_API_KEY não configurada no servidor.', 500);

  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: {
      access_token: key,
      'Content-Type': 'application/json',
      'User-Agent': 'painel-boletos',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }

  if (!res.ok) {
    const msg = json?.errors?.map(e => e.description).join(' ') || `Asaas respondeu ${res.status}.`;
    throw new AsaasError(msg, res.status === 401 ? 502 : res.status);
  }
  return json;
}
