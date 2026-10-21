import { asaas, AsaasError } from '../lib/asaas.js';
import { efi, efiAtivo, statusPadrao } from '../lib/efi.js';
import { rota, enviar, corpo, soDigitos } from '../lib/http.js';

// POST: gera um boleto para uma ou mais notas da mesma concessionária
//   { cnpj, nome, notas: ['227', '230'], valor, vencimento, descricao }
// GET ?ids=a,b: situação atual dos boletos já gerados
// DELETE ?id=: cancela o boleto
// Usa a Efí quando EFI_CLIENT_ID/EFI_CLIENT_SECRET estão configurados; senão, o Asaas.
// Ids da Efí ganham o prefixo "efi_" para não se misturar com os do Asaas ("pay_").

const ID_VALIDO = /^(pay_\w+|efi_\d+)$/;

async function consultar(id) {
  try {
    if (id.startsWith('efi_')) {
      const c = await efi(`/v1/charge/${id.slice(4)}`);
      return {
        id,
        status: statusPadrao(c.status),
        bankSlipUrl: c.payment?.banking_billet?.pdf?.charge || c.payment?.banking_billet?.link,
        invoiceUrl: c.link || c.payment?.banking_billet?.link,
      };
    }
    const p = await asaas(`/payments/${id}`);
    return { id, status: p.deleted ? 'DELETED' : p.status, bankSlipUrl: p.bankSlipUrl, invoiceUrl: p.invoiceUrl };
  } catch (e) {
    // Cobrança apagada responde 404
    return e.status === 404 ? { id, status: 'DELETED' } : { id, erro: true };
  }
}

async function gerarEfi({ cnpj, nome, valor, vencimento, descricao, rotulo }) {
  const cliente = cnpj.length === 14
    ? { juridical_person: { corporate_name: nome, cnpj } }
    : { name: nome, cpf: cnpj };
  const c = await efi('/v1/charge/one-step', {
    method: 'POST',
    body: {
      items: [{ name: descricao.slice(0, 255), value: Math.round(valor * 100), amount: 1 }],
      metadata: { custom_id: rotulo.slice(0, 255) },
      payment: {
        banking_billet: {
          expire_at: vencimento,
          customer: cliente,
          // 2% de multa e 0,033% de juros ao dia (≈ 1% ao mês) após o vencimento
          configurations: { fine: 200, interest: 33 },
          message: descricao.slice(0, 80),
        },
      },
    },
  });
  return {
    id: `efi_${c.charge_id}`,
    status: statusPadrao(c.status),
    dueDate: c.expire_at || vencimento,
    value: (c.total ?? valor * 100) / 100,
    bankSlipUrl: c.pdf?.charge || c.billet_link || c.link,
    invoiceUrl: c.link || c.billet_link || c.pdf?.charge,
  };
}

async function gerarAsaas({ cnpj, nome, valor, vencimento, descricao, rotulo }) {
  // Reaproveita o cliente se o CNPJ já estiver cadastrado no Asaas
  const existente = await asaas('/customers', { query: { cpfCnpj: cnpj } });
  const cliente = existente?.data?.[0] || await asaas('/customers', {
    method: 'POST',
    body: { name: nome, cpfCnpj: cnpj, notificationDisabled: true },
  });
  return asaas('/payments', {
    method: 'POST',
    body: {
      customer: cliente.id,
      billingType: 'BOLETO',
      value: valor,
      dueDate: vencimento,
      description: descricao,
      externalReference: rotulo.slice(0, 100),
      fine: { value: 2 },
      interest: { value: 1 },
    },
  });
}

export default rota(['GET', 'POST', 'DELETE'], async (req, res) => {
  if (req.method === 'GET') {
    const ids = String(req.query?.ids || '').split(',').filter(id => ID_VALIDO.test(id)).slice(0, 50);
    return enviar(res, 200, { data: await Promise.all(ids.map(consultar)) });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query?.id || '');
    if (!ID_VALIDO.test(id)) throw new AsaasError('Boleto inválido.', 400);
    if (id.startsWith('efi_')) await efi(`/v1/charge/${id.slice(4)}/cancel`, { method: 'PUT' });
    else await asaas(`/payments/${id}`, { method: 'DELETE' });
    return enviar(res, 200, { ok: true });
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

  const rotulo = `NF ${notas.join(', ')}`;
  const dados = { cnpj, nome, valor, vencimento: b.vencimento, descricao: String(b.descricao || rotulo).slice(0, 500), rotulo };
  enviar(res, 201, efiAtivo() ? await gerarEfi(dados) : await gerarAsaas(dados));
});
