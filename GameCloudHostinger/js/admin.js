// Painel administrativo.
// A tela só aparece se is_admin() retornar true — e mesmo que alguém force
// a interface, o RLS do Supabase bloqueia qualquer escrita de não-admin.
import { supabase, requireUser, isAdmin, callFunction } from './supabase.js';
import {
  money, statusChip, formatDate, formatDateTime, escapeHtml, toast, showAlert,
  ORDER_STATUS, SERVER_STATUS, TICKET_STATUS, TICKET_PRIORITY, expiryState,
} from './ui.js';

let me = null;
let cache = { orders: [], customers: [], servers: [], products: [], categories: [], tickets: [] };

const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
function openModal(html) { modalBody.innerHTML = html; modal.showModal(); }
function closeModal() { modal.close(); }
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });

// ---------------- Navegação ----------------
const titles = {
  dashboard: 'Dashboard', clientes: 'Clientes', pedidos: 'Pedidos', servidores: 'Servidores',
  produtos: 'Produtos', tickets: 'Suporte', configuracoes: 'Configurações',
};
function showView(name) {
  const view = titles[name] ? name : 'dashboard';
  document.querySelectorAll('[data-panel]').forEach((v) => { v.hidden = v.dataset.panel !== view; });
  document.querySelectorAll('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  document.getElementById('viewTitle').textContent = titles[view];
  document.body.classList.remove('nav-open');
}
window.addEventListener('hashchange', () => showView(location.hash.replace('#', '')));

// ---------------- Carregamento ----------------
async function loadAll() {
  const [stats, orders, customers, servers, products, categories, tickets] = await Promise.all([
    supabase.rpc('admin_stats'),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, email, phone, created_at').order('created_at', { ascending: false }),
    supabase.from('servers').select('*').order('created_at', { ascending: false }),
    supabase.from('products').select('*, categories(slug, name)').order('sort_order'),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('tickets').select('*').order('created_at', { ascending: false }),
  ]);

  cache = {
    orders: orders.data || [], customers: customers.data || [], servers: servers.data || [],
    products: products.data || [], categories: categories.data || [], tickets: tickets.data || [],
  };

  const s = stats.data || {};
  document.getElementById('adminStats').innerHTML = `
    <div class="stat"><span>Clientes</span><strong>${s.customers ?? 0}</strong></div>
    <div class="stat"><span>Pedidos</span><strong>${s.orders ?? 0}</strong></div>
    <div class="stat"><span>Aguardando pagamento</span><strong>${s.awaiting_payment ?? 0}</strong></div>
    <div class="stat"><span>Pagamentos confirmados</span><strong>${s.payments_confirmed ?? 0}</strong></div>
    <div class="stat"><span>Servidores ativos</span><strong>${s.servers_active ?? 0}</strong></div>
    <div class="stat"><span>Servidores suspensos</span><strong>${s.servers_suspended ?? 0}</strong></div>
    <div class="stat accent"><span>Faturamento total</span><strong>${money(s.revenue_cents ?? 0)}</strong></div>
    <div class="stat accent"><span>Faturamento do mês</span><strong>${money(s.revenue_month_cents ?? 0)}</strong></div>`;

  renderPendingOrders();
  renderOrders();
  renderCustomers();
  renderServers();
  renderProducts();
  renderTickets();
}

// ---------------- Pedidos ----------------
function orderActions(o) {
  const btn = (action, label, cls = 'btn-light') =>
    `<button class="btn ${cls} btn-sm" data-order-action="${action}" data-id="${o.id}">${label}</button>`;
  const parts = [];
  if (o.proof_path) parts.push(`<button class="btn btn-light btn-sm" data-proof="${escapeHtml(o.proof_path)}">Comprovante</button>`);
  if (o.status === 'awaiting_pix')  parts.push(btn('proof_received', 'Marcar comprovante'));
  if (['awaiting_pix', 'proof_received'].includes(o.status)) parts.push(btn('payment_confirmed', 'Confirmar pagamento', 'btn-primary'));
  if (o.status === 'payment_confirmed') parts.push(btn('active', 'Ativar serviço', 'btn-green'));
  if (!['cancelled', 'active'].includes(o.status)) parts.push(btn('cancelled', 'Cancelar', 'btn-danger'));
  return `<div class="actions">${parts.join('')}</div>`;
}

function orderRows(list) {
  if (!list.length) return `<div class="empty"><h3>Nenhum pedido aqui</h3></div>`;
  return `<table class="data"><thead><tr>
      <th>Número</th><th>Cliente</th><th>Produto</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th>
    </tr></thead><tbody>
    ${list.map((o) => `<tr>
      <td class="mono">${escapeHtml(o.order_number)}</td>
      <td>${escapeHtml(o.customer_name || '—')}<br><span style="color:#66768a;font-size:.8rem">${escapeHtml(o.customer_email || '')}</span></td>
      <td>${escapeHtml(o.product_name)}</td>
      <td>${money(o.amount_cents)}</td>
      <td>${statusChip(o.status)}</td>
      <td>${formatDateTime(o.created_at)}</td>
      <td>${orderActions(o)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderPendingOrders() {
  const list = cache.orders.filter((o) => ['awaiting_pix', 'proof_received', 'payment_confirmed'].includes(o.status));
  document.getElementById('pendingOrders').innerHTML = orderRows(list.slice(0, 15));
}

function renderOrders() {
  const term = (document.getElementById('orderSearch').value || '').toLowerCase();
  const filter = document.getElementById('orderFilter').value;
  const list = cache.orders.filter((o) => {
    const matchTerm = !term || [o.order_number, o.customer_name, o.customer_email, o.product_name]
      .some((v) => (v || '').toLowerCase().includes(term));
    return matchTerm && (!filter || o.status === filter);
  });
  document.getElementById('ordersTable').innerHTML = orderRows(list);
}
document.getElementById('orderSearch').addEventListener('input', renderOrders);
document.getElementById('orderFilter').addEventListener('change', renderOrders);

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-order-action]');
  if (!btn) return;
  const status = btn.dataset.orderAction;
  const order = cache.orders.find((o) => o.id === btn.dataset.id);
  if (!order) return;

  if (status === 'cancelled' && !confirm(`Cancelar o pedido ${order.order_number}?`)) return;
  if (status === 'payment_confirmed' &&
      !confirm(`Confirmar que o PIX de ${money(order.amount_cents)} do pedido ${order.order_number} caiu na conta?`)) return;

  const patch = { status };
  if (status === 'payment_confirmed') patch.paid_at = new Date().toISOString();

  btn.disabled = true;
  const { data, error } = await supabase.from('orders').update(patch).eq('id', order.id).select().single();
  btn.disabled = false;
  if (error) return toast(error.message, 'error');

  Object.assign(order, data);
  toast(`Pedido ${order.order_number}: ${ORDER_STATUS[status]}.`);
  renderPendingOrders(); renderOrders();

  if (status === 'active') openServerModal({ order });
});

