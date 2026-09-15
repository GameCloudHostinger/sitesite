// Cliente Supabase compartilhado por todas as páginas.
// Usa apenas a chave publicável — segura para o navegador.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CONFIG } from './config.js';

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,        // sessão persistente
      autoRefreshToken: true,
      detectSessionInUrl: true,    // necessário para links de recuperação/confirmação
    },
  }
);

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function requireUser(redirectTo = 'login.html') {
  const user = await getUser();
  if (!user) {
    const back = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`${redirectTo}?next=${back}`);
    return null;
  }
  return user;
}

export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return data === true;
}

// Chama uma Edge Function já com o token do usuário logado.
export async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}
