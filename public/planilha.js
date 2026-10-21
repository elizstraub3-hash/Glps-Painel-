'use strict';

// ===== utilidades =====
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = v => brl.format(v || 0);
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const somarDias = (iso, d) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + Number(d || 0)); return x.toISOString().slice(0, 10); };
const diaSemana = iso => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
const novoId = () => Math.random().toString(36).slice(2, 10);
const numero = v => {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/[^\d,.-]/g, '');
  // "1.900,00" → 1900 · "1900.5" → 1900.5
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0;
};
const valorCampo = v => v ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let avisoTimer;
function avisar(msg) {
  const el = $('#aviso');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), 3500);
}

async function api(caminho, { method = 'GET', body } = {}) {
  const res = await fetch('/api/' + caminho, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = '/'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { const e = new Error(json.erro || 'Algo deu errado.'); e.status = res.status; e.dados = json.dados; throw e; }
  return json;
}

// ===== dados =====
const LOCAL = 'glps_planilha';
const PRAZO_PADRAO = 21;
let dados = vazio();
let semBanco = false;
let aba = 'carros';
let busca = '';
const selecionadas = new Set(); // notas marcadas para gerar boleto (não é salvo)

function vazio() {
  return { versao: 0, carros: [], recebimentos: [], dadosNF: { banco: '', agencia: '', conta: '', cnpj: '', email: '' } };
}

const vencimento = c => c.data ? somarDias(c.data, c.prazo ?? PRAZO_PADRAO) : '';

function situacao(c) {
  if (c.situacao === 'Pago') return ['Pago', 'sit-pago'];
  const v = vencimento(c);
  if (!v) return ['A receber', 'sit-aberto'];
  if (v < hojeISO()) return ['Atrasado', 'sit-venc'];
  if (v === hojeISO()) return ['Vence hoje', 'sit-hoje'];
  return ['A receber', 'sit-aberto'];
}

// Mesma placa e mesmo valor em outra nota: provável duplicidade
function duplicadas() {
  const vistos = {}, dup = new Set();
  for (const c of dados.carros) {
    if (!c.placa || !c.valor) continue;
    const k = c.placa.toUpperCase().replace(/\W/g, '') + '|' + c.valor;
    if (vistos[k]) { dup.add(c.id); dup.add(vistos[k]); } else vistos[k] = c.id;
  }
  return dup;
}

// ===== salvar =====
let salvarTimer, salvando = false, pendente = false;

function marcarAlterado() {
  $('#salvo').textContent = 'Alterações não salvas…';
  $('#salvo').classList.remove('alerta');
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(salvar, 700);
}

async function salvar() {
  if (semBanco) {
    try { localStorage.setItem(LOCAL, JSON.stringify(dados)); } catch { /* armazenamento indisponível */ }
    $('#salvo').textContent = 'Salvo neste navegador';
    $('#salvo').classList.add('alerta');
    return;
  }
  if (salvando) { pendente = true; return; }
  salvando = true;
  $('#salvo').textContent = 'Salvando…';
  try {
    const r = await api('planilha', { method: 'PUT', body: { dados, versaoBase: dados.versao || 0 } });
    dados.versao = r.dados.versao;
    $('#salvo').textContent = 'Salvo ✓';
  } catch (e) {
    if (e.status === 409) {
      avisar('A planilha foi alterada em outro aparelho. Carreguei a versão mais nova.');
      dados = normalizar(e.dados);
      render();
    } else {
      $('#salvo').textContent = 'Erro ao salvar — tentando de novo';
      $('#salvo').classList.add('alerta');
      setTimeout(salvar, 4000);
    }
  } finally {
    salvando = false;
    if (pendente) { pendente = false; salvar(); }
  }
}

function normalizar(d) {
  const base = vazio();
  if (!d) return base;
  return {
    ...base, ...d,
    carros: (d.carros || []).map(c => ({ id: c.id || novoId(), ...c })),
    recebimentos: (d.recebimentos || []).map(r => ({ id: r.id || novoId(), ...r })),
    dadosNF: { ...base.dadosNF, ...(d.dadosNF || {}) },
  };
}

async function carregar() {
  try {
    const r = await api('planilha');
    semBanco = r.semBanco;
    if (semBanco) {
      let local = null;
      try { local = JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch { /* sem armazenamento */ }
      dados = normalizar(local);
      $('#aviso-banco').hidden = false;
      $('#salvo').textContent = 'Salvo neste navegador';
      $('#salvo').classList.add('alerta');
    } else {
      dados = normalizar(r.dados);
      $('#salvo').textContent = 'Salvo ✓';
    }
  } catch (e) {
    $('#grade').innerHTML = `<div class="vazio-folha">${esc(e.message)}</div>`;
    return;
  }
  render();
  sincronizarBoletos();
}

// ===== resumo =====
function renderResumo() {
  const carros = dados.carros;
  const total = carros.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const abertos = carros.filter(c => c.situacao !== 'Pago');
  const pagos = carros.filter(c => c.situacao === 'Pago');
  const aReceber = abertos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const atrasados = abertos.filter(c => vencimento(c) && vencimento(c) < hojeISO());
  const proximo = abertos.map(vencimento).filter(v => v && v >= hojeISO()).sort()[0];

  $('#k-total').textContent = moeda(total);
  $('#k-total-qtd').textContent = `${carros.length} nota${carros.length === 1 ? '' : 's'}`;
  $('#k-receber').textContent = moeda(aReceber);
  $('#k-receber-info').textContent = atrasados.length
    ? `${atrasados.length} atrasada${atrasados.length === 1 ? '' : 's'}` + (proximo ? ` · próximo: ${dataBR(proximo)}` : '')
    : proximo ? `próximo pagamento: ${dataBR(proximo)}` : `${abertos.length} nota${abertos.length === 1 ? '' : 's'}`;
  $('#k-pago').textContent = moeda(pagos.reduce((s, c) => s + (Number(c.valor) || 0), 0));
  $('#k-pago-qtd').textContent = `${pagos.length} nota${pagos.length === 1 ? '' : 's'}`;
}

// ===== abas =====
function render() {
  renderResumo();
  $('#btn-linha').hidden = !['carros', 'recebimentos'].includes(aba);
  if (aba !== 'carros') $('#btn-boleto').hidden = true;
  $('#busca').hidden = aba === 'dados';
  if (aba === 'carros') renderCarros();
  if (aba === 'vencimentos') renderVencimentos();
  if (aba === 'recebimentos') renderRecebimentos();
  if (aba === 'dados') renderDadosNF();
}

$('#abas').addEventListener('click', e => {
  const b = e.target.closest('.filtro');
  if (!b) return;
  $$('#abas .filtro').forEach(x => x.classList.toggle('ativo', x === b));
  aba = b.dataset.aba;
  render();
});

$('#busca').addEventListener('input', e => { busca = e.target.value.trim().toLowerCase(); render(); });

function bate(obj) {
  if (!busca) return true;
  return Object.values(obj).some(v => String(v ?? '').toLowerCase().includes(busca));
}

// ===== aba: carros =====
// [campo, título, tipo, largura em px]
const COLS_CARROS = [
  ['_sel', '', 'sel', 36],
  ['nota', 'Nota', 'num-txt', 70],
  ['concessionaria', 'Concessionária', '', 210],
  ['carro', 'Carro', '', 160],
  ['placa', 'Placa', '', 100],
  ['valor', 'Valor (R$)', 'valor', 115],
  ['data', 'Data da nota', 'date', 145],
  ['prazo', 'Prazo', 'int', 70],
  ['_venc', 'Vencimento', 'calc', 105],
  ['situacao', 'Situação', 'sit', 215],
  ['_boleto', 'Boleto', 'boleto', 270],
  ['triagem', 'Triagem', '', 105],
  ['cnpj', 'CNPJ', '', 165],
  ['obs', 'Observação', '', 340],
];
const colgroup = cols => `<colgroup>${cols.map(c => `<col style="width:${c[3]}px" />`).join('')}<col style="width:36px" /></colgroup>`;

const STATUS_BOLETO = {
  PENDING: ['Aguardando', 'sit-aberto'],
  OVERDUE: ['Vencido', 'sit-venc'],
  RECEIVED: ['Pago', 'sit-pago'],
  CONFIRMED: ['Pago', 'sit-pago'],
  RECEIVED_IN_CASH: ['Pago', 'sit-pago'],
};
const PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

function celula(tabela, item, [campo, , tipo]) {
  const attrs = `data-t="${tabela}" data-id="${esc(item.id)}" data-c="${campo}"`;
  if (tipo === 'sel') return `<td class="col-sel"><input type="checkbox" class="sel-nota" data-id="${esc(item.id)}" ${selecionadas.has(item.id) ? 'checked' : ''} aria-label="Selecionar nota ${esc(item.nota)}" /></td>`;
  if (tipo === 'boleto') {
    const b = item.boleto;
    if (!b) return `<td><div class="td-bol"><button class="btn-mini" data-gerar="${esc(item.id)}">Gerar boleto</button></div></td>`;
    const [rot, cls] = STATUS_BOLETO[b.status] || [b.status || '—', 'sit-aberto'];
    return `<td><div class="td-bol"><span class="sit ${cls}">${rot}</span>
      <a href="${esc(b.bankSlipUrl || b.invoiceUrl || '#')}" target="_blank" rel="noopener">Abrir</a>
      <a href="#" data-copiar-bol="${esc(item.id)}">Copiar link</a>
      ${PAGO.includes(b.status) ? '' : `<a href="#" class="cancelar-bol" data-cancelar-bol="${esc(item.id)}">Cancelar</a>`}</div></td>`;
  }
  if (tipo === 'calc') return `<td class="ro">${dataBR(vencimento(item))}</td>`;
  if (tipo === 'sit') {
    const [rotulo, cls] = situacao(item);
    return `<td><div class="td-sit"><select class="sel-sit" ${attrs}>
      <option ${item.situacao !== 'Pago' ? 'selected' : ''}>A receber</option>
      <option ${item.situacao === 'Pago' ? 'selected' : ''}>Pago</option>
    </select>${['sit-venc', 'sit-hoje'].includes(cls) ? `<span class="sit ${cls}">${rotulo}</span>` : ''}</div></td>`;
  }
  if (tipo === 'date') return `<td><input type="date" value="${esc(item[campo] || '')}" ${attrs} /></td>`;
  if (tipo === 'valor') return `<td><input class="num" inputmode="decimal" value="${esc(valorCampo(item[campo]))}" ${attrs} /></td>`;
  if (tipo === 'int') return `<td><input class="num" inputmode="numeric" value="${esc(item[campo] ?? '')}" ${attrs} /></td>`;
  return `<td><input value="${esc(item[campo] ?? '')}" ${attrs} /></td>`;
}

function renderCarros() {
  const lista = dados.carros.filter(bate)
    .sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || (Number(a.nota) || 0) - (Number(b.nota) || 0));
  if (!dados.carros.length) return vazioFolha('Nenhuma nota ainda. Importe a sua planilha ou adicione uma linha.');

  const dup = duplicadas();
  const grupos = new Map();
  for (const c of lista) {
    const k = c.data || '';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }

  let linhas = '';
  for (const [data, itens] of grupos) {
    const soma = itens.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    linhas += `<tr class="linha-grupo"><td colspan="${COLS_CARROS.length + 1}">${data ? 'NOTAS DO DIA ' + dataBR(data) : 'SEM DATA'} · ${itens.length} nota${itens.length === 1 ? '' : 's'} · ${moeda(soma)}</td></tr>`;
    for (const c of itens) {
      const cls = [c.situacao === 'Pago' ? 'pago' : '', dup.has(c.id) ? 'dup' : '', selecionadas.has(c.id) ? 'selecionada' : ''].join(' ');
      linhas += `<tr class="${cls}" ${dup.has(c.id) ? 'title="Possível duplicidade: mesma placa e mesmo valor de outra nota"' : ''}>
        ${COLS_CARROS.map(col => celula('carros', c, col)).join('')}
        <td class="col-x"><button class="del" data-del="carros" data-id="${esc(c.id)}" title="Apagar linha">×</button></td>
      </tr>`;
    }
  }
  const total = lista.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const iValor = COLS_CARROS.findIndex(c => c[0] === 'valor');
  linhas += `<tr class="total"><td colspan="${iValor}">TOTAL${busca ? ' (filtrado)' : ''}</td><td class="num-ro">${moeda(total)}</td><td colspan="${COLS_CARROS.length - iValor}"></td></tr>`;

  $('#grade').innerHTML = `
    <table class="grade grade-fixa">
      ${colgroup(COLS_CARROS)}
      <thead><tr>${COLS_CARROS.map(([, t, tipo]) => `<th class="${tipo === 'valor' || tipo === 'int' ? 'num' : ''}">${t}</th>`).join('')}<th class="col-x"></th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="nota-rodape">Vencimento = data da nota + prazo. Para gerar um boleto com várias notas, marque as caixinhas das notas da mesma concessionária e clique em "Gerar boleto". Linhas com marca amarela à esquerda têm a mesma placa e o mesmo valor de outra nota (possível duplicidade).</div>`;
  atualizarBotaoBoleto();
}

// ===== aba: vencimentos =====
function renderVencimentos() {
  const grupos = new Map();
  for (const c of dados.carros.filter(bate)) {
    const v = vencimento(c);
    if (!v) continue;
    if (!grupos.has(v)) grupos.set(v, []);
    grupos.get(v).push(c);
  }
  if (!grupos.size) return vazioFolha('Sem vencimentos. Preencha a data das notas na aba Carros e notas.');

  const hoje = hojeISO();
  let totalAberto = 0, totalGeral = 0, qtdGeral = 0, aindaReceber = 0;
  const linhas = [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([v, itens]) => {
    const abertos = itens.filter(c => c.situacao !== 'Pago');
    const valorAberto = abertos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const valorTotal = itens.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    totalAberto += valorAberto; totalGeral += valorTotal; qtdGeral += itens.length;
    if (v >= hoje) aindaReceber += valorAberto;
    let sit;
    if (!abertos.length) sit = ['Pago', 'sit-pago'];
    else if (v < hoje) sit = ['Atrasado', 'sit-venc'];
    else if (v === hoje) sit = ['Vence hoje', 'sit-hoje'];
    else sit = ['A receber', 'sit-aberto'];
    return `<tr class="${!abertos.length ? 'pago' : ''}">
      <td class="ro">${dataBR(v)}</td>
      <td class="ro">${diaSemana(v)}</td>
      <td class="num-ro">${itens.length}</td>
      <td class="ro">${itens.map(c => esc(c.nota)).join(', ')}</td>
      <td class="num-ro">${moeda(valorTotal)}</td>
      <td class="num-ro">${moeda(valorAberto)}</td>
      <td><span class="sit ${sit[1]}">${sit[0]}</span></td>
    </tr>`;
  }).join('');

  $('#grade').innerHTML = `
    <table class="grade">
      <thead><tr><th>Data de pagamento</th><th>Dia da semana</th><th class="num">Qtde de notas</th><th>Notas</th><th class="num">Valor total (R$)</th><th class="num">Falta receber (R$)</th><th>Situação</th></tr></thead>
      <tbody>${linhas}
        <tr class="total"><td colspan="2">TOTAL</td><td class="num-ro">${qtdGeral}</td><td></td><td class="num-ro">${moeda(totalGeral)}</td><td class="num-ro">${moeda(totalAberto)}</td><td></td></tr>
        <tr class="total"><td colspan="5">Ainda a receber (de hoje em diante)</td><td class="num-ro">${moeda(aindaReceber)}</td><td></td></tr>
      </tbody>
    </table>
    <div class="nota-rodape">Calculado a partir da aba Carros e notas. Marque a nota como "Pago" lá quando o dinheiro cair.</div>`;
}

// ===== aba: recebimentos =====
const COLS_REC = [
  ['data', 'Data do crédito', 'date', 150],
  ['concessionaria', 'Concessionária', '', 220],
  ['tipo', 'Tipo', '', 130],
  ['valor', 'Valor recebido (R$)', 'valor', 160],
  ['cnpj', 'CNPJ do pagador', '', 180],
  ['obs', 'Observação', '', 380],
];

function renderRecebimentos() {
  const lista = dados.recebimentos.filter(bate).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const porEmpresa = {};
  for (const r of dados.recebimentos) {
    const k = (r.concessionaria || 'Sem nome').trim();
    porEmpresa[k] ??= { qtd: 0, total: 0 };
    porEmpresa[k].qtd++; porEmpresa[k].total += Number(r.valor) || 0;
  }
  const resumo = Object.entries(porEmpresa).sort((a, b) => b[1].total - a[1].total);
  const total = resumo.reduce((s, [, v]) => s + v.total, 0);

  $('#grade').innerHTML = `
    <table class="grade">
      <thead><tr><th>Concessionária</th><th class="num">Quantidade</th><th class="num">Total recebido (R$)</th></tr></thead>
      <tbody>
        ${resumo.map(([k, v]) => `<tr><td class="ro">${esc(k)}</td><td class="num-ro">${v.qtd}</td><td class="num-ro">${moeda(v.total)}</td></tr>`).join('')}
        <tr class="total"><td>TOTAL</td><td class="num-ro">${dados.recebimentos.length}</td><td class="num-ro">${moeda(total)}</td></tr>
      </tbody>
    </table>
    <table class="grade grade-fixa" style="margin-top:18px">
      ${colgroup(COLS_REC)}
      <thead><tr>${COLS_REC.map(([, t, tipo]) => `<th class="${tipo === 'valor' ? 'num' : ''}">${t}</th>`).join('')}<th class="col-x"></th></tr></thead>
      <tbody>${lista.length ? lista.map(r => `<tr>${COLS_REC.map(col => celula('recebimentos', r, col)).join('')}
        <td class="col-x"><button class="del" data-del="recebimentos" data-id="${esc(r.id)}" title="Apagar linha">×</button></td></tr>`).join('')
        : `<tr><td colspan="${COLS_REC.length + 1}" class="ro">Nenhum recebimento lançado.</td></tr>`}</tbody>
    </table>
    <div class="nota-rodape">Os créditos do extrato não identificam a nota ou a placa. Quando souber a qual nota um crédito pertence, marque a nota como "Pago" na aba Carros e notas.</div>`;
}

// ===== aba: dados para NF =====
function textoNF() {
  const d = dados.dadosNF;
  const pag = dataBR(somarDias(hojeISO(), PRAZO_PADRAO));
  return `PAGAMENTO: ${pag} | BANCO: ${(d.banco || '').toUpperCase()} | AGÊNCIA: ${d.agencia} | CONTA CORRENTE: ${d.conta} | CNPJ: ${d.cnpj}`;
}

function renderDadosNF() {
  const d = dados.dadosNF;
  const campo = (c, rot, tipo = 'text') => `<label class="campo"><span>${rot}</span><input type="${tipo}" data-t="dadosNF" data-c="${c}" value="${esc(d[c] || '')}" /></label>`;
  $('#grade').innerHTML = `
    <div class="dados-nf">
      <h3 class="dados-titulo">Informações da GLPS</h3>
      <div class="linha">${campo('email', 'E-mail da empresa', 'email')}${campo('cnpj', 'CNPJ da GLPS')}</div>
      <h3 class="dados-titulo">Dados para a nota fiscal</h3>
      <p class="dica">Pagamento previsto: hoje + ${PRAZO_PADRAO} dias corridos (${dataBR(somarDias(hojeISO(), PRAZO_PADRAO))}).</p>
      <div class="linha">${campo('banco', 'Banco')}${campo('agencia', 'Agência')}${campo('conta', 'Conta corrente')}</div>
      <div class="copiavel"><span>Texto para copiar nas notas</span>
        <div><code class="texto-nf" id="texto-nf">${esc(textoNF())}</code><button class="btn btn-secundario" id="btn-copiar-nf">Copiar</button></div>
      </div>
    </div>`;
}

// ===== edição =====
function achar(tabela, id) { return dados[tabela].find(x => x.id === id); }

// Re-renderiza depois da troca de foco e devolve o foco para a célula que o usuário acabou de entrar
function rerender() {
  setTimeout(() => {
    const a = document.activeElement;
    const alvo = a?.dataset?.c ? { t: a.dataset.t, id: a.dataset.id, c: a.dataset.c } : null;
    render();
    if (alvo) {
      const el = $(`[data-t="${alvo.t}"][data-c="${alvo.c}"]${alvo.id ? `[data-id="${CSS.escape(alvo.id)}"]` : ''}`);
      el?.focus();
    }
  }, 0);
}

$('#grade').addEventListener('change', e => {
  const el = e.target;
  if (el.classList.contains('sel-nota')) {
    el.checked ? selecionadas.add(el.dataset.id) : selecionadas.delete(el.dataset.id);
    el.closest('tr').classList.toggle('selecionada', el.checked);
    atualizarBotaoBoleto();
    return;
  }
  const { t, id, c } = el.dataset;
  if (!t || !c) return;
  if (t === 'dadosNF') {
    dados.dadosNF[c] = el.value.trim();
    $('#texto-nf').textContent = textoNF();
    marcarAlterado();
    return;
  }
  const item = achar(t, id);
  if (!item) return;
  let v = el.value;
  if (c === 'valor') v = numero(v);
  else if (c === 'prazo') v = v === '' ? PRAZO_PADRAO : Math.max(0, parseInt(v, 10) || 0);
  else if (c === 'placa') v = v.trim().toUpperCase();
  else v = v.trim();
  item[c] = v;
  marcarAlterado();
  rerender();
});

// Enter desce para a linha de baixo, como numa planilha
$('#grade').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const { c } = e.target.dataset;
  const mesmas = $$(`#grade [data-c="${c}"]`);
  const i = mesmas.indexOf(e.target);
  (mesmas[i + 1] || e.target).focus();
});