// Comprovante por URL assinada temporária
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-proof]');
  if (!btn) return;
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(btn.dataset.proof, 120);
  if (error) return toast('Não foi possível abrir o comprovante.', 'error');
  window.open(data.signedUrl, '_blank', 'noopener');
});

// ---------------- Clientes ----------------
function renderCustomers() {
  const term = (document.getElementById('customerSearch').value || '').toLowerCase();
  const list = cache.customers.filter((c) =>
    !term || (c.full_name || '').toLowerCase().includes(term) || (c.email || '').toLowerCase().includes(term));

  document.getElementById('customersTable').innerHTML = list.length
    ? `<table class="data"><thead><tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Pedidos</th><th>Servidores</th><th>Cliente desde</th><th></th></tr></thead><tbody>
      ${list.map((c) => `<tr>
        <td>${escapeHtml(c.full_name || '—')}</td>
        <td>${escapeHtml(c.email || '—')}</td>
        <td>${escapeHtml(c.phone || '—')}</td>
        <td>${cache.orders.filter((o) => o.user_id === c.id).length}</td>
        <td>${cache.servers.filter((s) => s.user_id === c.id).length}</td>
        <td>${formatDate(c.created_at)}</td>
        <td><button class="btn btn-light btn-sm" data-customer="${c.id}">Detalhes</button></td>
      </tr>`).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nenhum cliente encontrado</h3></div>`;
}
document.getElementById('customerSearch').addEventListener('input', renderCustomers);

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-customer]');
  if (!btn) return;
  const c = cache.customers.find((x) => x.id === btn.dataset.customer);
  const orders = cache.orders.filter((o) => o.user_id === c.id);
  const servers = cache.servers.filter((s) => s.user_id === c.id);
  const total = orders.filter((o) => ['payment_confirmed', 'active'].includes(o.status))
                      .reduce((sum, o) => sum + o.amount_cents, 0);

  document.getElementById('customerDetail').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>${escapeHtml(c.full_name || 'Cliente')}</h2><span class="muted" style="color:#66768a">${escapeHtml(c.email)}</span></div>
      <dl class="kv">
        <dt>WhatsApp</dt><dd>${escapeHtml(c.phone || '—')}</dd>
        <dt>Total pago</dt><dd>${money(total)}</dd>
        <dt>Cliente desde</dt><dd>${formatDate(c.created_at)}</dd>
      </dl>
      <h3>Pedidos</h3>${orderRows(orders)}
      <h3 style="margin-top:1.4rem">Servidores</h3>
      ${servers.length ? `<table class="data"><thead><tr><th>Nome</th><th>Jogo</th><th>Status</th><th>Vencimento</th></tr></thead><tbody>
        ${servers.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.game || '—')}</td>
        <td>${SERVER_STATUS[s.status]}</td><td>${formatDate(s.expires_at)}</td></tr>`).join('')}</tbody></table>`
        : '<p style="color:#66768a">Nenhum servidor.</p>'}
    </div>`;
  document.getElementById('customerDetail').scrollIntoView({ behavior: 'smooth' });
});

