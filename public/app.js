'use strict';

// ===== utilidades =====
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = v => brl.format(v || 0);
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '—';
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const somarDias = (iso, d) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const numero = v => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatarDoc(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

const STATUS = {
  PENDING: ['Pendente', 's-pendente'],
  AWAITING_RISK_ANALYSIS: ['Em análise', 's-pendente'],
  OVERDUE: ['Vencido', 's-vencido'],
  RECEIVED: ['Pago', 's-pago'],
  CONFIRMED: ['Pago', 's-pago'],
  RECEIVED_IN_CASH: ['Pago (manual)', 's-pago'],
  REFUNDED: ['Estornado', 's-outro'],
  REFUND_REQUESTED: ['Estorno solicitado', 's-outro'],
  CHARGEBACK_REQUESTED: ['Contestado', 's-vencido'],
  DUNNING_REQUESTED: ['Em negativação', 's-vencido'],
  DUNNING_RECEIVED: ['Recuperado', 's-pago'],
};
const chip = s => { const [t, c] = STATUS[s] || [s, 's-outro']; return `<span class="status ${c}">${esc(t)}</span>`; };

let avisoTimer;
function avisar(msg) {
  const el = $('#aviso');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), 3200);
}

async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); avisar(msg); }
  catch { prompt('Copie o texto abaixo:', texto); }
}

async function api(caminho, { method = 'GET', body } = {}) {
  const res = await fetch('/api/' + caminho, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && caminho !== 'sessao') { mostrarLogin(); throw new Error('Sessão expirada.'); }
  if (!res.ok) throw new Error(json.erro || 'Algo deu errado. Tente de novo.');
  return json;
}

function mostrarErro(el, e) { el.textContent = e.message; el.hidden = false; }

// ===== máscaras =====
function mascarar(input) {
  const tipo = input.dataset.mascara;
  let d = input.value.replace(/\D/g, '');
  if (tipo === 'doc') {
    d = d.slice(0, 14);
    input.value = d.length <= 11
      ? d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      : d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  } else if (tipo === 'tel') {
    d = d.slice(0, 11);
    input.value = d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2');
  } else if (tipo === 'cep') {
    input.value = d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  } else if (tipo === 'moeda') {
    input.value = d ? (Number(d) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  }
}
document.addEventListener('input', e => { if (e.target.dataset?.mascara) mascarar(e.target); });

// ===== modais =====
document.addEventListener('click', e => {
  if (e.target.closest('[data-fechar]')) e.target.closest('dialog').close();
});
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

// ===== login =====
function mostrarLogin() {
  $$('dialog[open]').forEach(d => d.close());
  $('#tela-painel').hidden = true;
  $('#tela-login').hidden = false;
  $('#form-login [name=senha]').focus();
}

async function mostrarPainel() {
  $('#tela-login').hidden = true;
  $('#tela-painel').hidden = false;
  carregarResumo();
  carregarLista();
}

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  const erro = $('#login-erro');
  erro.hidden = true;
  btn.disabled = true;
  try {
    await api('sessao', { method: 'POST', body: { senha: e.target.senha.value } });
    e.target.reset();
    mostrarPainel();
  } catch (err) { mostrarErro(erro, err); }
  finally { btn.disabled = false; }
});

$('#btn-sair').addEventListener('click', async () => {
  await api('sessao', { method: 'DELETE' }).catch(() => {});
  mostrarLogin();
});

// ===== resumo =====
async function carregarResumo() {
  try {
    const r = await api('resumo');
    const [ano, mes] = r.mes.split('-');
    $('#kpi-mes').textContent = `· ${new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long' })}`;
    for (const k of ['pendente', 'vencido', 'recebido']) {
      $(`#kpi-${k}`).textContent = moeda(r[k].total);
      $(`#kpi-${k}-qtd`).textContent = `${r[k].qtd} cobrança${r[k].qtd === 1 ? '' : 's'}`;
    }
  } catch { /* resumo é secundário; a lista mostra o erro */ }
}

// ===== lista =====
let filtro = '';
let offset = 0;