$('#grade').addEventListener('click', e => {
  const gerar = e.target.closest('[data-gerar]');
  if (gerar) { abrirBoleto([gerar.dataset.gerar]); return; }
  const cop = e.target.closest('[data-copiar-bol]');
  if (cop) {
    e.preventDefault();
    const b = achar('carros', cop.dataset.copiarBol)?.boleto;
    const link = b?.invoiceUrl || b?.bankSlipUrl;
    if (link) navigator.clipboard.writeText(link).then(() => avisar('Link do boleto copiado.'), () => prompt('Copie:', link));
    return;
  }
  const canc = e.target.closest('[data-cancelar-bol]');
  if (canc) {
    e.preventDefault();
    const nota = achar('carros', canc.dataset.cancelarBol);
    const b = nota?.boleto;
    if (!b || !confirm(`Cancelar o boleto de ${moeda(b.valor)} (NF ${(b.notas || [nota.nota]).join(', ')})? A concessionária não vai mais conseguir pagar.`)) return;
    api('boleto-notas?id=' + encodeURIComponent(b.id), { method: 'DELETE' }).then(() => {
      dados.carros.forEach(c => { if (c.boleto?.id === b.id) delete c.boleto; });
      marcarAlterado(); render(); avisar('Boleto cancelado.');
    }, err => avisar(err.message));
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const t = del.dataset.del;
    const item = achar(t, del.dataset.id);
    const nome = t === 'carros' ? `a nota ${item?.nota || '(sem número)'}` : 'este recebimento';
    const avisoBol = item?.boleto ? '\n\nEssa nota tem boleto no Asaas. Apagar aqui NÃO cancela o boleto (cancele em Cobranças).' : '';
    if (!confirm(`Apagar ${nome}?${avisoBol}`)) return;
    dados[t] = dados[t].filter(x => x.id !== del.dataset.id);
    marcarAlterado();
    render();
    return;
  }
  if (e.target.id === 'btn-copiar-nf') {
    navigator.clipboard.writeText(textoNF()).then(() => avisar('Texto copiado.'), () => prompt('Copie:', textoNF()));
  }
});

