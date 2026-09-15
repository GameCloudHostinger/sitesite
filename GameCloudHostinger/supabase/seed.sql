-- ============================================================
-- GameCloudHostinger — catálogo inicial
-- Rode DEPOIS de schema.sql. Pode rodar de novo: atualiza os planos
-- existentes pelo slug em vez de duplicar.
-- Depois disso você edita tudo pelo painel /admin.
-- ============================================================

insert into public.categories (slug, name, description, icon, sort_order, active) values
  ('minecraft', 'Minecraft', 'Servidores com plugins, mods e painel Pterodactyl.', '⛏️', 1, true),
  ('fivem',     'FiveM',     'Servidores GTA RP com cache externo de 10 Gbps.',    '🚓', 2, true),
  ('dayz',      'DayZ',      'Sobrevivência em Chernarus com Ryzen 9 e DDR5.',     '🧟', 3, true),
  ('sites',     'Sites',     'Hospedagem de sites, lojas e páginas do seu servidor.', '🌐', 4, true),
  ('vps',       'VPS',       'Máquinas virtuais com acesso root e IP dedicado.',   '🖥️', 5, true),
  ('outros',    'Outros jogos', 'Rust, ARK, Palworld e mais — sob demanda.',       '🎮', 6, true)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

-- ------------------------------------------------------------
-- Minecraft
-- ------------------------------------------------------------
with c as (select id from public.categories where slug = 'minecraft')
insert into public.products (category_id, slug, name, emoji, tagline, price_cents, features, specs, best_seller, sort_order)
select c.id, v.slug, v.name, v.emoji, v.tagline, v.price_cents, v.features::jsonb, v.specs::jsonb, v.best_seller, v.sort_order
from c, (values
  ('mc-ferro','FERRO','🪨','Para começar seu servidor com os amigos.', 2990,
   '["4 GB RAM","Jogadores ilimitados","Proteção Anti-DDoS","FTP Web/FileZilla","Suporte a Plugins e Mods","Painel Pterodactyl","Banco de dados MySQL","Subdomínio GRÁTIS"]',
   '{"ram_mb":4096}', false, 1),
  ('mc-ouro','OURO','🥇','Espaço para plugins e um mundo maior.', 5990,
   '["6 GB RAM","Jogadores ilimitados","Proteção Anti-DDoS","FTP Web/FileZilla","Suporte a Plugins e Mods","Painel Pterodactyl","Banco de dados MySQL","Subdomínio GRÁTIS"]',
   '{"ram_mb":6144}', false, 2),
  ('mc-esmeralda','ESMERALDA','💚','O equilíbrio que a maioria escolhe.', 7990,
   '["8 GB RAM","Jogadores ilimitados","Proteção Anti-DDoS","FTP Web/FileZilla","Suporte a Plugins e Mods","Painel Pterodactyl","Banco de dados MySQL","Subdomínio GRÁTIS"]',
   '{"ram_mb":8192}', true, 3),
  ('mc-diamante','DIAMANTE','💎','Modpacks pesados sem travar.', 9990,
   '["10 GB RAM","Jogadores ilimitados","Proteção Anti-DDoS","FTP Web/FileZilla","Suporte a Plugins e Mods","Painel Pterodactyl","Banco de dados MySQL","Subdomínio GRÁTIS"]',
   '{"ram_mb":10240}', false, 4),
  ('mc-raposa','RAPOSA','🦊','Rede com vários mundos e lobby.', 11990,
   '["12 GB RAM","Jogadores ilimitados","Proteção Anti-DDoS","FTP Web/FileZilla","Suporte a Plugins e Mods","Painel Pterodactyl","Banco de dados MySQL","Subdomínio GRÁTIS"]',
   '{"ram_mb":12288}', false, 5),
  ('mc-lobo','LOBO','🐺','Para comunidades grandes e eventos.', 16990,
   '["16 GB RAM","Jogadores ilimitados","Proteção Anti-DDoS","FTP Web/FileZilla","Suporte a Plugins e Mods","Painel Pterodactyl","Banco de dados MySQL","Subdomínio GRÁTIS"]',
   '{"ram_mb":16384}', false, 6)
) as v(slug,name,emoji,tagline,price_cents,features,specs,best_seller,sort_order)
on conflict (slug) do update
  set name = excluded.name, emoji = excluded.emoji, tagline = excluded.tagline,
      price_cents = excluded.price_cents, features = excluded.features, specs = excluded.specs,
      best_seller = excluded.best_seller, sort_order = excluded.sort_order,
      category_id = excluded.category_id;

