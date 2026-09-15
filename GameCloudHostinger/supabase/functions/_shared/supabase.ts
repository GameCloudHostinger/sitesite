// Clientes Supabase para uso dentro das Edge Functions.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// Ignora RLS. Use SOMENTE dentro da função, nunca no frontend.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

// Identifica o usuário que chamou a função a partir do token enviado pelo navegador.
export async function getCaller(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function callerIsAdmin(userId: string) {
  const admin = adminClient();
  const { data } = await admin.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(data);
}
