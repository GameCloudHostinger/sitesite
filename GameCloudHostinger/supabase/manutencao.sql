-- ============================================================
-- Rotinas de vencimento e suspensão automática (opcional)
-- Requer as extensões pg_cron e pg_net, que você liga em
-- Database > Extensions no painel do Supabase.
-- ============================================================

-- Marca pedidos de PIX que passaram da validade
create or replace function public.expire_stale_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.orders
     set status = 'expired'
   where status = 'awaiting_pix'
     and expires_at is not null
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Marca servidores vencidos (a suspensão no painel é feita pela Edge Function)
create or replace function public.flag_expired_servers()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.servers
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Lista quem vence nos próximos 7 dias (use para disparar o e-mail de aviso)
create or replace view public.servers_expiring_soon as
  select s.id, s.name, s.expires_at, p.email, p.full_name,
         (s.expires_at - current_date) as days_left
    from public.servers s
    join public.profiles p on p.id = s.user_id
   where s.status = 'active'
     and s.expires_at between current_date and current_date + 7;

-- Agendamento diário (descomente depois de habilitar pg_cron):
-- select cron.schedule('gch-expire-orders',  '0 * * * *', $$select public.expire_stale_orders()$$);
-- select cron.schedule('gch-expire-servers', '5 3 * * *', $$select public.flag_expired_servers()$$);
