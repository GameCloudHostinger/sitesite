// Área do cliente. Toda consulta depende do RLS: o cliente só enxerga o que é dele.
import { supabase, requireUser, isAdmin } from './supabase.js';
import { CONFIG, waLink } from './config.js';
import {
  money, statusChip, formatDate, formatDateTime, expiryState, escapeHtml,
  toast, showAlert, authErrorMessage, ORDER_STATUS, SERVER_STATUS,
  TICKET_STATUS, TICKET_PRIORITY,
} from './ui.js';

let user = null;
let orders = [];
let servers = [];

// ---------------- Navegação ----------------
const views = document.querySelectorAll('[data-panel]');
const links = document.querySelectorAll('.side-nav a');
const titles = {
  dashboard: 'Dashboard', pedidos: 'Meus pedidos', servidores: 'Meus servidores',
  pagamentos: 'Pagamentos', comprovantes: 'Comprovantes', renovacao: 'Renovação',
  suporte: 'Suporte', configuracoes: 'Configurações',
};

function showView(name) {
  const view = titles[name] ? name : 'dashboard';
  views.forEach((v) => { v.hidden = v.dataset.panel !== view; });
  links.forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  document.getElementById('viewTitle').textContent = titles[view];
  document.body.classList.remove('nav-open');
  if (view === 'suporte') loadTickets();
}

