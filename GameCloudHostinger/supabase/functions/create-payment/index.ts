// ============================================================
// create-payment — gera a cobrança PIX de um pedido.
//
// Provedor escolhido: Asaas (instituição de pagamento autorizada pelo
// Banco Central, com API REST, sandbox e webhook próprios).
// Para trocar de provedor, altere apenas createCharge().
//
// Segredos necessários (Supabase > Edge Functions > Secrets):
//   PIX_PROVIDER_API_KEY   -> token de API do provedor
//   PIX_PROVIDER_BASE_URL  -> https://api-sandbox.asaas.com/v3 (testes)
//                             ou https://api.asaas.com/v3 (produção)
//
// IMPORTANTE (regras do provedor): a conta de pagamento precisa estar
// no nome de quem tem idade e documentação exigidas pelo provedor.
// Se o responsável pelo site for menor de idade, a conta deve ser aberta
// por um responsável legal, conforme as regras da instituição. Não tente
// contornar essa verificação.
// ============================================================
import { handleOptions, json } from '../_shared/cors.ts';
import { adminClient, getCaller } from '../_shared/supabase.ts';

const API_KEY  = Deno.env.get('PIX_PROVIDER_API_KEY');
const BASE_URL = Deno.env.get('PIX_PROVIDER_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3';

async function providerRequest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'access_token': API_KEY!,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errors?.[0]?.description ?? `Falha no provedor (${res.status})`);
  return body;
}

async function ensureCustomer(order: Record<string, unknown>) {
  const email = String(order.customer_email ?? '');
  const found = await providerRequest(`/customers?email=${encodeURIComponent(email)}`);
  if (found?.data?.length) return found.data[0].id;

  const created = await providerRequest('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: order.customer_name || email,
      email,
      externalReference: String(order.user_id),
    }),
  });
  return created.id;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    if (!API_KEY) {
      return json({ error: 'Gateway não configurado. Cadastre o segredo PIX_PROVIDER_API_KEY.' }, 503);
    }

    const user = await getCaller(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'order_id é obrigatório.' }, 400);

    const db = adminClient();
    const { data: order, error } = await db.from('orders').select('*').eq('id', order_id).single();
    if (error || !order) return json({ error: 'Pedido não encontrado.' }, 404);

    // O pedido tem que ser do usuário que chamou a função.
    if (order.user_id !== user.id) return json({ error: 'Este pedido não é seu.' }, 403);
    if (!['awaiting_pix', 'proof_received'].includes(order.status)) {
      return json({ error: 'Este pedido não está aguardando pagamento.' }, 409);
    }

    // Já existe cobrança gerada? Devolve a mesma.
    if (order.pix_payload) {
      return json({ pix_payload: order.pix_payload, pix_qr_image: order.pix_qr_image, reused: true });
    }

    const customerId = await ensureCustomer(order);
    const dueDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

    const charge = await providerRequest('/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: Number((order.amount_cents / 100).toFixed(2)),
        dueDate,
        description: `${order.product_name} — pedido ${order.order_number}`,
        externalReference: order.order_number,
      }),
    });

    const qr = await providerRequest(`/payments/${charge.id}/pixQrCode`);

    await db.from('orders').update({
      gateway: 'asaas',
      payment_id: charge.id,
      pix_payload: qr.payload,
      pix_qr_image: qr.encodedImage,
      expires_at: qr.expirationDate ?? null,
    }).eq('id', order.id);

    await db.from('payments').insert({
      order_id: order.id,
      user_id: order.user_id,
      gateway: 'asaas',
      gateway_payment_id: charge.id,
      amount_cents: order.amount_cents,
      status: 'pending',
    });

    return json({ pix_payload: qr.payload, pix_qr_image: qr.encodedImage, payment_id: charge.id });
  } catch (err) {
    console.error('create-payment:', err);
    return json({ error: (err as Error).message ?? 'Erro ao gerar cobrança.' }, 500);
  }
});
