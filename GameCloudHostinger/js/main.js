// Página inicial: monta as abas de categoria e a grade de planos.
import { initChrome, money, escapeHtml, toast } from './ui.js';
import { loadCategories, loadProducts } from './products.js';
import { startCheckout } from './checkout.js';
import { supabase } from './supabase.js';

initChrome();

const tabsEl  = document.getElementById('categoryTabs');
const gridEl  = document.getElementById('plansGrid');
const emptyEl = document.getElementById('plansEmpty');

let allProducts = [];
let categories  = [];

function planCard(p) {
  const features = (p.features || []).map((f) => `<li>${escapeHtml(f)}</li>`).join('');
  return `
    <article class="plan ${p.best_seller ? 'plan-best' : ''}">
      ${p.best_seller ? '<span class="plan-badge">⭐ MAIS VENDIDO</span>' : ''}
      <span class="plan-emoji">${escapeHtml(p.emoji || '🎮')}</span>
      <h3>${escapeHtml(p.name)}</h3>
      <p class="plan-tagline">${escapeHtml(p.tagline || '')}</p>
      <div class="plan-price">${money(p.price_cents)}<span>/mês</span></div>
      <ul>${features}</ul>
      <button class="btn btn-primary btn-block" data-buy="${escapeHtml(p.slug)}" ${p.id ? '' : 'disabled title="Plano de demonstração — rode o seed.sql no Supabase"'}>
        Comprar agora
      </button>
    </article>`;
}

function render(slug) {
  const list = allProducts.filter((p) => p.category_slug === slug);
  gridEl.innerHTML = list.map(planCard).join('');
  emptyEl.hidden = list.length > 0;
  tabsEl.querySelectorAll('.tab').forEach((t) =>
    t.setAttribute('aria-selected', String(t.dataset.slug === slug))
  );
}

async function init() {
  try {
    [categories, allProducts] = await Promise.all([loadCategories(), loadProducts()]);
  } catch (err) {
    console.error(err);
    toast('Não foi possível carregar o catálogo agora.', 'error');
    gridEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  const used = categories.filter((c) => allProducts.some((p) => p.category_slug === c.slug));
  const visible = used.length ? used : categories;

  tabsEl.innerHTML = visible.map((c, i) => `
    <button class="tab" role="tab" data-slug="${escapeHtml(c.slug)}" aria-selected="${i === 0}">
      ${escapeHtml(c.icon || '')} ${escapeHtml(c.name)}
    </button>`).join('');

  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) render(tab.dataset.slug);
  });

  const initial = new URLSearchParams(location.search).get('cat') || visible[0]?.slug;
  render(initial);

  // Troca os botões do topo se o visitante já estiver logado
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    const actions = document.getElementById('navActions');
    if (actions) actions.innerHTML = '<a class="btn btn-primary btn-sm" href="dashboard.html">Minha área</a>';
  }
}

gridEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (!btn) return;
  const product = allProducts.find((p) => p.slug === btn.dataset.buy);
  if (product) startCheckout(product);
});

init();
