-- ============================================================
-- GameCloudHostinger — schema completo
-- Rode este arquivo inteiro no Supabase > SQL Editor > New query.
-- É idempotente: pode ser executado mais de uma vez.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Tipos
-- ------------------------------------------------------------
do $$ begin
  create type order_status as enum (
    'awaiting_pix',
    'proof_received',
    'payment_confirmed',
    'active',
    'cancelled',
    'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type server_status as enum ('provisioning','active','suspended','cancelled','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open','answered','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. Tabelas
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'admin',   -- 'admin' | 'owner'
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  icon        text,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete set null,
  slug         text unique not null,
  name         text not null,
  emoji        text,
  tagline      text,
  price_cents  int  not null check (price_cents >= 0),
  cycle_days   int  not null default 30,
  features     jsonb not null default '[]'::jsonb,
  specs        jsonb not null default '{}'::jsonb,   -- ram_mb, cpu, storage_gb, slots
  best_seller  boolean not null default false,
  active       boolean not null default true,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  customer_name  text,
  customer_email text,
  product_id     uuid references public.products(id) on delete set null,
  product_name   text not null,
  category_slug  text,
  amount_cents   int  not null check (amount_cents >= 0),
  status         order_status not null default 'awaiting_pix',
  gateway        text,                -- 'asaas' | 'manual' | ...
  payment_id     text,                -- id da cobrança no gateway
  pix_payload    text,                -- código copia e cola
  pix_qr_image   text,                -- imagem base64 ou URL do QR
  proof_path     text,                -- caminho no bucket payment-proofs
  proof_sent_at  timestamptz,
  paid_at        timestamptz,
  due_date       date,                -- vencimento do serviço contratado
  expires_at     timestamptz,         -- validade da cobrança PIX
  admin_notes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_user_idx   on public.orders(user_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_payid_idx  on public.orders(payment_id);

create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references public.orders(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,
  gateway            text not null,
  gateway_payment_id text,
  amount_cents       int not null default 0,
  status             text not null default 'pending',
  paid_at            timestamptz,
  raw                jsonb,
  created_at         timestamptz not null default now()
);

create table if not exists public.servers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  name          text not null,
  game          text,
  plan_name     text,
  ip            text,
  port          int,
  status        server_status not null default 'provisioning',
  ram_mb        int,
  cpu           text,
  storage_gb    int,
  panel_url     text,
  panel_username text,
  pterodactyl_server_id text,
  expires_at    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists servers_user_idx on public.servers(user_id);

create table if not exists public.tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  subject    text not null,
  category   text not null default 'geral',
  priority   ticket_priority not null default 'normal',
  status     ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  is_staff   boolean not null default false,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_ticket_idx on public.ticket_messages(ticket_id);

-- Configurações editáveis pelo painel admin (nome, logo, contatos, cores...)
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,   -- true = qualquer visitante pode ler
  updated_at timestamptz not null default now()
);

-- Eventos de webhook, para auditoria e idempotência
create table if not exists public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text,
  payload      jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- Fila/registro de e-mails transacionais
create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  template   text not null,
  payload    jsonb,
  status     text not null default 'queued',
  error      text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. Funções auxiliares
-- ------------------------------------------------------------

-- Verificação de administrador (security definer evita recursão de RLS)
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, anon;

-- Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Gera número único no formato GCH-XXXXXXXX
create or replace function public.generate_order_number()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'GCH-' || upper(encode(gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.orders o where o.order_number = candidate);
  end loop;
  return candidate;
end;
$$;

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch   on public.orders;
drop trigger if exists servers_touch  on public.servers;
drop trigger if exists products_touch on public.products;
drop trigger if exists tickets_touch  on public.tickets;
create trigger orders_touch   before update on public.orders   for each row execute function public.touch_updated_at();
create trigger servers_touch  before update on public.servers  for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger tickets_touch  before update on public.tickets  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 4. Criação de pedido (o preço vem SEMPRE do banco, nunca do navegador)
-- ------------------------------------------------------------
create or replace function public.create_order(p_product_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_product  public.products;
  v_category public.categories;
  v_profile  public.profiles;
  v_order    public.orders;
begin
  if v_user is null then
    raise exception 'Você precisa estar logado para criar um pedido.';
  end if;

  select * into v_product from public.products where id = p_product_id and active = true;
  if not found then
    raise exception 'Produto indisponível.';
  end if;

  select * into v_category from public.categories where id = v_product.category_id;
  select * into v_profile  from public.profiles   where id = v_user;

  insert into public.orders (
    order_number, user_id, customer_name, customer_email,
    product_id, product_name, category_slug, amount_cents,
    status, gateway, due_date, expires_at
  ) values (
    public.generate_order_number(),
    v_user,
    coalesce(v_profile.full_name, ''),
    coalesce(v_profile.email, (select email from auth.users where id = v_user)),
    v_product.id,
    v_product.name,
    coalesce(v_category.slug, 'outros'),
    v_product.price_cents,
    'awaiting_pix',
    null,
    (current_date + (v_product.cycle_days || ' days')::interval)::date,
    now() + interval '24 hours'
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.create_order(uuid) from public;
grant execute on function public.create_order(uuid) to authenticated;

-- Cliente marca que enviou o comprovante (não confirma pagamento!)
create or replace function public.mark_proof_sent(p_order_id uuid, p_path text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders;
begin
  update public.orders
     set proof_path    = p_path,
         proof_sent_at = now(),
         status        = case when status = 'awaiting_pix' then 'proof_received'::order_status
                              else status end
   where id = p_order_id
     and user_id = auth.uid()
     and status in ('awaiting_pix','proof_received')
  returning * into v_order;

  if not found then
    raise exception 'Pedido não encontrado ou não pode mais receber comprovante.';
  end if;
  return v_order;
end;
$$;

revoke all on function public.mark_proof_sent(uuid, text) from public;
grant execute on function public.mark_proof_sent(uuid, text) to authenticated;

-- Estatísticas do dashboard admin
create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.';
  end if;

  return json_build_object(
    'customers',          (select count(*) from public.profiles),
    'orders',             (select count(*) from public.orders),
    'awaiting_payment',   (select count(*) from public.orders where status in ('awaiting_pix','proof_received')),
    'payments_confirmed', (select count(*) from public.orders where status in ('payment_confirmed','active')),
    'servers_active',     (select count(*) from public.servers where status = 'active'),
    'servers_suspended',  (select count(*) from public.servers where status = 'suspended'),
    'revenue_cents',      (select coalesce(sum(amount_cents),0) from public.orders where status in ('payment_confirmed','active')),
    'revenue_month_cents',(select coalesce(sum(amount_cents),0) from public.orders
                            where status in ('payment_confirmed','active')
                              and created_at >= date_trunc('month', now()))
  );
end;
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.admins          enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.payments        enable row level security;
alter table public.servers         enable row level security;
alter table public.tickets         enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.settings        enable row level security;
alter table public.webhook_events  enable row level security;
alter table public.email_log       enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- admins (leitura apenas do próprio registro; escrita só via service_role)
drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- catálogo: leitura pública, escrita só admin
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select to anon, authenticated using (active or public.is_admin());

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read on public.products;
create policy products_read on public.products
  for select to anon, authenticated using (active or public.is_admin());

drop policy if exists products_write on public.products;
create policy products_write on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- pedidos: cliente lê os próprios; criação só pela função create_order;
-- mudança de status só por admin ou pelo webhook (service_role ignora RLS).
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- pagamentos
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- servidores
drop policy if exists servers_select_own on public.servers;
create policy servers_select_own on public.servers
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists servers_admin_write on public.servers;
create policy servers_admin_write on public.servers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tickets
drop policy if exists tickets_select_own on public.tickets;
create policy tickets_select_own on public.tickets
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists tickets_insert_own on public.tickets;
create policy tickets_insert_own on public.tickets
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

drop policy if exists ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated with check (
    (user_id = auth.uid() and (
      public.is_admin() or exists (
        select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()
      )
    ))
    and (is_staff = false or public.is_admin())
  );

-- settings
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select to anon, authenticated using (is_public or public.is_admin());

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- webhook_events / email_log: nenhum acesso via chave publicável (apenas admin lê)
drop policy if exists webhook_events_admin on public.webhook_events;
create policy webhook_events_admin on public.webhook_events
  for select to authenticated using (public.is_admin());

drop policy if exists email_log_admin on public.email_log;
create policy email_log_admin on public.email_log
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 6. Storage: bucket privado de comprovantes
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760,
        array['image/png','image/jpeg','image/jpg','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/png','image/jpeg','image/jpg','application/pdf'];

-- O caminho do arquivo é sempre: <user_id>/<order_number>-<timestamp>.<ext>
drop policy if exists proofs_insert_own on storage.objects;
create policy proofs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists proofs_select_own on storage.objects;
create policy proofs_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists proofs_delete_admin on storage.objects;
create policy proofs_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- ------------------------------------------------------------
-- 7. Configurações iniciais
-- ------------------------------------------------------------
insert into public.settings (key, value, is_public) values
  ('company', jsonb_build_object(
      'name','GameCloudHostinger',
      'slogan','Sua diversão, nossa infraestrutura.',
      'email','gamecloudhostinger@gmail.com',
      'whatsapp','555491581667',
      'discord',''
   ), true),
  ('pix', jsonb_build_object('key','','type','','receiver','','gateway','asaas','enabled', false), true)
on conflict (key) do nothing;