// ---------------- Servidores ----------------
function renderServers() {
  document.getElementById('serversTable').innerHTML = cache.servers.length
    ? `<table class="data"><thead><tr><th>Servidor</th><th>Cliente</th><th>Jogo / plano</th><th>Endereço</th><th>Recursos</th><th>Status</th><th>Vencimento</th><th>Ações</th></tr></thead><tbody>
      ${cache.servers.map((s) => {
        const owner = cache.customers.find((c) => c.id === s.user_id);
        const e = expiryState(s.expires_at);
        return `<tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(owner?.email || '—')}</td>
          <td>${escapeHtml(s.game || '—')}<br><span style="color:#66768a;font-size:.8rem">${escapeHtml(s.plan_name || '')}</span></td>
          <td class="mono">${escapeHtml(s.ip || '—')}${s.port ? ':' + s.port : ''}</td>
          <td style="font-size:.82rem">${s.ram_mb ? (s.ram_mb / 1024) + ' GB' : '—'} · ${escapeHtml(s.cpu || '—')} · ${s.storage_gb || '—'} GB</td>
          <td><span class="chip chip-${s.status}">${SERVER_STATUS[s.status]}</span></td>
          <td>${e.icon} ${formatDate(s.expires_at)}</td>
          <td class="actions">
            <button class="btn btn-light btn-sm" data-server-edit="${s.id}">Editar</button>
            ${s.status !== 'active'    ? `<button class="btn btn-green btn-sm" data-server-status="active" data-id="${s.id}">Ativar</button>` : ''}
            ${s.status === 'active'    ? `<button class="btn btn-light btn-sm" data-server-status="suspended" data-id="${s.id}">Suspender</button>` : ''}
            ${s.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-server-status="cancelled" data-id="${s.id}">Cancelar</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nenhum servidor cadastrado</h3><p>Confirme um pagamento e crie o servidor do cliente.</p></div>`;
}

function serverForm(server = {}, order = null) {
  const v = (k, d = '') => escapeHtml(server[k] ?? d);
  const customerOptions = cache.customers.map((c) =>
    `<option value="${c.id}" ${(server.user_id || order?.user_id) === c.id ? 'selected' : ''}>${escapeHtml(c.full_name || c.email)} — ${escapeHtml(c.email)}</option>`).join('');

  return `
    <h2>${server.id ? 'Editar servidor' : 'Criar servidor'}</h2>
    <div id="serverMsg" class="alert" hidden></div>
    <form id="serverForm">
      <input type="hidden" name="id" value="${v('id')}" />
      <input type="hidden" name="order_id" value="${escapeHtml(server.order_id || order?.id || '')}" />
      <div class="field"><label>Cliente</label><select name="user_id" required>${customerOptions}</select></div>
      <div class="grid-2">
        <div class="field"><label>Nome do servidor</label><input name="name" value="${v('name', order?.product_name || '')}" required /></div>
        <div class="field"><label>Jogo</label><input name="game" value="${v('game', order?.category_slug || '')}" /></div>
        <div class="field"><label>Plano</label><input name="plan_name" value="${v('plan_name', order?.product_name || '')}" /></div>
        <div class="field"><label>Status</label>
          <select name="status">${Object.entries(SERVER_STATUS).map(([k, l]) =>
            `<option value="${k}" ${server.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>IP</label><input name="ip" value="${v('ip')}" /></div>
        <div class="field"><label>Porta</label><input name="port" type="number" value="${v('port')}" /></div>
        <div class="field"><label>RAM (MB)</label><input name="ram_mb" type="number" value="${v('ram_mb')}" /></div>
        <div class="field"><label>CPU</label><input name="cpu" value="${v('cpu')}" /></div>
        <div class="field"><label>Armazenamento (GB)</label><input name="storage_gb" type="number" value="${v('storage_gb')}" /></div>
        <div class="field"><label>Vencimento</label><input name="expires_at" type="date" value="${v('expires_at', order?.due_date || '')}" /></div>
        <div class="field"><label>URL do painel</label><input name="panel_url" value="${v('panel_url')}" /></div>
        <div class="field"><label>Usuário do painel</label><input name="panel_username" value="${v('panel_username', order?.customer_email || '')}" /></div>
        <div class="field"><label>ID no Pterodactyl</label><input name="pterodactyl_server_id" value="${v('pterodactyl_server_id')}" /></div>
      </div>
      <p style="color:#66768a;font-size:.85rem">
        Nunca guarde a senha do cliente aqui. O acesso ao painel é feito pela conta dele no Pterodactyl.
      </p>
      <div class="modal-actions">
        <button class="btn btn-light" type="button" data-close>Fechar</button>
        ${server.id ? '' : '<button class="btn btn-ghost" style="color:#16202c;border-color:#dde4ec" type="button" id="provisionBtn">Criar via Pterodactyl</button>'}
        <button class="btn btn-primary" type="submit">Salvar</button>
      </div>
    </form>`;
}

function openServerModal({ server = {}, order = null } = {}) {
  openModal(serverForm(server, order));

  document.getElementById('provisionBtn')?.addEventListener('click', async () => {
    const orderId = document.querySelector('#serverForm [name=order_id]').value;
    if (!orderId) return toast('Abra a criação a partir de um pedido para usar o Pterodactyl.', 'error');
    toast('Chamando a Edge Function activate-server...');
    try {
      const data = await callFunction('activate-server', { order_id: orderId, action: 'create' });
      toast(data?.message || 'Servidor solicitado ao Pterodactyl.');
      closeModal();
      await loadAll();
    } catch (err) {
      toast(err.message || 'A Edge Function activate-server ainda não está configurada.', 'error');
    }
  });

  document.getElementById('serverForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());
    const id = payload.id;
    delete payload.id;

    ['port', 'ram_mb', 'storage_gb'].forEach((k) => { payload[k] = payload[k] ? Number(payload[k]) : null; });
    Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null; });

    const query = id
      ? supabase.from('servers').update(payload).eq('id', id)
      : supabase.from('servers').insert(payload);

    const { error } = await query;
    if (error) return showAlert(document.getElementById('serverMsg'), error.message, 'error');
    toast('Servidor salvo.');
    closeModal();
    await loadAll();
  });
}