$('#filtros').addEventListener('click', e => {
  const b = e.target.closest('.filtro');
  if (!b) return;
  $$('.filtro').forEach(x => x.classList.toggle('ativo', x === b));
  filtro = b.dataset.status;
  carregarLista();
});

async function carregarLista(mais = false) {
  const tabela = $('#tabela');
  if (!mais) {
    offset = 0;
    tabela.innerHTML = '<div class="carregando">Carregando…</div>';
  }
  try {
    const r = await api(`cobrancas?status=${filtro}&offset=${offset}`);
    const linhas = (r.data || []).map(p => `
      <button class="item" data-id="${esc(p.id)}">
        <span class="item-cliente"><strong>${esc(p.customerName)}</strong><span>${{ PIX: 'Pix · ', CREDIT_CARD: 'Cartão · ' }[p.billingType] || ''}${esc(p.description || (p.installmentNumber ? `Parcela ${p.installmentNumber}` : 'Sem descrição'))}</span></span>
        <span class="item-venc">${dataBR(p.dueDate)}</span>
        <span class="item-valor">${moeda(p.value)}</span>
        <span class="item-status">${chip(p.status)}</span>
      </button>`).join('');

    if (!mais) {
      tabela.innerHTML = linhas
        ? `<div class="item cabecalho"><span>Cliente</span><span>Vencimento</span><span class="item-valor">Valor</span><span class="item-status">Situação</span></div>${linhas}`
        : '<div class="vazio">Nenhuma cobrança por aqui ainda.</div>';
    } else {
      tabela.insertAdjacentHTML('beforeend', linhas);
    }
    offset += (r.data || []).length;
    $('#btn-mais').hidden = !r.hasMore;
  } catch (e) {
    if (!mais) tabela.innerHTML = `<div class="vazio">${esc(e.message)}</div>`;
    else avisar(e.message);
  }
}

$('#btn-mais').addEventListener('click', () => carregarLista(true));
$('#tabela').addEventListener('click', e => {
  const item = e.target.closest('.item[data-id]');
  if (item) abrirDetalhe(item.dataset.id);
});

function recarregar() { carregarResumo(); carregarLista(); }

// ===== nova cobrança: cliente =====
const formNovo = $('#form-novo');
let clienteSelecionado = null;
let buscaTimer;

function selecionarCliente(c) {
  clienteSelecionado = c;
  $('#cliente-nome').textContent = c.name;
  $('#cliente-doc').textContent = formatarDoc(c.cpfCnpj);
  $('#cliente-escolhido').hidden = false;
  $('#cliente-busca-area').hidden = true;
  $('#cliente-novo').hidden = true;
  $('#sugestoes').innerHTML = '';
  atualizarProposta();
}

function modoBusca() {
  clienteSelecionado = null;
  atualizarProposta();
  $('#cliente-escolhido').hidden = true;
  $('#cliente-novo').hidden = true;
  $('#cliente-busca-area').hidden = false;
  $('#cliente-busca').value = '';
  $('#sugestoes').innerHTML = '';
  $('#cliente-busca').focus();
}

$('#cliente-busca').addEventListener('input', e => {
  clearTimeout(buscaTimer);
  const termo = e.target.value.trim();
  if (termo.length < 2) { $('#sugestoes').innerHTML = ''; return; }
  buscaTimer = setTimeout(async () => {
    try {
      const r = await api('clientes?busca=' + encodeURIComponent(termo));
      $('#sugestoes').innerHTML = (r.data || []).map((c, i) =>
        `<li><button type="button" data-i="${i}">${esc(c.name)} <small>${esc(formatarDoc(c.cpfCnpj))}</small></button></li>`).join('')
        || '<li><button type="button" disabled>Nenhum cliente encontrado</button></li>';
      $('#sugestoes').onclick = ev => {
        const b = ev.target.closest('button[data-i]');
        if (b) selecionarCliente(r.data[b.dataset.i]);
      };
    } catch (err) { avisar(err.message); }
  }, 300);
});

