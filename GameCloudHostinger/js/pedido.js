// Página de um pedido: mostra o PIX, aceita comprovante e monta o link de WhatsApp.
import { supabase, requireUser, callFunction } from './supabase.js';
import { CONFIG, waLink } from './config.js';
import { money, statusChip, formatDateTime, formatDate, showAlert, toast, escapeHtml, ORDER_STATUS } from './ui.js';

const params = new URLSearchParams(location.search);
const orderNumber = params.get('n');
let order = null;
let user = null;

document.getElementById('burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-logout]')) {
    e.preventDefault();
    await supabase.auth.signOut();
    location.href = 'index.html';
  }
});

function renderSummary() {
  document.getElementById('orderNumber').textContent = order.order_number;
  document.getElementById('productName').textContent = order.product_name;
  document.getElementById('statusChip').innerHTML = statusChip(order.status);
  document.getElementById('kvNumber').textContent   = order.order_number;
  document.getElementById('kvAmount').textContent   = money(order.amount_cents);
  document.getElementById('kvCustomer').textContent = `${order.customer_name || ''} · ${order.customer_email || ''}`;
  document.getElementById('kvCreated').textContent  = formatDateTime(order.created_at);
  document.getElementById('kvDue').textContent      = formatDate(order.due_date);
  document.getElementById('summaryPanel').hidden = false;

  const waMessage =
    `Olá! Segue o comprovante do meu pedido na ${CONFIG.COMPANY_NAME}.\n\n` +
    `Produto: ${order.product_name}\n` +
    `Pedido: ${order.order_number}\n` +
    `Valor: ${money(order.amount_cents)}\n` +
    `E-mail: ${order.customer_email || user.email}`;
  document.getElementById('waProof').href = waLink(waMessage);
}

async function renderPix() {
  const pending = ['awaiting_pix', 'proof_received'].includes(order.status);
  document.getElementById('proofPanel').hidden = !pending;

  if (!pending) {
    document.getElementById('donePanel').hidden = false;
    document.getElementById('doneText').textContent = {
      payment_confirmed: 'Pagamento confirmado. Estamos preparando seu servidor — você recebe os dados de acesso por e-mail e na sua área.',
      active: 'Serviço ativo. Os dados de acesso estão em Meus servidores.',
      cancelled: 'Este pedido foi cancelado. Se foi engano, abra um chamado que reabrimos.',
      expired: 'Este pedido venceu sem pagamento. Você pode fazer um novo pedido a qualquer momento.',
    }[order.status] || '';
    return;
  }

  const panel = document.getElementById('pixPanel');
  const help  = document.getElementById('pixHelp');
  const code  = document.getElementById('pixCode');
  const qr    = document.getElementById('pixQr');
  panel.hidden = false;

  // 1) Já existe cobrança gerada pelo gateway?
  if (order.pix_payload) {
    code.value = order.pix_payload;
    if (order.pix_qr_image) {
      qr.src = order.pix_qr_image.startsWith('data:') ? order.pix_qr_image : `data:image/png;base64,${order.pix_qr_image}`;
      qr.hidden = false;
    }
    help.textContent = 'Abra o app do seu banco, escolha PIX e pague com o QR Code ou com o código abaixo.';
    return;
  }

  // 2) Gateway ligado: pede a cobrança à Edge Function
  if (CONFIG.PIX_GATEWAY_ENABLED) {
    help.textContent = 'Gerando sua cobrança PIX...';
    try {
      const data = await callFunction('create-payment', { order_id: order.id });
      if (data?.pix_payload) {
        code.value = data.pix_payload;
        if (data.pix_qr_image) {
          qr.src = data.pix_qr_image.startsWith('data:') ? data.pix_qr_image : `data:image/png;base64,${data.pix_qr_image}`;
          qr.hidden = false;
        }
        help.textContent = 'Abra o app do seu banco, escolha PIX e pague com o QR Code ou com o código abaixo.';
        return;
      }
      throw new Error('Resposta sem dados de PIX.');
    } catch (err) {
      console.error(err);
      help.textContent = 'Não conseguimos gerar a cobrança automática agora. Use a chave PIX manual abaixo ou fale no WhatsApp.';
    }
  }

  // 3) Sem gateway: chave PIX manual
  if (CONFIG.PIX_KEY) {
    code.value = CONFIG.PIX_KEY;
    help.textContent = `Pague ${money(order.amount_cents)} para a chave PIX abaixo (${CONFIG.PIX_RECEIVER_NAME || CONFIG.COMPANY_NAME}) e envie o comprovante.`;
  } else {
    code.value = '';
    code.placeholder = 'Chave PIX ainda não configurada';
    help.textContent = 'A chave PIX ainda não foi configurada. Chame a gente no WhatsApp para concluir o pagamento.';
  }
}

document.getElementById('copyPix').addEventListener('click', async () => {
  const value = document.getElementById('pixCode').value;
  if (!value) return toast('Nada para copiar ainda.', 'error');
  try {
    await navigator.clipboard.writeText(value);
    toast('Código PIX copiado.');
  } catch {
    document.getElementById('pixCode').select();
    toast('Selecione e copie o código.', 'error');
  }
});

document.getElementById('proofForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const box  = document.getElementById('proofMsg');
  const input = document.getElementById('proofFile');
  const file = input.files?.[0];
  const btn = e.target.querySelector('button[type=submit]');
  showAlert(box, '');

  if (!file) return showAlert(box, 'Escolha um arquivo.', 'error');
  const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
  if (!allowed.includes(file.type)) return showAlert(box, 'Formato não aceito. Envie PNG, JPG ou PDF.', 'error');
  if (file.size > 10 * 1024 * 1024) return showAlert(box, 'Arquivo maior que 10 MB.', 'error');

  btn.disabled = true; btn.textContent = 'Enviando...';
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${user.id}/${order.order_number}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('payment-proofs')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upErr) {
    btn.disabled = false; btn.textContent = 'Enviar comprovante';
    return showAlert(box, `Não foi possível enviar o arquivo: ${upErr.message}`, 'error');
  }

  const { data, error } = await supabase.rpc('mark_proof_sent', { p_order_id: order.id, p_path: path });
  btn.disabled = false; btn.textContent = 'Enviar comprovante';

  if (error) return showAlert(box, error.message, 'error');
  order = Array.isArray(data) ? data[0] : data;
  input.value = '';
  showAlert(box, 'Comprovante recebido. Nossa equipe confere e libera o servidor.', 'ok');
  document.getElementById('statusChip').innerHTML = statusChip(order.status);
});

(async function init() {
  user = await requireUser();
  if (!user) return;

  if (!orderNumber) {
    showAlert(document.getElementById('orderMsg'), 'Pedido não informado.', 'error');
    return;
  }

  const { data, error } = await supabase
    .from('orders').select('*').eq('order_number', orderNumber).maybeSingle();

  if (error || !data) {
    document.getElementById('orderNumber').textContent = '—';
    return showAlert(document.getElementById('orderMsg'),
      'Pedido não encontrado ou você não tem acesso a ele.', 'error');
  }

  order = data;
  renderSummary();
  await renderPix();
})();
