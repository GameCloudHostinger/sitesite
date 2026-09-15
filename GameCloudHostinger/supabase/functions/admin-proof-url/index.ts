// ============================================================
// admin-proof-url — gera URL assinada e temporária de um comprovante.
//
// O painel admin já consegue gerar a URL pelo próprio client (o RLS do
// Storage permite que admins leiam o bucket). Esta função existe para
// integrações externas — por exemplo, mandar o link para um bot do Discord
// sem expor a chave de serviço.
// ============================================================
import { handleOptions, json } from '../_shared/cors.ts';
import { adminClient, getCaller, callerIsAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const user = await getCaller(req);
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    if (!(await callerIsAdmin(user.id))) return json({ error: 'Apenas administradores.' }, 403);

    const { order_id, expires_in = 120 } = await req.json();
    const db = adminClient();

    const { data: order } = await db.from('orders').select('proof_path, order_number').eq('id', order_id).single();
    if (!order?.proof_path) return json({ error: 'Este pedido não tem comprovante.' }, 404);

    const { data, error } = await db.storage
      .from('payment-proofs')
      .createSignedUrl(order.proof_path, Math.min(Number(expires_in), 600));

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, url: data.signedUrl, order_number: order.order_number });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
