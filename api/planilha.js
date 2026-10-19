import { AsaasError } from '../lib/asaas.js';
import { rota, enviar, corpo } from '../lib/http.js';

// A planilha fica num único documento JSON no Upstash Redis (Vercel → Storage → Upstash for Redis).
// Aceita os nomes de variável que a integração da Vercel cria e os do próprio Upstash.
const CHAVE = 'glps:planilha';
const LIMITE_BYTES = 900 * 1024;

function banco() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cfg, comando) {
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new AsaasError('Não foi possível acessar o banco da planilha.', 502);
  return json.result;
}

export default rota(['GET', 'PUT'], async (req, res) => {
  const cfg = banco();
  if (!cfg) return enviar(res, 200, { semBanco: true, dados: null });

  const atual = JSON.parse((await redis(cfg, ['GET', CHAVE])) || 'null');

  if (req.method === 'GET') return enviar(res, 200, { semBanco: false, dados: atual });

  const b = corpo(req);
  const dados = b.dados;
  if (!dados || !Array.isArray(dados.carros) || !Array.isArray(dados.recebimentos)) {
    throw new AsaasError('Planilha inválida.', 400);
  }
  // Evita sobrescrever alterações feitas em outro aparelho
  const versaoAtual = atual?.versao || 0;
  if ((Number(b.versaoBase) || 0) !== versaoAtual) {
    return enviar(res, 409, { erro: 'A planilha foi alterada em outro aparelho.', dados: atual });
  }
  const novo = { ...dados, versao: versaoAtual + 1, atualizadoEm: new Date().toISOString() };
  const texto = JSON.stringify(novo);
  if (Buffer.byteLength(texto) > LIMITE_BYTES) throw new AsaasError('A planilha ficou grande demais para salvar.', 413);

  await redis(cfg, ['SET', CHAVE, texto]);
  enviar(res, 200, { semBanco: false, dados: novo });
});