document.getElementById('newServer').addEventListener('click', () => openServerModal({}));
document.addEventListener('click', (e) => {
  const edit = e.target.closest('[data-server-edit]');
  if (edit) {
    const server = cache.servers.find((s) => s.id === edit.dataset.serverEdit);
    return openServerModal({ server });
  }
  const st = e.target.closest('[data-server-status]');
  if (st) {
    supabase.from('servers').update({ status: st.dataset.serverStatus }).eq('id', st.dataset.id)
      .then(({ error }) => {
        if (error) return toast(error.message, 'error');
        toast(`Servidor: ${SERVER_STATUS[st.dataset.serverStatus]}.`);
        loadAll();
      });
  }
});

// ---------------- Produtos ----------------
function renderProducts() {
  document.getElementById('productsTable').innerHTML = cache.products.length
    ? `<table class="data"><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Mais vendido</th><th>Ativo</th><th>Ordem</th><th></th></tr></thead><tbody>
      ${cache.products.map((p) => `<tr>
        <td>${escapeHtml(p.emoji || '')} ${escapeHtml(p.name)}<br><span style="color:#66768a;font-size:.8rem">${escapeHtml(p.slug)}</span></td>
        <td>${escapeHtml(p.categories?.name || '—')}</td>
        <td>${money(p.price_cents)}</td>
        <td>${p.best_seller ? '⭐' : '—'}</td>
        <td>${p.active ? '🟢' : '🔴'}</td>
        <td>${p.sort_order}</td>
        <td class="actions">
          <button class="btn btn-light btn-sm" data-product-edit="${p.id}">Editar</button>
          <button class="btn btn-light btn-sm" data-product-toggle="${p.id}">${p.active ? 'Desativar' : 'Ativar'}</button>
          <button class="btn btn-danger btn-sm" data-product-delete="${p.id}">Excluir</button>
        </td></tr>`).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nenhum produto</h3><p>Rode o arquivo seed.sql ou crie os planos aqui.</p></div>`;
}

