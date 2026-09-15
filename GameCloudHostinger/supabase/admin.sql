-- ============================================================
-- Como transformar sua conta em administrador
-- ============================================================
-- 1. Crie sua conta normalmente pelo site (register.html).
-- 2. Confirme o e-mail, se a confirmação estiver ligada.
-- 3. Rode o comando abaixo trocando o e-mail pelo seu.

insert into public.admins (user_id, role)
select id, 'owner' from auth.users where email = 'gamecloudhostinger@gmail.com'
on conflict (user_id) do nothing;

-- Conferir quem é admin:
-- select a.role, u.email from public.admins a join auth.users u on u.id = a.user_id;

-- Remover um admin:
-- delete from public.admins where user_id = (select id from auth.users where email = 'fulano@email.com');