$('#btn-linha').addEventListener('click', () => {
  busca = ''; $('#busca').value = '';
  if (aba === 'carros') {
    const ultima = Math.max(0, ...dados.carros.map(c => Number(c.nota) || 0));
    const nova = { id: novoId(), nota: ultima ? String(ultima + 1) : '', concessionaria: '', carro: '', placa: '', valor: 0, data: hojeISO(), prazo: PRAZO_PADRAO, situacao: 'A receber', triagem: '', cnpj: '', obs: '' };
    dados.carros.push(nova);
    render();
    const el = $(`[data-t="carros"][data-id="${nova.id}"][data-c="concessionaria"]`);
    el?.scrollIntoView({ block: 'center' }); el?.focus();
  } else {
    const nova = { id: novoId(), data: hojeISO(), concessionaria: '', tipo: 'TED', valor: 0, cnpj: '', obs: '' };
    dados.recebimentos.push(nova);
    render();
    const el = $(`[data-t="recebimentos"][data-id="${nova.id}"][data-c="concessionaria"]`);
    el?.scrollIntoView({ block: 'center' }); el?.focus();
  }
  marcarAlterado();
});

function vazioFolha(msg) {
  $('#grade').innerHTML = `<div class="vazio-folha">${esc(msg)}<br />
    <button class="btn btn-primario" onclick="document.getElementById('btn-importar').click()">Importar planilha .xlsx</button></div>`;
}