function openProductModal(product = {}) {
  const v = (k, d = '') => escapeHtml(product[k] ?? d);
  const features = Array.isArray(product.features) ? product.features.join('\n') : '';
  openModal(`
    <h2>${product.id ? 'Editar produto' : 'Novo produto'}</h2>
    <div id="productMsg" class="alert" hidden></div>
    <form id="productForm">
      <input type="hidden" name="id" value="${v('id')}" />
      <div class="grid-2">
        <div class="field"><label>Nome</label><input name="name" value="${v('name')}" required /></div>
        <div class="field"><label>Identificador (slug)</label><input name="slug" value="${v('slug')}" required pattern="[a-z0-9\\-]+" /></div>
        <div class="field"><label>Emoji</label><input name="emoji" value="${v('emoji')}" /></div>
        <div class="field"><label>Categoria</label>
          <select name="category_id">${cache.categories.map((c) =>
            `<option value="${c.id}" ${product.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Preço em reais</label><input name="price" type="number" step="0.01" min="0" value="${product.price_cents != null ? (product.price_cents / 100).toFixed(2) : ''}" required /></div>
        <div class="field"><label>Ciclo (dias)</label><input name="cycle_days" type="number" value="${v('cycle_days', 30)}" /></div>
        <div class="field"><label>Ordem na lista</label><input name="sort_order" type="number" value="${v('sort_order', 0)}" /></div>
        <div class="field"><label>RAM (MB)</label><input name="ram_mb" type="number" value="${escapeHtml(product.specs?.ram_mb ?? '')}" /></div>
      </div>
      <div class="field"><label>Frase curta</label><input name="tagline" value="${v('tagline')}" /></div>
      <div class="field"><label>Recursos (um por linha)</label><textarea name="features" rows="7">${escapeHtml(features)}</textarea></div>
      <div class="field">
        <label><input type="checkbox" name="best_seller" ${product.best_seller ? 'checked' : ''} /> Marcar como ⭐ MAIS VENDIDO</label>
        <label><input type="checkbox" name="active" ${product.id ? (product.active ? 'checked' : '') : 'checked'} /> Produto ativo no site</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-light" type="button" data-close>Fechar</button>
        <button class="btn btn-primary" type="submit">Salvar produto</button>
      </div>
    </form>`);

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const id = f.get('id');
    const payload = {
      name: f.get('name').trim(),
      slug: f.get('slug').trim().toLowerCase(),
      emoji: f.get('emoji') || null,
      category_id: f.get('category_id') || null,
      price_cents: Math.round(Number(f.get('price')) * 100),
      cycle_days: Number(f.get('cycle_days')) || 30,
      sort_order: Number(f.get('sort_order')) || 0,
      tagline: f.get('tagline') || null,
      features: (f.get('features') || '').split('\n').map((s) => s.trim()).filter(Boolean),
      specs: f.get('ram_mb') ? { ...(product.specs || {}), ram_mb: Number(f.get('ram_mb')) } : (product.specs || {}),
      best_seller: f.get('best_seller') === 'on',
      active: f.get('active') === 'on',
    };

    const { error } = id
      ? await supabase.from('products').update(payload).eq('id', id)
      : await supabase.from('products').insert(payload);

    if (error) return showAlert(document.getElementById('productMsg'), error.message, 'error');
    toast('Produto salvo.');
    closeModal();
    await loadAll();
  });
}

document.getElementById('newProduct').addEventListener('click', () => openProductModal({}));
document.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-product-edit]');
  if (edit) return openProductModal(cache.products.find((p) => p.id === edit.dataset.productEdit));

  const toggle = e.target.closest('[data-product-toggle]');
  if (toggle) {
    const p = cache.products.find((x) => x.id === toggle.dataset.productToggle);
    const { error } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id);
    if (error) return toast(error.message, 'error');
    toast(p.active ? 'Produto desativado.' : 'Produto ativado.');
    return loadAll();
  }

  const del = e.target.closest('[data-product-delete]');
  if (del) {
    const p = cache.products.find((x) => x.id === del.dataset.productDelete);
    if (!confirm(`Excluir o produto ${p.name}? Pedidos antigos continuam salvos.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) return toast(`Não foi possível excluir: ${error.message}`, 'error');
    toast('Produto excluído.');
    loadAll();
  }
});

