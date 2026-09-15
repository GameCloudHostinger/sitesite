// ============================================================
// send-email — e-mails transacionais.
//
// Segredos:
//   EMAIL_API_KEY   -> chave do serviço transacional (ex.: Resend)
//   EMAIL_FROM      -> "GameCloudHostinger <contato@seudominio.com>"
//
// Templates: signup, order_created, proof_received, payment_confirmed,
//            server_activated, expiring_soon, suspended
// ============================================================
import { handleOptions, json } from '../_shared/cors.ts';
import { adminClient, getCaller, callerIsAdmin } from '../_shared/supabase.ts';

const EMAIL_API_KEY = Deno.env.get('EMAIL_API_KEY');
const EMAIL_FROM    = Deno.env.get('EMAIL_FROM') ?? 'GameCloudHostinger <onboarding@resend.dev>';
const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gamecloudhostinger.com';

type Ctx = Record<string, string>;

const TEMPLATES: Record<string, (c: Ctx) => { subject: string; html: string }> = {
  signup: (c) => ({
    subject: 'Sua conta na GameCloudHostinger está pronta',
    html: `<p>Olá, ${c.name}!</p><p>Sua conta foi criada. Acesse sua área em <a href="${SITE_URL}/dashboard.html">${SITE_URL}/dashboard.html</a>.</p>`,
  }),
  order_created: (c) => ({
    subject: `Pedido ${c.order_number} criado`,
    html: `<p>Olá, ${c.name}!</p><p>Recebemos seu pedido do plano <strong>${c.product}</strong> no valor de <strong>${c.amount}</strong>.</p>
           <p>Número do pedido: <strong>${c.order_number}</strong></p>
           <p>Para pagar, acesse <a href="${SITE_URL}/pedido.html?n=${c.order_number}">a página do pedido</a>.</p>`,
  }),
  proof_received: (c) => ({
    subject: `Comprovante recebido — ${c.order_number}`,
    html: `<p>Olá, ${c.name}!</p><p>Seu comprovante chegou. Assim que a conferência terminar, liberamos seu servidor.</p>`,
  }),
  payment_confirmed: (c) => ({
    subject: `Pagamento confirmado — ${c.order_number}`,
    html: `<p>Olá, ${c.name}!</p><p>Confirmamos o pagamento de <strong>${c.amount}</strong>. Estamos preparando seu servidor e avisamos assim que estiver no ar.</p>`,
  }),
  server_activated: (c) => ({
    subject: 'Seu servidor está no ar',
    html: `<p>Olá, ${c.name}!</p><p>O servidor <strong>${c.server}</strong> foi ativado.</p>
           <p>Endereço: <strong>${c.address}</strong></p>
           <p>Os dados completos estão em <a href="${SITE_URL}/dashboard.html#servidores">Meus servidores</a>.</p>`,
  }),
  expiring_soon: (c) => ({
    subject: `Seu servidor vence em ${c.days} dia(s)`,
    html: `<p>Olá, ${c.name}!</p><p>O servidor <strong>${c.server}</strong> vence em ${c.date}. Renove para não perder os arquivos.</p>`,
  }),
  suspended: (c) => ({
    subject: 'Servidor suspenso por falta de pagamento',
    html: `<p>Olá, ${c.name}!</p><p>O servidor <strong>${c.server}</strong> foi suspenso. Os arquivos ficam guardados por 7 dias. Renove para reativar.</p>`,
  }),
};

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const payload = await req.json();
    const { template, order_id, to, context = {}, internal } = payload;

    const authHeader = req.headers.get('Authorization') ?? '';
    const isInternal = internal === true &&
      authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '\u0000');

    if (!isInternal) {
      const user = await getCaller(req);
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      if (!(await callerIsAdmin(user.id))) return json({ error: 'Apenas administradores.' }, 403);
    }

    const make = TEMPLATES[template];
    if (!make) return json({ error: 'Template desconhecido.' }, 400);

    const db = adminClient();
    let ctx: Ctx = { name: 'Cliente', ...context };
    let recipient = to;

    if (order_id) {
      const { data: order } = await db.from('orders').select('*').eq('id', order_id).single();
      if (order) {
        recipient = recipient ?? order.customer_email;
        ctx = {
          ...ctx,
          name: order.customer_name || 'Cliente',
          order_number: order.order_number,
          product: order.product_name,
          amount: brl(order.amount_cents),
        };
      }
    }

    if (!recipient) return json({ error: 'Destinatário não informado.' }, 400);

    const { subject, html } = make(ctx);

    if (!EMAIL_API_KEY) {
      await db.from('email_log').insert({
        to_email: recipient, template, payload: ctx, status: 'skipped',
        error: 'EMAIL_API_KEY não configurada',
      });
      return json({ ok: false, skipped: true, reason: 'EMAIL_API_KEY não configurada.' }, 202);
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [recipient], subject, html }),
    });
    const body = await res.json().catch(() => ({}));

    await db.from('email_log').insert({
      to_email: recipient, template, payload: ctx,
      status: res.ok ? 'sent' : 'error',
      error: res.ok ? null : JSON.stringify(body),
    });

    return json({ ok: res.ok, id: body?.id });
  } catch (err) {
    console.error('send-email:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
