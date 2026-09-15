// Catálogo: busca categorias e planos no Supabase.
// Se o banco ainda não estiver populado, usa o catálogo local de reserva
// para o site nunca aparecer vazio.
import { supabase } from './supabase.js';

export const FALLBACK = {
  categories: [
    { slug: 'minecraft', name: 'Minecraft', icon: '⛏️' },
    { slug: 'fivem',     name: 'FiveM',     icon: '🚓' },
    { slug: 'dayz',      name: 'DayZ',      icon: '🧟' },
  ],
  products: [
    { id: null, slug: 'mc-ferro', name: 'FERRO', emoji: '🪨', category_slug: 'minecraft', price_cents: 2990,
      tagline: 'Para começar seu servidor com os amigos.', best_seller: false,
      features: ['4 GB RAM','Jogadores ilimitados','Proteção Anti-DDoS','FTP Web/FileZilla','Suporte a Plugins e Mods','Painel Pterodactyl','Banco de dados MySQL','Subdomínio GRÁTIS'] },
    { id: null, slug: 'mc-esmeralda', name: 'ESMERALDA', emoji: '💚', category_slug: 'minecraft', price_cents: 7990,
      tagline: 'O equilíbrio que a maioria escolhe.', best_seller: true,
      features: ['8 GB RAM','Jogadores ilimitados','Proteção Anti-DDoS','FTP Web/FileZilla','Suporte a Plugins e Mods','Painel Pterodactyl','Banco de dados MySQL','Subdomínio GRÁTIS'] },
    { id: null, slug: 'mc-lobo', name: 'LOBO', emoji: '🐺', category_slug: 'minecraft', price_cents: 16990,
      tagline: 'Para comunidades grandes e eventos.', best_seller: false,
      features: ['16 GB RAM','Jogadores ilimitados','Proteção Anti-DDoS','FTP Web/FileZilla','Suporte a Plugins e Mods','Painel Pterodactyl','Banco de dados MySQL','Subdomínio GRÁTIS'] },
  ],
};

export async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, slug, name, description, icon, sort_order')
    .eq('active', true)
    .order('sort_order');
  if (error || !data?.length) return FALLBACK.categories;
  return data;
}

export async function loadProducts(categorySlug = null) {
  let query = supabase
    .from('products')
    .select('id, slug, name, emoji, tagline, price_cents, cycle_days, features, specs, best_seller, sort_order, categories(slug, name)')
    .eq('active', true)
    .order('sort_order');

  const { data, error } = await query;
  if (error || !data?.length) {
    const list = FALLBACK.products;
    return categorySlug ? list.filter((p) => p.category_slug === categorySlug) : list;
  }

  const normalized = data.map((p) => ({
    ...p,
    category_slug: p.categories?.slug ?? 'outros',
    category_name: p.categories?.name ?? 'Outros',
    features: Array.isArray(p.features) ? p.features : [],
  }));
  return categorySlug ? normalized.filter((p) => p.category_slug === categorySlug) : normalized;
}

export async function loadProductBySlug(slug) {
  const { data } = await supabase
    .from('products')
    .select('id, slug, name, emoji, tagline, price_cents, features, specs, categories(slug, name)')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  return data;
}
