import { asaas, AsaasError } from '../lib/asaas.js';
import { rota, enviar, corpo } from '../lib/http.js';

const STATUS = {
  pendente: 'PENDING',
  vencido: 'OVERDUE',
  recebido: 'RECEIVED',
  confirmado: 'CONFIRMED',
  dinheiro: 'RECEIVED_IN_CASH',
};

function dinheiro(v) {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default rota(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const q = req.query || {};
    const lista = await asaas('/payments', {
      query: {
        billingType: 'BOLETO',
        status: STATUS[q.status],
        customer: q.cliente,
        'dueDate[ge]': q.de,
        'dueDate[le]': q.ate,
        offset: Number(q.offset) || 0,
        limit: 50,
      },
    });

    // A listagem só traz o id do cliente; busca os nomes de uma vez
    const ids = [...new Set((lista.data || []).map(p => p.customer))];
    const clientes = await Promise.all(ids.map(id => asaas(`/customers/${id}`).catch(() => null)));
    const nomes = Object.fromEntries(clientes.filter(Boolean).map(c => [c.id, c.name]));
    for (const p of lista.data || []) p.customerName = nomes[p.customer] || '—';
    return enviar(res, 200, lista);
  }

  const b = corpo(req);
  const valor = dinheiro(b.valor);
  const parcelas = Math.max(1, Math.min(60, Number(b.parcelas) || 1));
  const hoje = new Date().toISOString().slice(0, 10);

  if (!b.cliente) throw new AsaasError('Escolha o cliente.', 400);
  if (!(valor >= 5)) throw new AsaasError('O valor mínimo de um boleto é R$ 5,00.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.vencimento || '') || b.vencimento < hoje) {
    throw new AsaasError('Escolha um vencimento de hoje em diante.', 400);
  }
  if (parcelas > 1 && valor / parcelas < 5) throw new AsaasError('Cada parcela precisa ser de pelo menos R$ 5,00.', 400);

  const multa = dinheiro(b.multa);
  const juros = dinheiro(b.juros);
  const desconto = dinheiro(b.desconto);

  const pagamento = {
    customer: b.cliente,
    billingType: 'BOLETO',
    dueDate: b.vencimento,
    description: String(b.descricao || '').slice(0, 500) || undefined,
    externalReference: String(b.referencia || '').slice(0, 100) || undefined,
    fine: multa > 0 ? { value: multa } : undefined,           // % de multa após o vencimento
    interest: juros > 0 ? { value: juros } : undefined,       // % de juros ao mês
    discount: desconto > 0
      ? { value: desconto, dueDateLimitDays: 0, type: 'PERCENTAGE' } // % de desconto até o vencimento
      : undefined,
  };
  if (parcelas > 1) {
    pagamento.installmentCount = parcelas;
    pagamento.totalValue = valor;
  } else {
    pagamento.value = valor;
  }

  enviar(res, 201, await asaas('/payments', { method: 'POST', body: pagamento }));
});
