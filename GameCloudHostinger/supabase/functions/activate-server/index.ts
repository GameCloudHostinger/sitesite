// ============================================================
// activate-server — ponte com a API do Pterodactyl.
//
// Ações: create | suspend | unsuspend | delete | update | status
//
// Segredos:
//   PTERODACTYL_URL          -> https://painel.seudominio.com
//   PTERODACTYL_API_KEY      -> chave da Application API (nunca no frontend)
//   PTERODACTYL_NODE_ID, PTERODACTYL_EGG_ID, PTERODACTYL_NEST_ID,
//   PTERODACTYL_DOCKER_IMAGE, PTERODACTYL_STARTUP
//
// Quem pode chamar: administradores logados, ou o próprio webhook usando
// a service_role key (internal: true).
// ============================================================
import { handleOptions, json } from '../_shared/cors.ts';
import { adminClient, getCaller, callerIsAdmin } from '../_shared/supabase.ts';

const PANEL   = Deno.env.get('PTERODACTYL_URL');
const API_KEY = Deno.env.get('PTERODACTYL_API_KEY');

async function panel(path: string, init: RequestInit = {}) {
  const res = await fetch(`${PANEL}/api/application${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errors?.[0]?.detail ?? `Pterodactyl respondeu ${res.status}`);
  return body;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const payload = await req.json();
    const { order_id, action = 'create', server_id, internal } = payload;

    // Autorização: chamada interna com service_role, ou admin logado.
    const authHeader = req.headers.get('Authorization') ?? '';
    const isInternal = internal === true &&
      authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '\u0000');

    if (!isInternal) {
      const user = await getCaller(req);
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      if (!(await callerIsAdmin(user.id))) return json({ error: 'Apenas administradores.' }, 403);
    }

    if (!PANEL || !API_KEY) {
      return json({
        error: 'Pterodactyl ainda não configurado. Cadastre PTERODACTYL_URL e PTERODACTYL_API_KEY nos segredos.',
      }, 503);
    }

    const db = adminClient();

    if (action === 'status') {
      const info = await panel(`/servers/${server_id}`);
      return json({ ok: true, server: info });
    }

    if (['suspend', 'unsuspend'].includes(action)) {
      await panel(`/servers/${server_id}/${action}`, { method: 'POST' });
      await db.from('servers')
        .update({ status: action === 'suspend' ? 'suspended' : 'active' })
        .eq('pterodactyl_server_id', String(server_id));
      return json({ ok: true, message: action === 'suspend' ? 'Servidor suspenso.' : 'Servidor reativado.' });
    }

    if (action === 'delete') {
      await panel(`/servers/${server_id}`, { method: 'DELETE' });
      await db.from('servers').update({ status: 'cancelled' }).eq('pterodactyl_server_id', String(server_id));
      return json({ ok: true, message: 'Servidor excluído.' });
    }

    // ---- create ----
    const { data: order } = await db.from('orders')
      .select('*, products(specs, name)').eq('id', order_id).single();
    if (!order) return json({ error: 'Pedido não encontrado.' }, 404);

    const specs = order.products?.specs ?? {};
    const ramMb = Number(specs.ram_mb ?? 2048);
    const diskMb = Number(specs.storage_gb ?? 20) * 1024;

    // 1. Garante o usuário no painel
    const email = order.customer_email;
    const found = await panel(`/users?filter[email]=${encodeURIComponent(email)}`);
    let panelUserId = found?.data?.[0]?.attributes?.id;

    if (!panelUserId) {
      const created = await panel('/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          username: email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() + Math.floor(Math.random() * 999),
          first_name: (order.customer_name || 'Cliente').split(' ')[0],
          last_name: (order.customer_name || 'GCH').split(' ').slice(1).join(' ') || 'Cliente',
        }),
      });
      panelUserId = created.attributes.id;
      // O cliente define a senha pelo "esqueci minha senha" do painel — nunca guardamos senha aqui.
    }

    // 2. Cria o servidor
    const created = await panel('/servers', {
      method: 'POST',
      body: JSON.stringify({
        name: `${order.product_name} — ${order.order_number}`,
        user: panelUserId,
        egg: Number(Deno.env.get('PTERODACTYL_EGG_ID') ?? 1),
        nest: Number(Deno.env.get('PTERODACTYL_NEST_ID') ?? 1),
        docker_image: Deno.env.get('PTERODACTYL_DOCKER_IMAGE') ?? 'ghcr.io/pterodactyl/yolks:java_17',
        startup: Deno.env.get('PTERODACTYL_STARTUP') ?? 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}',
        environment: { SERVER_JARFILE: 'server.jar', VERSION: 'latest', BUILD_NUMBER: 'latest' },
        limits: { memory: ramMb, swap: 0, disk: diskMb, io: 500, cpu: 0 },
        feature_limits: { databases: 1, allocations: 1, backups: 2 },
        deploy: {
          locations: [Number(Deno.env.get('PTERODACTYL_LOCATION_ID') ?? 1)],
          dedicated_ip: false,
          port_range: [],
        },
        start_on_completion: true,
      }),
    });

    const attrs = created.attributes;
    const allocation = attrs.relationships?.allocations?.data?.[0]?.attributes;

    const { data: server } = await db.from('servers').insert({
      user_id: order.user_id,
      order_id: order.id,
      name: attrs.name,
      game: order.category_slug,
      plan_name: order.product_name,
      ip: allocation?.ip ?? null,
      port: allocation?.port ?? null,
      status: 'active',
      ram_mb: ramMb,
      cpu: specs.cpu ?? null,
      storage_gb: specs.storage_gb ?? null,
      panel_url: PANEL,
      panel_username: email,
      pterodactyl_server_id: String(attrs.id),
      expires_at: order.due_date,
    }).select().single();

    await db.from('orders').update({ status: 'active' }).eq('id', order.id);

    return json({ ok: true, message: 'Servidor criado no Pterodactyl.', server });
  } catch (err) {
    console.error('activate-server:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
