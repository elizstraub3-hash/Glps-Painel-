import { createHmac, timingSafeEqual } from 'node:crypto';
import { AsaasError } from './asaas.js';

const COOKIE = 'sessao';
const DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas

function assinar(valor) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) throw new AsaasError('SESSION_SECRET não configurado no servidor.', 500);
  return createHmac('sha256', segredo).update(valor).digest('hex');
}

function iguais(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function lerCookie(req, nome) {
  const header = req.headers.cookie || '';
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function senhaConfere(senha) {
  const correta = process.env.PAINEL_SENHA;
  if (!correta) throw new AsaasError('PAINEL_SENHA não configurada no servidor.', 500);
  return iguais(senha || '', correta);
}

export function criarSessao(res) {
  const expira = String(Date.now() + DURACAO_MS);
  const token = `${expira}.${assinar(expira)}`;
  const seguro = process.env.NODE_ENV === 'development' ? '' : ' Secure;';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly;${seguro} SameSite=Strict; Max-Age=${DURACAO_MS / 1000}`);
}

export function encerrarSessao(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function sessaoValida(req) {
  const token = lerCookie(req, COOKIE);
  if (!token) return false;
  const [expira, assinatura] = token.split('.');
  if (!expira || !assinatura || Number(expira) < Date.now()) return false;
  try { return iguais(assinatura, assinar(expira)); } catch { return false; }
}

export function enviar(res, status, dados) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(dados));
}

// Envolve um handler: exige login (salvo `publico`), trata erros e só aceita os métodos listados.
export function rota(metodos, handler, { publico = false } = {}) {
  return async (req, res) => {
    try {
      if (!metodos.includes(req.method)) return enviar(res, 405, { erro: 'Método não permitido.' });
      if (!publico && !sessaoValida(req)) return enviar(res, 401, { erro: 'Faça login novamente.' });
      await handler(req, res);
    } catch (e) {
      const status = e instanceof AsaasError ? e.status : 500;
      if (!(e instanceof AsaasError)) console.error(e);
      enviar(res, status, { erro: e instanceof AsaasError ? e.message : 'Erro interno.' });
    }
  };
}

export function corpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}
