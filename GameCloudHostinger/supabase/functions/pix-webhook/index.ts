// ============================================================
// pix-webhook — recebe a confirmação de pagamento do provedor.
//
// Esta função é PÚBLICA (o provedor chama sem login), então precisa de
// verify_jwt = false no deploy E de validação própria do segredo.
//
// Segredos:
//   PIX_WEBHOOK_TOKEN      -> token que você cadastra no painel do provedor
//                             e que ele reenvia no cabeçalho asaas-access-token
//   PIX_PROVIDER_API_KEY   -> usado para reconsultar a cobrança na origem
//   PIX_PROVIDER_BASE_URL
//
// Regra de ouro: o pedido só vira pago depois de reconsultar a cobrança
// direto na API do provedor. Nunca confie apenas no corpo do POST.
// ============================================================
import { json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

const WEBHOOK_TOKEN = Deno.env.get('PIX_WEBHOOK_TOKEN');
const API_KEY       = Deno.env.get('PIX_PROVIDER_API_KEY');
const BASE_URL      = Deno.env.get('PIX_PROVIDER_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3';

const PAID = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  // 1. Valida o segredo do webhook
  const received = req.headers.get('asaas-access-token')
                ?? req.headers.get('x-webhook-token') ?? '';
  if (!WEBHOOK_TOKEN || !safeEqual(received, WEBHOOK_TOKEN)) {
    console.warn('pix-webhook: token inválido');
    return json({ error: 'Não autorizado.' }, 401);
  }

  const db = adminClient();

  try {
    const event = await req.json();
    const eventId = String(event.id ?? event.payment?.id ?? crypto.randomUUID());

    // 2. Idempotência: se já processamos este evento, para por aqui.
    const { error: dupError } = await db.from('webhook_events')
      .insert({ provider: 'asaas', event_id: eventId, payload: event });
    if (dupError && dupError.code === '23505') return json({ ok: true, duplicated: true });

    const paymentId = event.payment?.id;
    if (!paymentId) return json({ ok: true, ignored: 'sem id de cobrança' });

    // 3. Reconsulta na origem — a verdade vem da API, não do POST.
    const res = await fetch(`${BASE_URL}/payments/${paymentId}`, {
      headers: { 'access_token': API_KEY!, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.error('pix-webhook: falha ao reconsultar cobrança', res.status);
      return json({ error: 'Não foi possível validar a cobrança.' }, 502);
    }
    const charge = await res.json();

    if (!PAID.includes(charge.status)) {
      return json({ ok: true, status: charge.status, ignored: 'ainda não pago' });
    }

    // 4. Localiza o pedido e confere o valor
    const { data: order } = await db.from('orders')
      .select('*')
      .or(`payment_id.eq.${paymentId},order_number.eq.${charge.externalReference ?? ''}`)
      .maybeSingle();

    if (!order) return json({ ok: true, ignored: 'pedido não encontrado' });

    const paidCents = Math.round(Number(charge.value) * 100);
    if (paidCents < order.amount_cents) {
      await db.from('orders').update({
        admin_notes: `Pagamento parcial recebido: ${paidCents} de ${order.amount_cents} centavos.`,
      }).eq('id', order.id);
      return json({ ok: true, ignored: 'valor menor que o pedido' });
    }

    if (['payment_confirmed', 'active'].includes(order.status)) {
      return json({ ok: true, already: order.status });
    }

    // 5. Marca como pago
    await db.from('orders').update({
      status: 'payment_confirmed',
      paid_at: new Date().toISOString(),
      gateway: 'asaas',
      payment_id: paymentId,
    }).eq('id', order.id);

    await db.from('payments').upsert({
      order_id: order.id,
      user_id: order.user_id,
      gateway: 'asaas',
      gateway_payment_id: paymentId,
      amount_cents: paidCents,
      status: 'paid',
      paid_at: new Date().toISOString(),
      raw: charge,
    }, { onConflict: 'gateway_payment_id' });

    // 6. Dispara e-mail e (se configurado) a criação do servidor
    const base = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    await fetch(`${base}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ template: 'payment_confirmed', order_id: order.id, internal: true }),
    }).catch((e) => console.error('send-email:', e));

    if (Deno.env.get('AUTO_PROVISION') === 'true') {
      await fetch(`${base}/functions/v1/activate-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ order_id: order.id, action: 'create', internal: true }),
      }).catch((e) => console.error('activate-server:', e));
    }

    return json({ ok: true, order: order.order_number });
  } catch (err) {
    console.error('pix-webhook:', err);
    return json({ error: 'Erro interno.' }, 500);
  }
});