// ===== boleto a partir das notas =====
function atualizarBotaoBoleto() {
  const btn = $('#btn-boleto');
  const notas = [...selecionadas].map(id => achar('carros', id)).filter(Boolean);
  if (aba !== 'carros' || !notas.length) { btn.hidden = true; return; }
  const total = notas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  btn.textContent = `Gerar boleto · ${notas.length} nota${notas.length === 1 ? '' : 's'} · ${moeda(total)}`;
  btn.hidden = false;
}
$('#btn-boleto').addEventListener('click', () => abrirBoleto([...selecionadas]));

let notasBoleto = [];
function abrirBoleto(ids) {
  const notas = ids.map(id => achar('carros', id)).filter(Boolean);
  const comBoleto = notas.filter(c => c.boleto);
  if (comBoleto.length) return avisar(`A nota ${comBoleto.map(c => c.nota).join(', ')} já tem boleto. Desmarque para continuar.`);
  const cnpjs = new Set(notas.map(c => String(c.cnpj || '').replace(/\D/g, '')));
  if (cnpjs.size > 1) return avisar('Selecione só notas da mesma concessionária (mesmo CNPJ) para juntar num boleto.');
  const n0 = notas[0];
  if (!String(n0.cnpj || '').replace(/\D/g, '')) return avisar(`Preencha o CNPJ da concessionária na nota ${n0.nota}.`);

  notasBoleto = notas;
  const total = notas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  // Vence no último vencimento previsto das notas; se já passou, daqui a 3 dias
  const venc = notas.map(vencimento).filter(Boolean).sort().pop();
  const minimo = hojeISO();
  const f = $('#form-boleto');
  $('#bol-nome').textContent = n0.concessionaria || '—';
  $('#bol-cnpj').textContent = n0.cnpj;
  $('#bol-notas').textContent = notas.map(c => c.nota).join(', ');
  $('#bol-total').textContent = moeda(total);
  f.vencimento.min = minimo;
  f.vencimento.value = venc && venc >= minimo ? venc : somarDias(minimo, 3);
  f.descricao.value = `NF ${notas.map(c => c.nota).join(', ')} · ` +
    notas.map(c => [c.carro, c.placa].filter(Boolean).join(' ')).filter(Boolean).join('; ');
  f.descricao.value = f.descricao.value.slice(0, 500);
  $('#bol-dica').textContent = venc && venc < minimo
    ? `O vencimento previsto (${dataBR(venc)}) já passou, então sugeri daqui a 3 dias.`
    : 'Vencimento sugerido: o vencimento previsto das notas (data + prazo).';
  $('#bol-erro').hidden = true;
  $('#modal-boleto').showModal();
}