$('#btn-trocar-cliente').addEventListener('click', modoBusca);
$('#btn-cancelar-cliente').addEventListener('click', modoBusca);
$('#btn-cadastrar-cliente').addEventListener('click', () => {
  $('#cliente-busca-area').hidden = true;
  $('#cliente-novo').hidden = false;
  const termo = $('#cliente-busca').value.trim();
  if (/\d{6,}/.test(termo.replace(/\D/g, ''))) { formNovo.c_doc.value = termo; mascarar(formNovo.c_doc); }
  else formNovo.c_nome.value = termo;
  formNovo.c_nome.focus();
});

$('#btn-salvar-cliente').addEventListener('click', async e => {
  const btn = e.currentTarget;
  const erro = $('#novo-erro');
  erro.hidden = true;
  btn.disabled = true;
  try {
    const c = await api('clientes', {
      method: 'POST',
      body: {
        nome: formNovo.c_nome.value,
        cpfCnpj: formNovo.c_doc.value,
        telefone: formNovo.c_tel.value,
        email: formNovo.c_email.value,
        cep: formNovo.c_cep.value,
        numero: formNovo.c_num.value,
      },
    });
    selecionarCliente(c);
    avisar(c.jaExistia ? 'Esse CPF/CNPJ já estava cadastrado. Cliente selecionado.' : 'Cliente cadastrado.');
    ['c_nome', 'c_doc', 'c_tel', 'c_email', 'c_cep', 'c_num'].forEach(n => (formNovo[n].value = ''));
  } catch (err) { mostrarErro(erro, err); }
  finally { btn.disabled = false; }
});

// ===== nova cobrança: planos =====
// Preço cheio do ano; o anual sai com 50% de desconto no Pix e o cartão parcela o valor cheio com juros
// Vitrine de planos (fictícia, guardada para usar depois): true mostra na tela inicial e no formulário
const MOSTRAR_PLANOS = false;
const PRODUTO = 'Emissão para CNPJ LTDA';
// Aviso em destaque acima dos planos (deixe '' para esconder)
const AVISO_PLANOS = 'Seu prazo de teste acabou ontem. Atualize a página para verificar o novo valor.';
const VALOR_CHEIO = 1070;
const JUROS_CARTAO_MES = 0.0299; // 2,99% ao mês a partir de 2x (tabela Price)
const MAX_PARCELAS = 12;

// Total no cartão em n vezes: 1x sem juros; de 2x em diante com juros compostos
function totalCartao(n) {
  if (n <= 1) return VALOR_CHEIO;
  const i = JUROS_CARTAO_MES;
  const parcela = Math.round(VALOR_CHEIO * i / (1 - Math.pow(1 + i, -n)) * 100) / 100;
  return Math.round(parcela * n * 100) / 100;
}
const parcelaCartao = n => Math.round(totalCartao(n) / n * 100) / 100;

const PLANOS = {
  anual: { nome: 'Anual', parcelas: 1, forma: 'PIX', extra: () => ' (Pix com desconto)', valor: () => 535 },
  mensal: { nome: 'Cartão de crédito', parcelas: MAX_PARCELAS, forma: 'CREDIT_CARD', extra: n => ` ${n}x`, valor: n => totalCartao(n) },
};
const VALOR_ANUAL = PLANOS.anual.valor();
const economiaAnual = VALOR_CHEIO - VALOR_ANUAL;

function cartoesPlanos(comCta) {
  const cta = t => comCta ? `<span class="plano-cta">${t}</span>` : '';
  return `
  <button type="button" class="plano plano-destaque" role="radio" data-plano="anual">
    <span class="plano-selo">Mais vantajoso · 50% off no Pix</span>
    <span class="plano-nome">Anual</span>
    <span class="plano-de">de ${moeda(VALOR_CHEIO)}</span>
    <span class="plano-preco">${moeda(VALOR_ANUAL)}</span>
    <span class="plano-pix">À vista no Pix</span>
    <span class="plano-info">só ${moeda(VALOR_ANUAL / 12)}/mês · cai na hora</span>
    <span class="plano-economia">Economia de ${moeda(economiaAnual)}</span>
    ${cta('Gerar Pix do anual')}
  </button>
  ${comCta ? simulacaoCartao() : `
  <button type="button" class="plano" role="radio" data-plano="mensal">
    <span class="plano-nome">Cartão de crédito</span>
    <span class="plano-preco">até ${MAX_PARCELAS}x ${moeda(parcelaCartao(MAX_PARCELAS))}</span>
    <span class="plano-info">1x de ${moeda(VALOR_CHEIO)} · parcelado com juros</span>
  </button>`}`;
}

