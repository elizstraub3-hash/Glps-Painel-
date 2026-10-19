import { asaas, AsaasError } from '../lib/asaas.js';
import { rota, enviar, corpo, soDigitos } from '../lib/http.js';

export default rota(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const busca = String(req.query?.busca || '').trim();
    const digitos = soDigitos(busca);
    const query = { limit: 50, offset: Number(req.query?.offset) || 0 };
    if (digitos.length === 11 || digitos.length === 14) query.cpfCnpj = digitos;
    else if (busca) query.name = busca;
    return enviar(res, 200, await asaas('/customers', { query }));
  }

  const b = corpo(req);
  const cpfCnpj = soDigitos(b.cpfCnpj);
  if (!String(b.nome || '').trim()) throw new AsaasError('Informe o nome do cliente.', 400);
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) throw new AsaasError('CPF ou CNPJ inválido.', 400);

  // Evita cadastro duplicado: se o documento já existe, devolve o cliente existente
  const existente = await asaas('/customers', { query: { cpfCnpj } });
  if (existente?.data?.length) return enviar(res, 200, { ...existente.data[0], jaExistia: true });

  const cliente = await asaas('/customers', {
    method: 'POST',
    body: {
      name: b.nome.trim(),
      cpfCnpj,
      email: b.email?.trim() || undefined,
      mobilePhone: soDigitos(b.telefone) || undefined,
      postalCode: soDigitos(b.cep) || undefined,
      addressNumber: b.numero?.trim() || undefined,
      notificationDisabled: false,
    },
  });
  enviar(res, 201, cliente);
});