$('#form-boleto').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const btn = $('#bol-gerar');
  btn.disabled = true; btn.textContent = 'Gerando…';
  $('#bol-erro').hidden = true;
  try {
    const n0 = notasBoleto[0];
    const p = await api('boleto-notas', {
      method: 'POST',
      body: {
        cnpj: n0.cnpj,
        nome: n0.concessionaria,
        notas: notasBoleto.map(c => c.nota),
        valor: notasBoleto.reduce((s, c) => s + (Number(c.valor) || 0), 0),
        vencimento: f.vencimento.value,
        descricao: f.descricao.value,
      },
    });
    const boleto = { id: p.id, status: p.status, vencimento: p.dueDate, valor: p.value, bankSlipUrl: p.bankSlipUrl, invoiceUrl: p.invoiceUrl, notas: notasBoleto.map(c => c.nota) };
    notasBoleto.forEach(c => { c.boleto = boleto; selecionadas.delete(c.id); });
    $('#modal-boleto').close();
    marcarAlterado();
    render();
    avisar('Boleto gerado no Asaas.');
    if (p.bankSlipUrl) window.open(p.bankSlipUrl, '_blank', 'noopener');
  } catch (err) {
    $('#bol-erro').textContent = err.message;
    $('#bol-erro').hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Gerar boleto no Asaas';
  }
});