// Tabela de parcelas do cartão (tela inicial): cada linha gera a cobrança naquele número de vezes
function simulacaoCartao() {
  const linhas = [];
  for (let n = 1; n <= MAX_PARCELAS; n++) {
    linhas.push(`<button type="button" class="sim-linha" data-plano="mensal" data-n="${n}">
      <span class="sim-n">${n}x</span>
      <span class="sim-parcela">${moeda(parcelaCartao(n))}</span>
      <span class="sim-total">${n === 1 ? 'sem juros' : 'total ' + moeda(totalCartao(n))}</span>
    </button>`);
  }
  return `<div class="plano plano-sim">
    <span class="plano-nome">Cartão de crédito</span>
    <span class="plano-info">Simulação · clique na parcela para gerar o link</span>
    <div class="sim-lista">${linhas.join('')}</div>
  </div>`;
}
$('#planos').innerHTML = cartoesPlanos(false) +
  '<button type="button" class="plano plano-avulso" role="radio" data-plano="">Outro valor (avulso)</button>';
$('#planos-vitrine').innerHTML = cartoesPlanos(true);
if (!MOSTRAR_PLANOS) {
  $('#vitrine').hidden = true;
  $('#planos').hidden = true;
}
if (AVISO_PLANOS && MOSTRAR_PLANOS) {
  $('#aviso-planos').innerHTML = `<strong>Atenção:</strong> ${esc(AVISO_PLANOS)}`;
  $('#aviso-planos').hidden = false;
}

let planoAtual = '';
let descricaoAuto = '';

function escolherPlano(chave, n) {
  planoAtual = chave;
  $$('#planos .plano').forEach(b => b.setAttribute('aria-checked', String(b.dataset.plano === chave)));
  const p = PLANOS[chave];
  formNovo.valor.readOnly = !!p;
  // No cartão dá para trocar o número de parcelas; o valor acompanha a simulação
  selParcelas.disabled = !!p && chave !== 'mensal';
  selForma.disabled = !!p;
  if (p) {
    selForma.value = p.forma;
    selParcelas.value = n || p.parcelas;
    aplicarValorPlano();
  } else {
    if (formNovo.descricao.value === descricaoAuto) formNovo.descricao.value = '';
    formNovo.valor.value = '';
    selParcelas.value = 1;
    selForma.value = 'BOLETO';
    formNovo.valor.focus();
  }
  atualizarDicaParcelas();
}