// ---------------- Suporte ----------------
function renderTickets() {
  document.getElementById('ticketsTable').innerHTML = cache.tickets.length
    ? `<table class="data"><thead><tr><th>Assunto</th><th>Cliente</th><th>Prioridade</th><th>Status</th><th>Aberto em</th><th>Ações</th></tr></thead><tbody>
      ${cache.tickets.map((t) => {
        const owner = cache.customers.find((c) => c.id === t.user_id);
        return `<tr>
          <td>${escapeHtml(t.subject)}</td>
          <td>${escapeHtml(owner?.email || '—')}</td>
          <td>
            <select data-ticket-priority="${t.id}">
              ${Object.entries(TICKET_PRIORITY).map(([k, l]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </td>
          <td>${TICKET_STATUS[t.status]}</td>
          <td>${formatDateTime(t.created_at)}</td>
          <td class="actions">
            <button class="btn btn-light btn-sm" data-ticket-open="${t.id}">Abrir conversa</button>
            <button class="btn btn-light btn-sm" data-ticket-status="${t.status === 'closed' ? 'open' : 'closed'}" data-id="${t.id}">
              ${t.status === 'closed' ? 'Reabrir' : 'Fechar'}</button>
          </td></tr>`;
      }).join('')}</tbody></table>`
    : `<div class="empty"><h3>Nenhum chamado</h3></div>`;
}

document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-ticket-priority]');
  if (!sel) return;
  const { error } = await supabase.from('tickets').update({ priority: sel.value }).eq('id', sel.dataset.ticketPriority);
  toast(error ? error.message : 'Prioridade atualizada.', error ? 'error' : 'ok');
});

