import { asaas } from '../lib/asaas.js';
import { rota, enviar } from '../lib/http.js';

// Totais do mês corrente por situação
export default rota(['GET'], async (req, res) => {
  const agora = new Date();
  const de = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
  const ate = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);

  async function somar(status) {
    let offset = 0, total = 0, qtd = 0;
    for (;;) {
      const r = await asaas('/payments', {
        query: { billingType: 'BOLETO', status, 'dueDate[ge]': de, 'dueDate[le]': ate, limit: 100, offset },
      });
      for (const p of r.data || []) { total += p.value; qtd++; }
      if (!r.hasMore) break;
      offset += 100;
    }
    return { total: Math.round(total * 100) / 100, qtd };
  }

  const [pendente, vencido, recebido, confirmado, dinheiro] = await Promise.all(
    ['PENDING', 'OVERDUE', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].map(somar),
  );
  enviar(res, 200, {
    mes: de.slice(0, 7),
    pendente,
    vencido,
    recebido: {
      total: Math.round((recebido.total + confirmado.total + dinheiro.total) * 100) / 100,
      qtd: recebido.qtd + confirmado.qtd + dinheiro.qtd,
    },
  });
});