function aplicarValorPlano() {
  const p = PLANOS[planoAtual];
  if (!p) return;
  const n = Number(selParcelas.value) || 1;
  formNovo.valor.value = p.valor(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  // Só substitui a descrição se ela ainda for a automática (não apaga o que foi digitado)
  if (!formNovo.descricao.value || formNovo.descricao.value === descricaoAuto) {
    descricaoAuto = `${PRODUTO} · Plano ${p.nome}${p.extra(n)}`;
    formNovo.descricao.value = descricaoAuto;
  }
}
$('#planos').addEventListener('click', e => {
  const b = e.target.closest('.plano');
  if (b) escolherPlano(b.dataset.plano);
});

function mensagemPropostaPlanos(nome) {
  return `Olá${nome ? ', ' + nome : ''}! Seguem as opções da GLPS para ${PRODUTO}:

⭐ *Plano Anual: ${moeda(VALOR_ANUAL)} à vista no Pix* (50% de desconto)
Dá só ${moeda(VALOR_ANUAL / 12)} por mês.

No cartão de crédito:
1x de ${moeda(VALOR_CHEIO)}
3x de ${moeda(parcelaCartao(3))} (total ${moeda(totalCartao(3))})
6x de ${moeda(parcelaCartao(6))} (total ${moeda(totalCartao(6))})
12x de ${moeda(parcelaCartao(12))} (total ${moeda(totalCartao(12))})

No anual você paga metade e resolve o ano inteiro de uma vez. Posso te mandar o Pix do anual?`;
}

function atualizarProposta() {
  const link = $('#btn-proposta');
  if (!clienteSelecionado || !MOSTRAR_PLANOS) { link.hidden = true; return; }
  const tel = (clienteSelecionado.mobilePhone || clienteSelecionado.phone || '').replace(/\D/g, '');
  const nome = (clienteSelecionado.name || '').split(' ')[0];
  link.href = `https://wa.me/${tel ? '55' + tel.replace(/^55(?=\d{10,11}$)/, '') : ''}?text=${encodeURIComponent(mensagemPropostaPlanos(nome))}`;
  link.hidden = false;
}

// ===== nova cobrança =====
const selParcelas = $('#sel-parcelas');
const selForma = $('#sel-forma');
for (let i = 1; i <= 12; i++) selParcelas.add(new Option(i === 1 ? 'À vista' : `${i}x`, i));

function atualizarDicaParcelas() {
  const n = Number(selParcelas.value);
  const valor = numero(formNovo.valor.value);
  const dica = $('#dica-parcelas');
  const forma = selForma.value;
  // Pix não parcela
  selParcelas.querySelectorAll('option').forEach(o => (o.disabled = forma === 'PIX' && o.value !== '1'));
  if (forma === 'PIX' && n > 1) selParcelas.value = 1;
  if (planoAtual === 'mensal') {
    dica.textContent = `Link de pagamento no cartão em ${n}x de ${moeda(parcelaCartao(n))} (total ${moeda(totalCartao(n))}). O cliente digita o cartão na página segura do Asaas. No Pix do anual pagaria só ${moeda(VALOR_ANUAL)}.`;
    dica.hidden = false;
  } else if (planoAtual === 'anual') {
    dica.textContent = 'Cobrança Pix: o cliente paga pelo QR Code ou copia e cola e o dinheiro cai na hora.';
    dica.hidden = false;
  } else if (n > 1 && valor > 0) {
    dica.textContent = forma === 'CREDIT_CARD'
      ? `${n}x de ${moeda(valor / n)} no cartão do cliente.`
      : `${n} boletos de ${moeda(valor / n)}, um por mês a partir do vencimento escolhido.`;
    dica.hidden = false;
  } else dica.hidden = true;
}
selParcelas.addEventListener('change', () => { aplicarValorPlano(); atualizarDicaParcelas(); });
selForma.addEventListener('change', atualizarDicaParcelas);
formNovo.valor.addEventListener('input', atualizarDicaParcelas);

function abrirNovoBoleto(plano = MOSTRAR_PLANOS ? 'anual' : '', n) {
  formNovo.reset();
  descricaoAuto = '';
  $('#novo-erro').hidden = true;
  $('#dica-parcelas').hidden = true;
  formNovo.vencimento.min = hojeISO();
  formNovo.vencimento.value = somarDias(hojeISO(), 3);
  modoBusca();
  escolherPlano(plano, n); // sem escolha explícita, o anual já vem marcado
  $('#modal-novo').showModal();
  $('#cliente-busca').focus();
}
$('#btn-novo').addEventListener('click', () => abrirNovoBoleto());
$('#planos-vitrine').addEventListener('click', e => {
  const b = e.target.closest('[data-plano]');
  if (b) abrirNovoBoleto(b.dataset.plano, Number(b.dataset.n) || undefined);
});

formNovo.addEventListener('submit', async e => {
  e.preventDefault();
  const erro = $('#novo-erro');
  erro.hidden = true;
  if (!clienteSelecionado) { mostrarErro(erro, new Error('Escolha ou cadastre o cliente primeiro.')); return; }

  const btn = $('#btn-emitir');
  btn.disabled = true;
  btn.textContent = 'Emitindo…';
  try {
    const p = await api('cobrancas', {
      method: 'POST',
      body: {
        cliente: clienteSelecionado.id,
        valor: numero(formNovo.valor.value),
        vencimento: formNovo.vencimento.value,
        parcelas: formNovo.parcelas.value,
        forma: selForma.value,
        descricao: formNovo.descricao.value,
        referencia: formNovo.referencia.value,
        multa: formNovo.multa.value,
        juros: formNovo.juros.value,
        desconto: formNovo.desconto.value,
      },
    });
    $('#modal-novo').close();
    avisar('Cobrança gerada.');
    recarregar();
    abrirDetalhe(p.id);
  } catch (err) { mostrarErro(erro, err); }
  finally { btn.disabled = false; btn.textContent = 'Gerar cobrança'; }
});

// ===== detalhe =====
let atual = null;

async function abrirDetalhe(id) {
  const corpo = $('#det-corpo');
  corpo.innerHTML = '<div class="carregando">Carregando…</div>';
  $('#det-titulo').textContent = 'Cobrança';
  if (!$('#modal-detalhe').open) $('#modal-detalhe').showModal();
  try {
    atual = await api('cobranca?id=' + encodeURIComponent(id));
    renderDetalhe(atual);
  } catch (e) { corpo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function mensagemWhatsApp(p) {
  const nome = (p.cliente?.name || '').split(' ')[0];
  const oi = `Olá${nome ? ', ' + nome : ''}!`;
  const ref = p.description ? ` referente a ${p.description}` : '';
  let txt;
  if (p.billingType === 'PIX') {
    txt = `${oi} Segue o Pix${ref}.\n\nValor: ${moeda(p.value)}\nVencimento: ${dataBR(p.dueDate)}`;
    if (p.pix?.payload) txt += `\n\nPix copia e cola:\n${p.pix.payload}`;
    txt += `\n\nOu pague pelo link: ${p.invoiceUrl}`;
  } else if (p.billingType === 'CREDIT_CARD') {
    const parc = p.installmentNumber ? ' em 12x' : '';
    txt = `${oi} Segue o link para pagamento no cartão de crédito${parc}${ref}.\n\n${p.invoiceUrl}\n\nÉ só abrir e digitar os dados do cartão. A página é segura (Asaas).`;
  } else {
    txt = `${oi} Segue o boleto${ref}.\n\nValor: ${moeda(p.value)}\nVencimento: ${dataBR(p.dueDate)}\n\nBoleto: ${p.bankSlipUrl}`;
    if (p.linhaDigitavel) txt += `\n\nLinha digitável:\n${p.linhaDigitavel}`;
    if (p.pix?.payload) txt += `\n\nSe preferir, pague por Pix (copia e cola):\n${p.pix.payload}`;
  }
  return txt + '\n\nQualquer dúvida, estou à disposição.';
}

function renderDetalhe(p) {
  const aberto = ['PENDING', 'OVERDUE'].includes(p.status);
  const tel = (p.cliente?.mobilePhone || p.cliente?.phone || '').replace(/\D/g, '');
  const zap = `https://wa.me/${tel ? '55' + tel.replace(/^55(?=\d{10,11}$)/, '') : ''}?text=${encodeURIComponent(mensagemWhatsApp(p))}`;
  const tipo = { PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito' }[p.billingType] || 'Boleto';
  $('#det-titulo').textContent = p.installmentNumber ? `${tipo} · parcela ${p.installmentNumber}` : tipo;

  $('#det-corpo').innerHTML = `
    <div>
      ${chip(p.status)}
      <p class="det-valor">${moeda(p.value)}</p>
    </div>
    <dl class="det-meta">
      <dt>Cliente</dt><dd>${esc(p.cliente?.name || '—')} · ${esc(formatarDoc(p.cliente?.cpfCnpj))}</dd>
      <dt>Vencimento</dt><dd>${dataBR(p.dueDate)}</dd>
      ${p.paymentDate || p.clientPaymentDate ? `<dt>Pago em</dt><dd>${dataBR(p.clientPaymentDate || p.paymentDate)}</dd>` : ''}
      ${p.description ? `<dt>Descrição</dt><dd>${esc(p.description)}</dd>` : ''}
      ${p.externalReference ? `<dt>Pedido / OS</dt><dd>${esc(p.externalReference)}</dd>` : ''}
      ${p.nossoNumero ? `<dt>Nosso número</dt><dd>${esc(p.nossoNumero)}</dd>` : ''}
    </dl>

    ${p.linhaDigitavel ? `
      <div class="copiavel"><span>Linha digitável</span>
        <div><code>${esc(p.linhaDigitavel)}</code><button class="btn btn-secundario" data-copiar="linha">Copiar</button></div>
      </div>` : ''}

    ${p.pix?.payload ? `
      <div class="pix">
        <img src="data:image/png;base64,${esc(p.pix.encodedImage)}" alt="QR Code Pix" />
        <div class="copiavel" style="flex:1"><span>Pix copia e cola</span>
          <div><code>${esc(p.pix.payload.slice(0, 60))}…</code><button class="btn btn-secundario" data-copiar="pix">Copiar</button></div>
        </div>
      </div>` : ''}

    <div class="det-acoes">
      ${p.bankSlipUrl
        ? `<a class="btn btn-primario" href="${esc(p.bankSlipUrl)}" target="_blank" rel="noopener">Abrir PDF do boleto</a>`
        : `<a class="btn btn-primario" href="${esc(p.invoiceUrl)}" target="_blank" rel="noopener">Abrir página de pagamento</a>`}
      ${aberto ? `<a class="btn btn-secundario" href="${esc(zap)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>` : ''}
      <button class="btn btn-fantasma" data-copiar="link">Copiar link</button>
    </div>

    ${aberto ? `
      <div class="det-perigo">
        <button class="btn btn-fantasma" id="btn-baixa">Marcar como pago</button>
        <button class="btn btn-perigo" id="btn-cancelar">Cancelar cobrança</button>
      </div>` : ''}
  `;
}

$('#det-corpo').addEventListener('click', async e => {
  const c = e.target.closest('[data-copiar]');
  if (c && atual) {
    const tipo = c.dataset.copiar;
    if (tipo === 'linha') copiar(atual.linhaDigitavel, 'Linha digitável copiada.');
    if (tipo === 'pix') copiar(atual.pix.payload, 'Código Pix copiado.');
    if (tipo === 'link') copiar(atual.invoiceUrl || atual.bankSlipUrl, 'Link copiado.');
    return;
  }

  if (e.target.id === 'btn-baixa') {
    const f = $('#form-baixa');
    f.data.value = hojeISO();
    f.data.max = hojeISO();
    f.valor.value = atual.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    $('#baixa-erro').hidden = true;
    $('#modal-baixa').showModal();
  }

  if (e.target.id === 'btn-cancelar') {
    if (!confirm(`Cancelar a cobrança de ${moeda(atual.value)} de ${atual.cliente?.name || 'cliente'}? O cliente não conseguirá mais pagá-lo.`)) return;
    e.target.disabled = true;
    try {
      await api('cobranca?id=' + encodeURIComponent(atual.id), { method: 'DELETE' });
      $('#modal-detalhe').close();
      avisar('Cobrança cancelada.');
      recarregar();
    } catch (err) { avisar(err.message); e.target.disabled = false; }
  }
});

$('#form-baixa').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('cobranca?id=' + encodeURIComponent(atual.id), {
      method: 'POST',
      body: { acao: 'receber', data: f.data.value, valor: numero(f.valor.value) },
    });
    $('#modal-baixa').close();
    avisar('Pagamento registrado.');
    abrirDetalhe(atual.id);
    recarregar();
  } catch (err) { mostrarErro($('#baixa-erro'), err); }
});

// ===== início =====
api('sessao')
  .then(r => {
    $('#ambiente').hidden = r.ambiente !== 'sandbox';
    r.logado ? mostrarPainel() : mostrarLogin();
  })
  .catch(mostrarLogin);
