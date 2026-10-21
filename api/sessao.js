import { efiAtivo, efiAmbiente } from '../lib/efi.js';
import { rota, enviar, corpo, senhaConfere, criarSessao, encerrarSessao, sessaoValida } from '../lib/http.js';

// GET: está logado? · POST: entrar · DELETE: sair
export default rota(['GET', 'POST', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') {
    // Com a Efí configurada, ela emite os boletos e o painel abre em Notas e boletos
    const provedor = efiAtivo() ? 'efi' : 'asaas';
    const ambiente = provedor === 'efi'
      ? (efiAmbiente() === 'producao' ? 'producao' : 'sandbox')
      : (process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox');
    return enviar(res, 200, { logado: sessaoValida(req), ambiente, provedor });
  }
  if (req.method === 'DELETE') {
    encerrarSessao(res);
    return enviar(res, 200, { ok: true });
  }
  if (!senhaConfere(corpo(req).senha)) {
    await new Promise(r => setTimeout(r, 800)); // freia tentativas de adivinhar a senha
    return enviar(res, 401, { erro: 'Senha incorreta.' });
  }
  criarSessao(res);
  enviar(res, 200, { ok: true });
}, { publico: true });