document.addEventListener('click', async (e) => {
  const st = e.target.closest('[data-ticket-status]');
  if (st) {
    const { error } = await supabase.from('tickets').update({ status: st.dataset.ticketStatus }).eq('id', st.dataset.id);
    if (error) return toast(error.message, 'error');
    toast('Chamado atualizado.');
    return loadAll();
  }

  const open = e.target.closest('[data-ticket-open]');
  if (!open) return;
  const ticketId = open.dataset.ticketOpen;
  const { data } = await supabase.from('ticket_messages')
    .select('message, is_staff, created_at').eq('ticket_id', ticketId).order('created_at');

  document.getElementById('ticketThread').innerHTML = `<div class="panel">
    <h2>Conversa</h2>
    ${(data || []).map((m) => `<div style="border-left:3px solid ${m.is_staff ? 'var(--green-deep)' : '#dde4ec'};padding:.6rem .9rem;margin-bottom:.7rem">
      <div style="font-size:.78rem;color:#66768a">${m.is_staff ? 'Equipe' : 'Cliente'} · ${formatDateTime(m.created_at)}</div>
      <div>${escapeHtml(m.message)}</div></div>`).join('')}
    <form id="staffReply"><div class="field"><label for="staffMsg">Responder ao cliente</label>
      <textarea id="staffMsg" rows="3" required></textarea></div>
      <button class="btn btn-primary btn-sm" type="submit">Enviar resposta</button></form>
  </div>`;

  document.getElementById('staffReply').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const message = document.getElementById('staffMsg').value.trim();
    const { error } = await supabase.from('ticket_messages')
      .insert({ ticket_id: ticketId, user_id: me.id, is_staff: true, message });
    if (error) return toast(error.message, 'error');
    await supabase.from('tickets').update({ status: 'answered' }).eq('id', ticketId);
    toast('Resposta enviada.');
    open.click();
  });
});

// ---------------- Configurações ----------------
async function loadSettings() {
  const { data } = await supabase.from('settings').select('key, value');
  const company = data?.find((s) => s.key === 'company')?.value || {};
  const pix = data?.find((s) => s.key === 'pix')?.value || {};
  document.getElementById('setName').value    = company.name || '';
  document.getElementById('setSlogan').value  = company.slogan || '';
  document.getElementById('setWhats').value   = company.whatsapp || '';
  document.getElementById('setEmail').value   = company.email || '';
  document.getElementById('setDiscord').value = company.discord || '';
  document.getElementById('setPixKey').value  = pix.key || '';
  document.getElementById('setPixType').value = pix.type || '';
  document.getElementById('setPixReceiver').value = pix.receiver || '';
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = document.getElementById('settingsMsg');
  const company = {
    name: document.getElementById('setName').value.trim(),
    slogan: document.getElementById('setSlogan').value.trim(),
    whatsapp: document.getElementById('setWhats').value.replace(/\D/g, ''),
    email: document.getElementById('setEmail').value.trim(),
    discord: document.getElementById('setDiscord').value.trim(),
  };
  const pix = {
    key: document.getElementById('setPixKey').value.trim(),
    type: document.getElementById('setPixType').value,
    receiver: document.getElementById('setPixReceiver').value.trim(),
  };
  const { error } = await supabase.from('settings').upsert([
    { key: 'company', value: company, is_public: true },
    { key: 'pix', value: pix, is_public: true },
  ]);
  showAlert(box, error ? error.message : 'Configurações salvas.', error ? 'error' : 'ok');
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
  me = await requireUser();
  if (!me) return;

  const admin = await isAdmin();
  if (!admin) {
    document.getElementById('gateMsg').textContent =
      'Esta conta não tem permissão de administrador. Se isso for um erro, peça para inserir seu usuário na tabela admins.';
    return;
  }

  document.getElementById('gate').hidden = true;
  document.getElementById('app').hidden = false;
  document.getElementById('whoAmI').textContent = me.email;
  document.getElementById('burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.body.classList.add('app', 'admin');

  await loadAll();
  await loadSettings();
  showView(location.hash.replace('#', '') || 'dashboard');
})();
