import { asaas, AsaasError } from '../lib/asaas.js';
import { rota, enviar, corpo } from '../lib/http.js';

// GET ?id=   detalhes + linha digitável + Pix
// POST ?id=  { acao: 'receber', data, valor }  baixa manual (pago em dinheiro/fora do boleto)
// DELETE ?id= cancela o boleto
export default rota(['GET', 'POST', 'DELETE'], async (req, res) => {
  const id = String(req.query?.id || '');
  if (!/^pay_\w+$/.test(id)) throw new AsaasError('Cobrança inválida.', 400);

  if (req.method === 'DELETE') {
    return enviar(res, 200, await asaas(`/payments/${id}`, { method: 'DELETE' }));
  }

  if (req.method === 'POST') {
    const b = corpo(req);
    if (b.acao !== 'receber') throw new AsaasError('Ação desconhecida.', 400);
    return enviar(res, 200, await asaas(`/payments/${id}/receiveInCash`, {
      method: 'POST',
      body: {
        paymentDate: b.data || new Date().toISOString().slice(0, 10),
        value: Number(b.valor),
        notifyCustomer: false,
      },
    }));
  }

  const pagamento = await asaas(`/payments/${id}`);
  const aberto = ['PENDING', 'OVERDUE'].includes(pagamento.status);
  const [cliente, linha, pix] = await Promise.all([
    asaas(`/customers/${pagamento.customer}`).catch(() => null),
    aberto ? asaas(`/payments/${id}/identificationField`).catch(() => null) : null,
    aberto ? asaas(`/payments/${id}/pixQrCode`).catch(() => null) : null,
  ]);
  enviar(res, 200, { ...pagamento, cliente, linhaDigitavel: linha?.identificationField || null, pix });
});