$$('dialog').forEach(d => d.addEventListener('click', e => {
  if (e.target === d || e.target.closest('[data-fechar]')) d.close();
}));

// Consulta o Asaas e atualiza as notas: boleto pago marca a nota como Pago; boleto apagado libera a nota
async function sincronizarBoletos() {
  const abertos = [...new Set(dados.carros.filter(c => c.boleto && !PAGO.includes(c.boleto.status)).map(c => c.boleto.id))];
  if (!abertos.length) return;
  let mudou = false;
  for (let i = 0; i < abertos.length; i += 50) {
    let r;
    try { r = await api('boleto-notas?ids=' + abertos.slice(i, i + 50).join(',')); } catch { return; }
    for (const b of r.data || []) {
      if (b.erro) continue;
      for (const c of dados.carros.filter(x => x.boleto?.id === b.id)) {
        if (b.status === 'DELETED') { delete c.boleto; mudou = true; continue; }
        if (c.boleto.status !== b.status) { c.boleto.status = b.status; mudou = true; }
        if (PAGO.includes(b.status) && c.situacao !== 'Pago') { c.situacao = 'Pago'; mudou = true; }
      }
    }
  }
  if (mudou) { marcarAlterado(); render(); avisar('Situação dos boletos atualizada.'); }
}