window.addEventListener('hashchange', () => showView(location.hash.replace('#', '')));
document.getElementById('burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));

// ---------------- Render ----------------
function ordersTable(list, { compact = false } = {}) {
  if (!list.length) {
    return `<div class="empty"><h3>Nenhum pedido ainda</h3><p>Escolha um plano e seu primeiro pedido aparece aqui.</p>
      <a class="btn btn-primary btn-sm" href="index.html#planos">Ver planos</a></div>`;
  }
  const rows = list.map((o) => `
    <tr>
      <td class="mono">${escapeHtml(o.order_number)}</td>
      <td>${escapeHtml(o.product_name)}</td>
      <td>${money(o.amount_cents)}</td>
      <td>${statusChip(o.status)}</td>
      ${compact ? '' : `<td>${formatDateTime(o.created_at)}</td>`}
      <td><a class="btn btn-light btn-sm" href="pedido.html?n=${encodeURIComponent(o.order_number)}">Abrir</a></td>
    </tr>`).join('');
  return `<table class="data">
    <thead><tr><th>Número</th><th>Produto</th><th>Valor</th><th>Status</th>${compact ? '' : '<th>Data</th>'}<th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function serverCard(s) {
  const exp = expiryState(s.expires_at);
  return `<article class="server-card">
    <div class="panel-head" style="margin-bottom:.2rem">
      <h3>${escapeHtml(s.name)}</h3>
      <span class="chip chip-${s.status}">${SERVER_STATUS[s.status] ?? s.status}</span>
    </div>
    <div style="color:#66768a;font-size:.88rem">${escapeHtml(s.game || '')} · ${escapeHtml(s.plan_name || '')}</div>
    <dl class="kv">
      <dt>Endereço</dt><dd class="mono">${escapeHtml(s.ip || '—')}${s.port ? ':' + s.port : ''}</dd>
      <dt>RAM</dt><dd>${s.ram_mb ? (s.ram_mb / 1024) + ' GB' : '—'}</dd>
      <dt>CPU</dt><dd>${escapeHtml(s.cpu || '—')}</dd>
      <dt>Armazenamento</dt><dd>${s.storage_gb ? s.storage_gb + ' GB SSD NVMe' : '—'}</dd>
      <dt>Usuário</dt><dd>${escapeHtml(s.panel_username || user.email)}</dd>
      <dt>Senha</dt><dd>definida por você no painel · <a href="recuperar-senha.html">redefinir</a></dd>
      <dt>Vencimento</dt><dd>${exp.icon} ${escapeHtml(exp.label)}</dd>
    </dl>
    <div class="actions">
      <a class="btn btn-primary btn-sm" href="${escapeHtml(s.panel_url || CONFIG.PTERODACTYL_PANEL_URL)}" target="_blank" rel="noopener">Abrir painel</a>
      <a class="btn btn-light btn-sm" href="#suporte">Pedir ajuda</a>
    </div>
  </article>`;
}

function renderDashboard() {
  const active = servers.filter((s) => s.status === 'active').length;
  const pending = orders.filter((o) => ['awaiting_pix', 'proof_received'].includes(o.status)).length;
  const next = servers
    .filter((s) => s.expires_at)
    .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))[0];

  document.getElementById('clientStats').innerHTML = `
    <div class="stat accent"><span>Servidores ativos</span><strong>${active}</strong></div>
    <div class="stat"><span>Pedidos em aberto</span><strong>${pending}</strong></div>
    <div class="stat"><span>Total de pedidos</span><strong>${orders.length}</strong></div>
    <div class="stat"><span>Próximo vencimento</span><strong>${next ? formatDate(next.expires_at) : '—'}</strong></div>`;

  document.getElementById('recentOrders').innerHTML = ordersTable(orders.slice(0, 5), { compact: true });
  document.getElementById('recentServers').innerHTML = servers.length
    ? servers.slice(0, 2).map(serverCard).join('')
    : `<div class="empty"><h3>Nenhum servidor ainda</h3><p>Assim que o pagamento for confirmado, o servidor aparece aqui com IP, porta e acesso ao painel.</p></div>`;
}

function renderServers() {
  document.getElementById('serversList').innerHTML = servers.length
    ? servers.map(serverCard).join('')
    : `<div class="empty"><h3>Nenhum servidor ainda</h3><p>Contrate um plano para começar.</p>
       <a class="btn btn-primary btn-sm" href="index.html#planos">Ver planos</a></div>`;
}

async function renderPayments() {
  const { data } = await supabase
    .from('payments')
    .select('id, amount_cents, status, gateway, paid_at, created_at, orders(order_number, product_name)')
    .order('created_at', { ascending: false });

  const list = data || [];
  document.getElementById('paymentsTable').innerHTML = list.length
    ? `<table class="data"><thead><tr><th>Pedido</th><th>Produto</th><th>Valor</th><th>Situação</th><th>Pago em</th></tr></thead><tbody>
       ${list.map((p) => `<tr>
          <td class="mono">${escapeHtml(p.orders?.order_number || '—')}</td>
          <td>${escapeHtml(p.orders?.product_name || '—')}</td>
          <td>${money(p.amount_cents)}</td>
          <td>${escapeHtml(p.status)}</td>
          <td>${formatDateTime(p.paid_at)}</td></tr>`).join('')}
       </tbody></table>`
    : `<div class="empty"><h3>Sem pagamentos registrados</h3><p>Os pagamentos confirmados pelo provedor aparecem aqui.</p></div>`;
}

function renderProofs() {
  const list = orders.filter((o) => o.proof_path);
  document.getElementById('proofsTable').innerHTML = list.length
    ? `<table class="data"><thead><tr><th>Pedido</th><th>Enviado em</th><th>Status</th><th></th></tr></thead><tbody>
       ${list.map((o) => `<tr>
          <td class="mono">${escapeHtml(o.order_number)}</td>
          <td>${formatDateTime(o.proof_sent_at)}</td>
          <td>${statusChip(o.status)}</td>
          <td><button class="btn btn-light btn-sm" data-proof="${escapeHtml(o.proof_path)}">Ver arquivo</button></td>
        </tr>`).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nenhum comprovante enviado</h3><p>Você pode anexar o comprovante na página do pedido.</p></div>`;
}

function renderRenewals() {
  const list = servers.filter((s) => s.expires_at);
  document.getElementById('renewTable').innerHTML = list.length
    ? `<table class="data"><thead><tr><th>Servidor</th><th>Plano</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>
       ${list.map((s) => {
         const e = expiryState(s.expires_at);
         return `<tr>
           <td>${escapeHtml(s.name)}</td>
           <td>${escapeHtml(s.plan_name || '—')}</td>
           <td>${formatDate(s.expires_at)}</td>
           <td>${e.icon} ${escapeHtml(e.label)}</td>
           <td><a class="btn btn-primary btn-sm" href="index.html#planos">Renovar</a></td></tr>`;
       }).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nada vencendo</h3><p>Quando você tiver um serviço ativo, o vencimento aparece aqui.</p></div>`;
}

// ---------------- Comprovante: abre por URL assinada e temporária ----------------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-proof]');
  if (!btn) return;
  const { data, error } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(btn.dataset.proof, 60);
  if (error) return toast('Não foi possível abrir o comprovante.', 'error');
  window.open(data.signedUrl, '_blank', 'noopener');
});

// ---------------- Suporte ----------------
async function loadTickets() {
  const { data } = await supabase
    .from('tickets')
    .select('id, subject, category, priority, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  const list = data || [];
  document.getElementById('ticketsTable').innerHTML = list.length
    ? `<table class="data"><thead><tr><th>Assunto</th><th>Categoria</th><th>Prioridade</th><th>Status</th><th>Aberto em</th><th></th></tr></thead><tbody>
       ${list.map((t) => `<tr>
          <td>${escapeHtml(t.subject)}</td>
          <td>${escapeHtml(t.category)}</td>
          <td>${TICKET_PRIORITY[t.priority] ?? t.priority}</td>
          <td>${TICKET_STATUS[t.status] ?? t.status}</td>
          <td>${formatDateTime(t.created_at)}</td>
          <td><button class="btn btn-light btn-sm" data-ticket="${t.id}">Ver conversa</button></td>
        </tr>`).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nenhum chamado aberto</h3><p>Use o formulário acima quando precisar de ajuda.</p></div>`;
}

document.getElementById('ticketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const box = document.getElementById('ticketMsg');
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;

  const { data: ticket, error } = await supabase.from('tickets').insert({
    user_id: user.id,
    subject: form.subject.value.trim(),
    category: form.category.value,
    priority: form.priority.value,
  }).select().single();

  if (error) { btn.disabled = false; return showAlert(box, error.message, 'error'); }

  const { error: msgError } = await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    user_id: user.id,
    is_staff: false,
    message: form.message.value.trim(),
  });

  btn.disabled = false;
  if (msgError) return showAlert(box, msgError.message, 'error');
  showAlert(box, `Chamado aberto. Respondemos no e-mail ${user.email}.`, 'ok');
  form.reset();
  loadTickets();
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-ticket]');
  if (!btn) return;
  const { data } = await supabase
    .from('ticket_messages')
    .select('id, message, is_staff, created_at')
    .eq('ticket_id', btn.dataset.ticket)
    .order('created_at');

  const thread = document.getElementById('ticketThread');
  thread.innerHTML = `<div class="panel" style="margin-top:1rem">
    <h2>Conversa</h2>
    ${(data || []).map((m) => `
      <div style="border-left:3px solid ${m.is_staff ? 'var(--green-deep)' : '#dde4ec'};padding:.6rem .9rem;margin-bottom:.7rem">
        <div style="font-size:.78rem;color:#66768a">${m.is_staff ? 'GameCloudHostinger' : 'Você'} · ${formatDateTime(m.created_at)}</div>
        <div>${escapeHtml(m.message)}</div>
      </div>`).join('')}
    <form id="replyForm" style="margin-top:1rem">
      <div class="field"><label for="reply">Responder</label><textarea id="reply" rows="3" required></textarea></div>
      <button class="btn btn-light btn-sm" type="submit">Enviar resposta</button>
    </form>
  </div>`;

  document.getElementById('replyForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const message = document.getElementById('reply').value.trim();
    if (!message) return;
    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: btn.dataset.ticket, user_id: user.id, is_staff: false, message,
    });
    if (error) return toast(error.message, 'error');
    toast('Resposta enviada.');
    btn.click();
  });
});

// ---------------- Configurações ----------------
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = document.getElementById('profileMsg');
  const { error } = await supabase.from('profiles').update({
    full_name: document.getElementById('pfName').value.trim(),
    phone: document.getElementById('pfPhone').value.trim(),
  }).eq('id', user.id);
  showAlert(box, error ? error.message : 'Dados atualizados.', error ? 'error' : 'ok');
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = document.getElementById('passMsg');
  const password = document.getElementById('newPass').value;
  if (password.length < 8) return showAlert(box, 'Use pelo menos 8 caracteres.', 'error');
  const { error } = await supabase.auth.updateUser({ password });
  showAlert(box, error ? authErrorMessage(error) : 'Senha alterada.', error ? 'error' : 'ok');
  if (!error) e.target.reset();
});

// ---------------- Logout ----------------
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-logout]')) {
    e.preventDefault();
    await supabase.auth.signOut();
    location.href = 'index.html';
  }
});

// ---------------- Boot ----------------
(async function init() {
  user = await requireUser();
  if (!user) return;

  document.getElementById('waTicket').href = waLink(`Olá! Sou cliente ${CONFIG.COMPANY_NAME} (${user.email}) e preciso de ajuda.`);

  const [{ data: profile }, ordersRes, serversRes, admin] = await Promise.all([
    supabase.from('profiles').select('full_name, email, phone').eq('id', user.id).maybeSingle(),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('servers').select('*').order('created_at', { ascending: false }),
    isAdmin(),
  ]);

  orders  = ordersRes.data || [];
  servers = serversRes.data || [];

  document.getElementById('whoAmI').textContent = `${profile?.full_name || 'Cliente'} · ${user.email}`;
  document.getElementById('pfName').value  = profile?.full_name || '';
  document.getElementById('pfPhone').value = profile?.phone || '';
  document.getElementById('pfEmail').value = user.email;
  if (admin) document.getElementById('adminLink').hidden = false;

  renderDashboard();
  document.getElementById('ordersTable').innerHTML = ordersTable(orders);
  renderServers();
  renderProofs();
  renderRenewals();
  renderPayments();

  showView(location.hash.replace('#', '') || 'dashboard');
})();