-- ------------------------------------------------------------
-- DayZ
-- ------------------------------------------------------------
with c as (select id from public.categories where slug = 'dayz')
insert into public.products (category_id, slug, name, emoji, tagline, price_cents, features, specs, best_seller, sort_order)
select c.id, v.slug, v.name, v.emoji, v.tagline, v.price_cents, v.features::jsonb, v.specs::jsonb, v.best_seller, v.sort_order
from c, (values
  ('dayz-cherno','CHERNO','🖥️','Servidor privado para o grupo.', 6990,
   '["10 Jogadores","2 Núcleos Ryzen 9","2 GB DDR5 RAM","40 GB SSD NVMe","Proteção DDoS Avançada","Painel Pterodactyl"]',
   '{"slots":10,"ram_mb":2048,"storage_gb":40,"cpu":"2 vCPU Ryzen 9"}', false, 1),
  ('dayz-elektro','ELEKTRO','⚡','Comunidade começando a crescer.', 10990,
   '["30 Jogadores","3 Núcleos Ryzen 9","4 GB DDR5 RAM","50 GB SSD NVMe","Proteção DDoS Avançada","Painel Pterodactyl"]',
   '{"slots":30,"ram_mb":4096,"storage_gb":50,"cpu":"3 vCPU Ryzen 9"}', false, 2),
  ('dayz-berezino','BEREZINO','🔥','Mods pesados e loot customizado.', 14990,
   '["50 Jogadores","4 Núcleos Ryzen 9","6 GB DDR5 RAM","60 GB SSD NVMe","Proteção DDoS Avançada","Painel Pterodactyl"]',
   '{"slots":50,"ram_mb":6144,"storage_gb":60,"cpu":"4 vCPU Ryzen 9"}', false, 3),
  ('dayz-nwaf','NWAF','🏆','O favorito dos servidores ativos.', 19990,
   '["70 Jogadores","5 Núcleos Ryzen 9","8 GB DDR5 RAM","70 GB SSD NVMe","Proteção DDoS Avançada","Painel Pterodactyl"]',
   '{"slots":70,"ram_mb":8192,"storage_gb":70,"cpu":"5 vCPU Ryzen 9"}', true, 4),
  ('dayz-zeleno','ZELENO','💚','Mapa cheio em horário de pico.', 24990,
   '["90 Jogadores","6 Núcleos Ryzen 9","10 GB DDR5 RAM","80 GB SSD NVMe","Proteção DDoS Avançada","Painel Pterodactyl"]',
   '{"slots":90,"ram_mb":10240,"storage_gb":80,"cpu":"6 vCPU Ryzen 9"}', false, 5),
  ('dayz-tisy','TISY','🚀','Máximo desempenho para eventos.', 36990,
   '["120 Jogadores","6 Núcleos Ryzen 9","16 GB DDR5 RAM","100 GB SSD NVMe","Proteção DDoS Avançada","Painel Pterodactyl"]',
   '{"slots":120,"ram_mb":16384,"storage_gb":100,"cpu":"6 vCPU Ryzen 9"}', false, 6)
) as v(slug,name,emoji,tagline,price_cents,features,specs,best_seller,sort_order)
on conflict (slug) do update
  set name = excluded.name, emoji = excluded.emoji, tagline = excluded.tagline,
      price_cents = excluded.price_cents, features = excluded.features, specs = excluded.specs,
      best_seller = excluded.best_seller, sort_order = excluded.sort_order,
      category_id = excluded.category_id;

