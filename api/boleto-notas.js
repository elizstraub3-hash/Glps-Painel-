import { asaas, AsaasError } from '../lib/asaas.js';
import { rota, enviar, corpo, soDigitos } from '../lib/http.js';

// POST: gera um boleto no Asaas para uma ou mais notas da mesma concessionária
//   { cnpj, nome, notas: ['227', '230'], valor, vencimento, descricao }
// GET ?ids=pay_1,pay_2: situação atual dos boletos já gerados
export default rota(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const ids = String(req.query?.ids || '').split(',').filter(id => /^pay_\w+$/.test(id)).slice(0, 50);
    const lista = await Promise.all(ids.map(async id => {
      try {
        const p = await asaas(`/payments/${id}`);
        return { id, status: p.deleted ? 'DELETED' : p.status, pago: p.clientPaymentDate || p.paymentDate || null, bankSlipUrl: p.bankSlipUrl, invoiceUrl: p.invoiceUrl };
      } catch (e) {
        // Cobrança apagada no Asaas responde 404
        return e.status === 404 ? { id, status: 'DELETED' } : { id, erro: true };
      }
    }));
    return enviar(res, 200, { data: lista });
  }

  const b = corpo(req);
  const cnpj = soDigitos(b.cnpj);
  const nome = String(b.nome || '').trim();
  const notas = (Array.isArray(b.notas) ? b.notas : []).map(String).filter(Boolean);
  const valor = Math.round(Number(b.valor) * 100) / 100;
  const hoje = new Date().toISOString().slice(0, 10);

  if (cnpj.length !== 14 && cnpj.length !== 11) throw new AsaasError('A nota precisa ter o CNPJ da concessionária preenchido.', 400);
  if (!nome) throw new AsaasError('A nota precisa ter o nome da concessionária.', 400);
  if (!notas.length) throw new AsaasError('Selecione ao menos uma nota.', 400);
  if (!(valor >= 5)) throw new AsaasError('O valor mínimo de um boleto é R$ 5,00.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.vencimento || '') || b.vencimento < hoje) {
    throw new AsaasError('Escolha um vencimento de hoje em diante.', 400);
  }

  // Reaproveita o cliente se o CNPJ já estiver cadastrado no Asaas
  const existente = await asaas('/customers', { query: { cpfCnpj: cnpj } });
  const cliente = existente?.data?.[0] || await asaas('/customers', {
    method: 'POST',
    body: { name: nome, cpfCnpj: cnpj, notificationDisabled: true },
  });

  const rotulo = `NF ${notas.join(', ')}`;
  const pagamento = await asaas('/payments', {
    method: 'POST',
    body: {
      customer: cliente.id,
      billingType: 'BOLETO',
      value: valor,
      dueDate: b.vencimento,
      description: String(b.descricao || rotulo).slice(0, 500),
      externalReference: rotulo.slice(0, 100),
    },
  });
  enviar(res, 201, pagamento);
});