// ===== importar / exportar .xlsx =====
let xlsxPronto;
function carregarXLSX() {
  xlsxPronto ??= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ok;
    s.onerror = () => { xlsxPronto = null; falha(new Error('Não foi possível carregar o leitor de planilhas.')); };
    document.head.appendChild(s);
  });
  return xlsxPronto;
}

const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function dataDe(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : '';
  }
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

// Acha a linha de cabeçalho que contém todas as colunas pedidas e devolve {linha, col: {nome: índice}}
function cabecalho(rows, obrigatorias) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const nomes = (rows[i] || []).map(semAcento);
    if (obrigatorias.every(o => nomes.some(n => n.startsWith(o)))) {
      const col = {};
      nomes.forEach((n, j) => { if (n && !(n in col)) col[n] = j; });
      const acha = prefixo => { const k = Object.keys(col).find(n => n.startsWith(prefixo)); return k == null ? -1 : col[k]; };
      return { linha: i, acha };
    }
  }
  return null;
}

function lerPlanilha(wb) {
  const folha = nome => {
    const k = wb.SheetNames.find(n => semAcento(n) === semAcento(nome));
    return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, raw: true, defval: null }) : null;
  };
  const resultado = vazio();

  // Triagem vem da aba Notas
  const triagens = {};
  const notas = folha('Notas');
  if (notas) {
    const h = cabecalho(notas, ['nota', 'triagem']);
    if (h) for (const r of notas.slice(h.linha + 1)) {
      const n = r[h.acha('nota')];
      const t = r[h.acha('triagem')];
      if (typeof n === 'number' && t != null && t !== '') triagens[n] = String(t);
    }
    // Dados bancários para NF
    for (const r of notas) {
      const rot = semAcento(r?.[1]);
      const val = r?.[2];
      if (val == null || typeof val !== 'string' && typeof val !== 'number') continue;
      if (rot === 'banco') resultado.dadosNF.banco = String(val);
      if (rot === 'agencia') resultado.dadosNF.agencia = String(val);
      if (rot === 'conta corrente') resultado.dadosNF.conta = String(val);
      if (rot === 'cnpj da glps') resultado.dadosNF.cnpj = String(val);
    }
  }

  const carros = folha('Carros') || (wb.SheetNames[0] && XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }));
  const h = carros && cabecalho(carros, ['nota', 'valor']);
  if (!h) throw new Error('Não encontrei a aba "Carros" com as colunas Nota e Valor.');
  const C = {
    nota: h.acha('nota'), conc: h.acha('concession'), carro: h.acha('carro'), placa: h.acha('placa'),
    valor: h.acha('valor'), data: h.acha('data da nota'), prazo: h.acha('prazo'), triagem: h.acha('triagem'),
    cnpj: h.acha('cnpj'), fonte: h.acha('fonte'), venc: h.acha('vencimento'),
  };
  const pega = (r, i) => (i >= 0 ? r[i] : null);
  for (const r of carros.slice(h.linha + 1)) {
    const nota = pega(r, C.nota);
    if (typeof nota !== 'number') continue; // pula linhas de total e observações
    const data = dataDe(pega(r, C.data));
    let prazo = Number(pega(r, C.prazo));
    if (!prazo && data && C.venc >= 0) {
      const v = dataDe(pega(r, C.venc));
      if (v) prazo = Math.round((new Date(v) - new Date(data)) / 864e5);
    }
    const triagem = pega(r, C.triagem) || triagens[nota] || '';
    resultado.carros.push({
      id: novoId(),
      nota: String(nota),
      concessionaria: String(pega(r, C.conc) ?? ''),
      carro: String(pega(r, C.carro) ?? ''),
      placa: String(pega(r, C.placa) ?? '').toUpperCase(),
      valor: numero(pega(r, C.valor)),
      data,
      prazo: prazo || PRAZO_PADRAO,
      situacao: 'A receber',
      triagem: String(triagem),
      cnpj: String(pega(r, C.cnpj) ?? ''),
      obs: String(pega(r, C.fonte) ?? ''),
    });
  }

  const rec = folha('Recebimentos');
  const hr = rec && cabecalho(rec, ['data do credito', 'valor']);
  if (hr) {
    const R = { data: hr.acha('data do credito'), conc: hr.acha('concession'), tipo: hr.acha('tipo'), valor: hr.acha('valor'), cnpj: hr.acha('cnpj'), fonte: hr.acha('fonte') };
    for (const r of rec.slice(hr.linha + 1)) {
      const data = dataDe(r[R.data]);
      if (!data) continue;
      resultado.recebimentos.push({
        id: novoId(), data,
        concessionaria: String(r[R.conc] ?? ''), tipo: String(r[R.tipo] ?? ''),
        valor: numero(r[R.valor]), cnpj: String(r[R.cnpj] ?? ''), obs: String(r[R.fonte] ?? ''),
      });
    }
  }
  return resultado;
}