-- ------------------------------------------------------------
-- FiveM
-- ------------------------------------------------------------
with c as (select id from public.categories where slug = 'fivem')
insert into public.products (category_id, slug, name, emoji, tagline, price_cents, features, specs, best_seller, sort_order)
select c.id, v.slug, v.name, v.emoji, v.tagline, v.price_cents, v.features::jsonb, v.specs::jsonb, v.best_seller, v.sort_order
from c, (values
  ('fivem-3gb','FIVE M 3GB','🎮','Até 20 jogadores.', 8990,
   '["3 GB RAM","AMD Ryzen 9 — 2 vCPU","40 GB SSD NVMe","Proteção DDoS inclusa","Cache externo 10Gbps — EXCLUSIVO"]',
   '{"slots":20,"ram_mb":3072,"storage_gb":40,"cpu":"2 vCPU Ryzen 9"}', false, 1),
  ('fivem-4gb','FIVE M 4GB','⚡','40 a 60 jogadores.', 10990,
   '["4 GB RAM","AMD Ryzen 9 — 3 vCPU","50 GB SSD NVMe","Proteção DDoS inclusa","Cache externo 10Gbps — EXCLUSIVO"]',
   '{"slots":60,"ram_mb":4096,"storage_gb":50,"cpu":"3 vCPU Ryzen 9"}', false, 2),
  ('fivem-6gb','FIVE M 6GB','🏆','60 a 80 jogadores.', 14990,
   '["6 GB RAM","AMD Ryzen 9 — 4 vCPU","60 GB SSD NVMe","Proteção DDoS inclusa","Cache externo 10Gbps — EXCLUSIVO"]',
   '{"slots":80,"ram_mb":6144,"storage_gb":60,"cpu":"4 vCPU Ryzen 9"}', true, 3),
  ('fivem-12gb','FIVE M 12GB','🚀','Mais de 100 jogadores.', 24990,
   '["12 GB RAM","AMD Ryzen 9 — 5 vCPU","80 GB SSD NVMe","Proteção DDoS inclusa","Cache externo 10Gbps — EXCLUSIVO"]',
   '{"slots":100,"ram_mb":12288,"storage_gb":80,"cpu":"5 vCPU Ryzen 9"}', false, 4),
  ('fivem-16gb','FIVE M 16GB','💎','150 a 200 jogadores.', 34990,
   '["16 GB RAM","AMD Ryzen 9 — 6 vCPU","90 GB SSD NVMe","Proteção DDoS inclusa","Cache externo 10Gbps — EXCLUSIVO"]',
   '{"slots":200,"ram_mb":16384,"storage_gb":90,"cpu":"6 vCPU Ryzen 9"}', false, 5)
) as v(slug,name,emoji,tagline,price_cents,features,specs,best_seller,sort_order)
on conflict (slug) do update
  set name = excluded.name, emoji = excluded.emoji, tagline = excluded.tagline,
      price_cents = excluded.price_cents, features = excluded.features, specs = excluded.specs,
      best_seller = excluded.best_seller, sort_order = excluded.sort_order,
      category_id = excluded.category_id;

-- ------------------------------------------------------------
-- Sites e VPS (exemplos — edite preços e recursos no painel admin)
-- ------------------------------------------------------------
with c as (select id from public.categories where slug = 'sites')
insert into public.products (category_id, slug, name, emoji, tagline, price_cents, features, specs, best_seller, sort_order)
select c.id, v.slug, v.name, v.emoji, v.tagline, v.price_cents, v.features::jsonb, '{}'::jsonb, v.best_seller, v.sort_order
from c, (values
  ('site-start','SITE START','🌐','Página do seu servidor no ar.', 1990,
   '["10 GB SSD NVMe","1 site","SSL grátis","E-mail profissional","Painel simplificado"]', false, 1),
  ('site-pro','SITE PRO','🚀','Loja e sistema de votação.', 3990,
   '["30 GB SSD NVMe","5 sites","SSL grátis","Banco de dados MySQL","Backup diário"]', true, 2)
) as v(slug,name,emoji,tagline,price_cents,features,best_seller,sort_order)
on conflict (slug) do update
  set price_cents = excluded.price_cents, features = excluded.features, category_id = excluded.category_id;

with c as (select id from public.categories where slug = 'vps')
insert into public.products (category_id, slug, name, emoji, tagline, price_cents, features, specs, best_seller, sort_order)
select c.id, v.slug, v.name, v.emoji, v.tagline, v.price_cents, v.features::jsonb, v.specs::jsonb, v.best_seller, v.sort_order
from c, (values
  ('vps-basic','VPS BASIC','🖥️','Acesso root para seus projetos.', 5990,
   '["2 vCPU","4 GB RAM","60 GB SSD NVMe","IP dedicado","Acesso root"]','{"ram_mb":4096,"storage_gb":60}', false, 1),
  ('vps-plus','VPS PLUS','⚙️','Bots, sites e painéis juntos.', 9990,
   '["4 vCPU","8 GB RAM","120 GB SSD NVMe","IP dedicado","Acesso root"]','{"ram_mb":8192,"storage_gb":120}', false, 2)
) as v(slug,name,emoji,tagline,price_cents,features,specs,best_seller,sort_order)
on conflict (slug) do update
  set price_cents = excluded.price_cents, features = excluded.features, category_id = excluded.category_id;
