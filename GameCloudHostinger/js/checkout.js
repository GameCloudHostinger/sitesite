// Checkout: valida login, cria o pedido no Supabase (preço vem do banco)
// e leva o cliente para a página de pagamento do pedido.
import { supabase, getUser } from './supabase.js';
import { toast } from './ui.js';

export async function startCheckout(product) {
  if (!product?.id) {
    toast('Este plano ainda não está cadastrado no banco de dados.', 'error');
    return;
  }

  const user = await getUser();
  if (!user) {
    // Guarda a intenção de compra e manda para o login
    sessionStorage.setItem('gch_pending_product', product.slug);
    location.href = `login.html?next=${encodeURIComponent('index.html#planos')}&buy=${encodeURIComponent(product.slug)}`;
    return;
  }

  toast('Criando seu pedido...');
  const { data, error } = await supabase.rpc('create_order', { p_product_id: product.id });

  if (error) {
    console.error(error);
    toast(error.message || 'Não foi possível criar o pedido.', 'error');
    return;
  }

  const order = Array.isArray(data) ? data[0] : data;
  location.href = `pedido.html?n=${encodeURIComponent(order.order_number)}`;
}

// Chamada após o login quando havia uma compra pendente
export async function resumePendingCheckout(loadProductBySlug) {
  const slug = new URLSearchParams(location.search).get('buy')
            || sessionStorage.getItem('gch_pending_product');
  if (!slug) return false;
  sessionStorage.removeItem('gch_pending_product');
  const product = await loadProductBySlug(slug);
  if (!product) return false;
  await startCheckout(product);
  return true;
}
