// Pequenos utilitários de interface usados em todas as páginas.
import { CONFIG, waLink, money } from './config.js';

export { money, waLink };

export const ORDER_STATUS = {
  awaiting_pix:      'Aguardando PIX',
  proof_received:    'Comprovante recebido',
  payment_confirmed: 'Pagamento confirmado',
  active:            'Serviço ativo',
  cancelled:         'Cancelado',
  expired:           'Vencido',
};

export const SERVER_STATUS = {
  provisioning: 'Em criação',
  active:       'Ativo',
  suspended:    'Suspenso',
  cancelled:    'Cancelado',
  expired:      'Vencido',
};

export const TICKET_STATUS   = { open: 'Aberto', answered: 'Respondido', closed: 'Fechado' };
export const TICKET_PRIORITY = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

export function statusChip(status, map = ORDER_STATUS) {
  return `<span class="chip chip-${status}">${map[status] ?? status}</span>`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Semáforo de vencimento: 🟢 ativo, 🟡 vencendo, 🔴 vencido
export function expiryState(dateValue) {
  if (!dateValue) return { icon: '⚪', label: 'Sem vencimento', level: 'none', days: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateValue); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0)  return { icon: '🔴', label: `Vencido há ${Math.abs(days)} dia(s)`, level: 'expired', days };
  if (days <= CONFIG.EXPIRING_SOON_DAYS) return { icon: '🟡', label: `Vence em ${days} dia(s)`, level: 'soon', days };
  return { icon: '🟢', label: `Ativo até ${formatDate(dateValue)}`, level: 'ok', days };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let toastTimer;
export function toast(message, type = 'ok') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4500);
}

export function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.hidden = !message;
}

// Traduz os erros mais comuns do Supabase Auth para português.
export function authErrorMessage(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed'))       return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.';
  if (msg.includes('user already registered'))   return 'Já existe uma conta com esse e-mail. Faça login ou recupere a senha.';
  if (msg.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  if (msg.includes('failed to fetch')) return 'Não foi possível falar com o servidor. Verifique sua conexão.';
  return error?.message || 'Algo deu errado. Tente novamente.';
}

// Menu mobile + links de contato + ano do rodapé
export function initChrome() {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  if (nav && toggle) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '✕' : '☰';
    });
    nav.querySelectorAll('.nav-links a').forEach((a) =>
      a.addEventListener('click', () => {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '☰';
      })
    );
  }

  const wa = waLink(`Olá! Vim pelo site da ${CONFIG.COMPANY_NAME} e quero tirar uma dúvida.`);
  document.querySelectorAll('#waSupport, #waFooter').forEach((a) => { a.href = wa; });
  document.querySelectorAll('#mailSupport, #mailFooter').forEach((a) => { a.href = `mailto:${CONFIG.SUPPORT_EMAIL}`; });

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
}