$('#btn-importar').addEventListener('click', () => $('#arquivo').click());
$('#arquivo').addEventListener('change', async e => {
  const arq = e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  try {
    await carregarXLSX();
    const wb = XLSX.read(await arq.arrayBuffer(), { type: 'array' });
    const novo = lerPlanilha(wb);
    const temDados = dados.carros.length || dados.recebimentos.length;
    if (temDados && !confirm(`Encontrei ${novo.carros.length} notas e ${novo.recebimentos.length} recebimentos.\n\nIsso vai SUBSTITUIR a planilha atual (${dados.carros.length} notas). Continuar?`)) return;
    // Mantém as notas já marcadas como pagas
    const pagas = new Set(dados.carros.filter(c => c.situacao === 'Pago').map(c => c.nota));
    novo.carros.forEach(c => { if (pagas.has(c.nota)) c.situacao = 'Pago'; });
    if (!novo.dadosNF.banco) novo.dadosNF = dados.dadosNF;
    dados = { ...novo, versao: dados.versao };
    marcarAlterado();
    render();
    avisar(`Importado: ${novo.carros.length} notas e ${novo.recebimentos.length} recebimentos.`);
  } catch (err) { avisar(err.message); }
});

$('#btn-exportar').addEventListener('click', async () => {
  try {
    await carregarXLSX();
    const wb = XLSX.utils.book_new();
    const carros = [...dados.carros].sort((a, b) => (a.data || '').localeCompare(b.data || '') || (Number(a.nota) || 0) - (Number(b.nota) || 0));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nota', 'Concessionária', 'Carro', 'Placa', 'Valor (R$)', 'Data da nota', 'Prazo (dias)', 'Vencimento', 'Situação', 'Boleto', 'Triagem', 'CNPJ', 'Observação'],
      ...carros.map(c => [Number(c.nota) || c.nota, c.concessionaria, c.carro, c.placa, Number(c.valor) || 0, dataBR(c.data), c.prazo, dataBR(vencimento(c)), situacao(c)[0], c.boleto ? (STATUS_BOLETO[c.boleto.status]?.[0] || c.boleto.status) + ' · ' + (c.boleto.invoiceUrl || '') : '', c.triagem, c.cnpj, c.obs]),
      [], ['TOTAL', '', '', '', carros.reduce((s, c) => s + (Number(c.valor) || 0), 0)],
    ]), 'Carros');

    const venc = {};
    for (const c of carros) { const v = vencimento(c); if (v) (venc[v] ??= []).push(c); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Data de pagamento', 'Dia da semana', 'Qtde de notas', 'Notas', 'Valor total (R$)', 'Falta receber (R$)'],
      ...Object.keys(venc).sort().map(v => [dataBR(v), diaSemana(v), venc[v].length, venc[v].map(c => c.nota).join(', '),
        venc[v].reduce((s, c) => s + (Number(c.valor) || 0), 0),
        venc[v].filter(c => c.situacao !== 'Pago').reduce((s, c) => s + (Number(c.valor) || 0), 0)]),
    ]), 'Vencimentos');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Data do crédito', 'Concessionária', 'Tipo', 'Valor recebido (R$)', 'CNPJ do pagador', 'Observação'],
      ...[...dados.recebimentos].sort((a, b) => (a.data || '').localeCompare(b.data || '')).map(r => [dataBR(r.data), r.concessionaria, r.tipo, Number(r.valor) || 0, r.cnpj, r.obs]),
    ]), 'Recebimentos');

    XLSX.writeFile(wb, `Controle_carros_GLPS_${hojeISO()}.xlsx`);
  } catch (err) { avisar(err.message); }
});

// ===== sessão =====
$('#btn-sair').addEventListener('click', async () => {
  await api('sessao', { method: 'DELETE' }).catch(() => {});
  location.href = '/';
});

window.addEventListener('beforeunload', e => {
  if ($('#salvo').textContent.startsWith('Alterações') || salvando) { e.preventDefault(); e.returnValue = ''; }
});

api('sessao').then(r => {
  if (!r.logado) return (location.href = '/');
  // Com a Efí, a tela de Cobranças (feita para o Asaas) fica escondida
  if (r.provedor === 'efi') $('#link-cobrancas').hidden = true;
  $('#ambiente').textContent = r.provedor === 'efi' ? 'Efí · homologação' : 'Sandbox';
  $('#ambiente').hidden = r.ambiente !== 'sandbox';
  carregar();
}).catch(() => (location.href = '/'));
