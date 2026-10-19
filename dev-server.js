// Servidor local que imita a Vercel: serve public/ e roda as funções de api/.
// Uso: crie um .env (veja .env.example) e rode `npm run dev`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

if (existsSync('.env')) {
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
process.env.NODE_ENV = 'development';

const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const PORTA = Number(process.env.PORT) || 3000;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    const nome = url.pathname.slice(5).replace(/[^a-z-]/g, '');
    const arquivo = join(process.cwd(), 'api', nome + '.js');
    if (!existsSync(arquivo)) { res.statusCode = 404; return res.end('{}'); }
    let bruto = '';
    for await (const parte of req) bruto += parte;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = bruto ? JSON.parse(bruto) : {}; } catch { req.body = {}; }
    const { default: handler } = await import(arquivo);
    return handler(req, res);
  }

  const caminho = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const conteudo = await readFile(join(process.cwd(), 'public', caminho));
    res.setHeader('Content-Type', TIPOS[extname(caminho)] || 'application/octet-stream');
    res.end(conteudo);
  } catch {
    res.statusCode = 404;
    res.end('Não encontrado');
  }
}).listen(PORTA, () => console.log(`Painel em http://localhost:${PORTA}`));
