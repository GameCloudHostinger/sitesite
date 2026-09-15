// ============================================================
// GameCloudHostinger — configuração pública do frontend
// ------------------------------------------------------------
// TUDO neste arquivo é público e vai para o GitHub.
// NUNCA coloque aqui: service_role key, senha do Pterodactyl,
// token do gateway PIX ou API key de e-mail.
// Esses segredos ficam apenas em Supabase > Edge Functions > Secrets.
// ============================================================

export const CONFIG = {
  // ---- Supabase (chave publicável / anon — pode ficar no frontend) ----
  SUPABASE_URL: 'https://rkgaciqqcrjjwdwyimtw.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_Ojl9Qd_oU3KYtQjnEsjoZw_Kf5Ex1JF',

  // ---- Identidade ----
  COMPANY_NAME: 'GameCloudHostinger',
  SLOGAN: 'Sua diversão, nossa infraestrutura.',

  // ---- Contato ----
  WHATSAPP_NUMBER: '555491581667',       // usado nos links wa.me
  WHATSAPP_DISPLAY: '+55 54 9158-1667',
  SUPPORT_EMAIL: 'gamecloudhostinger@gmail.com',
  DISCORD_URL: '',                        // preencha quando tiver

  // ---- PIX ----
  // Chave PIX manual (fallback enquanto o gateway não estiver ativo).
  // Deixe vazio até você definir sua chave. Uma chave PIX não é segredo,
  // mas o pedido SÓ é confirmado após validação (webhook ou conferência do admin).
  PIX_KEY: '3adc2f04-ff93-4671-a896-3330a46b5156',
  PIX_KEY_TYPE: 'gamecloudhostinger@gmail.com',                       // 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'
  PIX_RECEIVER_NAME: 'wuillian machado de oliveira',
  PIX_CITY: '',

  // ---- Gateway ----
  // Quando a Edge Function create-payment estiver configurada com as
  // credenciais do provedor, deixe true para gerar QR Code automático.
  PIX_GATEWAY_ENABLED: false,
  PIX_PROVIDER: 'asaas',                  // provedor escolhido (veja README)

  // ---- Painel de jogos ----
  PTERODACTYL_PANEL_URL: 'https://painel.gamecloudhostinger.com',

  // ---- Regras de negócio ----
  ORDER_PREFIX: 'GCH-',
  DEFAULT_CYCLE_DAYS: 30,
  EXPIRING_SOON_DAYS: 7,
};

export function waLink(message) {
  return `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
