# GameCloudHostinger

**Sua diversão, nossa infraestrutura.**

Site e plataforma de hospedagem de servidores de jogos: catálogo (Minecraft, FiveM, DayZ, sites, VPS), cadastro e login, pedidos com PIX, envio de comprovante, área do cliente e painel administrativo.

Frontend 100% estático (HTML, CSS e JavaScript puro, sem build). Todo o resto roda no Supabase: banco, autenticação, armazenamento privado e Edge Functions.

---

## Sumário

1. [O que já funciona](#1-o-que-já-funciona)
2. [Estrutura de arquivos](#2-estrutura-de-arquivos)
3. [Criar o repositório no GitHub](#3-criar-o-repositório-no-github)
4. [Configurar o Supabase](#4-configurar-o-supabase)
5. [Executar o SQL](#5-executar-o-sql)
6. [Configurar o Storage](#6-configurar-o-storage-comprovantes)
7. [Criar seu usuário administrador](#7-criar-seu-usuário-administrador)
8. [Configurar o PIX](#8-configurar-o-pix)
9. [Configurar o Pterodactyl](#9-configurar-o-pterodactyl)
10. [Configurar os e-mails](#10-configurar-os-e-mails)
11. [Publicar o site](#11-publicar-o-site)
12. [Configurar o domínio depois](#12-configurar-o-domínio-depois)
13. [Segurança: o que nunca vai para o GitHub](#13-segurança-o-que-nunca-vai-para-o-github)
14. [Revisão do projeto e pontos de atenção](#14-revisão-do-projeto-e-pontos-de-atenção)

---

## 1. O que já funciona

| Área | Situação |
|---|---|
| Site institucional, catálogo, FAQ, responsivo | Pronto |
| Cadastro, login, logout, sessão persistente, recuperação de senha | Pronto |
| Criação de pedido com número `GCH-XXXXXXXX` | Pronto |
| Envio de comprovante para bucket privado | Pronto |
| Link de comprovante por WhatsApp já preenchido | Pronto |
| Área do cliente (pedidos, servidores, pagamentos, renovação, tickets) | Pronto |
| Painel admin (clientes, pedidos, servidores, produtos, tickets, configurações) | Pronto |
| RLS, funções seguras, URLs assinadas | Pronto |
| Cobrança PIX automática | Código pronto — falta sua credencial do provedor |
| Criação automática de servidor no Pterodactyl | Código pronto — falta a API key do painel |
| E-mails transacionais | Código pronto — falta a API key do serviço de e-mail |

Enquanto o gateway não estiver configurado, o site funciona no modo manual: o cliente paga na chave PIX, envia o comprovante e você confirma no painel admin.

---

## 2. Estrutura de arquivos

```
GameCloudHostinger/
├── index.html              Página inicial e catálogo
├── login.html              Login
├── register.html           Cadastro
├── recuperar-senha.html    Pedido de link de recuperação
├── nova-senha.html         Definição da nova senha
├── pedido.html             Pagamento PIX + envio de comprovante
├── dashboard.html          Área do cliente
├── admin.html              Painel administrativo
│
├── css/
│   ├── style.css           Site público, botões, formulários
│   ├── dashboard.css       Layout das áreas internas
│   └── admin.css           Ajustes do painel admin
│
├── js/
│   ├── config.js           ⚠️ URL e chave PUBLICÁVEL do Supabase, contatos, PIX_KEY
│   ├── supabase.js         Cliente e helpers de sessão
│   ├── ui.js               Formatação, status em português, toasts
│   ├── products.js         Catálogo vindo do banco
│   ├── main.js             Página inicial
│   ├── checkout.js         Comprar agora → cria o pedido
│   ├── auth.js             Cadastro, login, recuperação
│   ├── pedido.js           PIX, comprovante, WhatsApp
│   └── admin.js            Painel administrativo
│
├── assets/favicon.svg
│
├── supabase/
│   ├── schema.sql          Tabelas, RLS, funções, bucket
│   ├── seed.sql            Todos os planos Minecraft, FiveM, DayZ, sites e VPS
│   ├── admin.sql           Como virar administrador
│   ├── manutencao.sql      Vencimento e suspensão automática
│   ├── config.toml         verify_jwt por função
│   └── functions/
│       ├── _shared/        CORS e clientes Supabase
│       ├── create-payment/ Gera a cobrança PIX
│       ├── pix-webhook/    Recebe e valida a confirmação
│       ├── activate-server/Cria/suspende/exclui no Pterodactyl
│       ├── send-email/     E-mails transacionais
│       └── admin-proof-url/URL assinada de comprovante
│
├── .env.example            Modelo dos segredos (sem valores!)
├── .gitignore
└── README.md
```

---

## 3. Criar o repositório no GitHub

1. Acesse github.com, clique em **New repository**.
2. Nome: `GameCloudHostinger`. Deixe **Public** (ou Private, se preferir; o GitHub Pages em conta gratuita exige público).
3. **Não** marque "Add a README" — este projeto já tem um.
4. Clique em **Create repository**.

Enviando os arquivos pelo navegador (mais simples):

1. Na página do repositório vazio, clique em **uploading an existing file**.
2. Arraste a pasta inteira `GameCloudHostinger` (ou o conteúdo dela) para a área de upload.
3. Escreva a mensagem "primeiro envio" e clique em **Commit changes**.

Enviando pelo Git (se preferir o terminal):

```bash
cd GameCloudHostinger
git init
git add .
git commit -m "primeiro envio"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/GameCloudHostinger.git
git push -u origin main
```

> Confira antes: o arquivo `.env` **não** pode aparecer na lista. O `.gitignore` já bloqueia.

---

## 4. Configurar o Supabase

1. Entre em supabase.com e abra seu projeto (`rkgaciqqcrjjwdwyimtw`).
2. Em **Project Settings → API**, confira que a URL bate com a do arquivo `js/config.js`:

```js
SUPABASE_URL: 'https://rkgaciqqcrjjwdwyimtw.supabase.co',
SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_Ojl9Qd_oU3KYtQjnEsjoZw_Kf5Ex1JF',
```

> Atenção ao final da URL: é **`.supabase.co`**, não `.supabase.com`. Se usar `.com` o site não conecta.

3. Em **Authentication → Providers → Email**, deixe **Email** ligado.
4. Em **Authentication → URL Configuration**:
   - **Site URL**: o endereço final do site (ex.: `https://seuusuario.github.io/GameCloudHostinger`).
   - **Redirect URLs**: adicione `https://seuusuario.github.io/GameCloudHostinger/*` e, para testar local, `http://localhost:5500/*`.
   Sem isso, o link de recuperação de senha não volta para o site.
5. **Confirm email**: se deixar ligado (recomendado), o cliente precisa confirmar antes de entrar. O site já avisa isso na tela de cadastro.

---

## 5. Executar o SQL

No painel: **SQL Editor → New query**.

1. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Cria tabelas, RLS, funções e o bucket.
2. Nova query: cole `supabase/seed.sql` e rode. Cria as categorias e todos os planos.
3. Opcional: `supabase/manutencao.sql`, para as rotinas de vencimento.

Para conferir: **Table Editor** deve mostrar `profiles`, `admins`, `categories`, `products`, `orders`, `payments`, `servers`, `tickets`, `ticket_messages`, `settings`, `webhook_events`, `email_log`.

---

## 6. Configurar o Storage (comprovantes)

O `schema.sql` já cria o bucket **`payment-proofs`** como **privado**, com limite de 10 MB e aceitando PNG, JPG e PDF.

Confira em **Storage → Buckets**: o bucket precisa aparecer com o cadeado (privado). Se aparecer público, clique nele e desmarque "Public bucket".

Como funciona o acesso:
- O arquivo é salvo em `ID-DO-USUARIO/GCH-XXXXXXXX-timestamp.ext`.
- O cliente só lê arquivos da própria pasta.
- O admin lê tudo, sempre através de uma **URL assinada** que expira em 1 a 2 minutos.
- Nenhum comprovante fica acessível por link público.

---

## 7. Criar seu usuário administrador

1. Abra o site publicado e crie sua conta em `register.html` com o e-mail `gamecloudhostinger@gmail.com`.
2. Confirme o e-mail, se a confirmação estiver ligada.
3. No **SQL Editor**, rode o conteúdo de `supabase/admin.sql` (ele já usa esse e-mail).
4. Acesse `admin.html`. Se a tela de bloqueio continuar, saia e entre de novo para renovar o token.

O painel não depende de esconder o link: a função `is_admin()` e as políticas de RLS bloqueiam qualquer escrita de quem não estiver na tabela `admins`.

---

## 8. Configurar o PIX

### 8.1 Modo manual (funciona hoje, sem integração)

Em `js/config.js`:

```js
PIX_KEY: 'sua-chave-aqui',
PIX_KEY_TYPE: 'email',
PIX_RECEIVER_NAME: 'Nome que aparece no recebimento',
```

O cliente paga, envia o comprovante, e você confirma em **admin → Pedidos → Confirmar pagamento**. O sistema nunca marca pago sozinho.

### 8.2 Modo automático (gateway)

O provedor escolhido no código é o **Asaas** — instituição de pagamento autorizada pelo Banco Central, com API REST documentada, ambiente de testes (sandbox) e webhook próprio. A função `create-payment` gera a cobrança PIX e a `pix-webhook` confirma o pagamento. Alternativas equivalentes, caso queira trocar: Efí (antiga Gerencianet), OpenPix/Woovi ou Banco Inter — a troca fica isolada na função `createCharge`.

**Sobre idade e titularidade da conta:** a conta de recebimento precisa atender às exigências de idade e documentação do provedor. Se você ainda não tiver idade para abrir a conta em seu nome, a conta deve ser aberta por um **responsável legal**, que será o titular oficial do recebimento e responderá por ele. Não há caminho técnico que contorne essa verificação, e tentar contornar dá bloqueio e retenção de valores. Se for esse o caso, converse com seu responsável antes de criar a conta.

**Passo a passo:**

1. Crie a conta no provedor e gere a chave de API (comece pelo sandbox).
2. No Supabase: **Project Settings → Edge Functions → Secrets**, cadastre:

   | Segredo | Valor |
   |---|---|
   | `PIX_PROVIDER_API_KEY` | token da API do provedor |
   | `PIX_PROVIDER_BASE_URL` | `https://api-sandbox.asaas.com/v3` (testes) ou `https://api.asaas.com/v3` |
   | `PIX_WEBHOOK_TOKEN` | uma senha longa inventada por você |
   | `ALLOWED_ORIGIN` | o endereço do seu site |

3. Faça o deploy das funções:

```bash
npm install -g supabase
supabase login
supabase link --project-ref rkgaciqqcrjjwdwyimtw
supabase functions deploy create-payment
supabase functions deploy pix-webhook --no-verify-jwt
```

4. No painel do provedor, cadastre o webhook apontando para:
   `https://rkgaciqqcrjjwdwyimtw.supabase.co/functions/v1/pix-webhook`
   e coloque o mesmo `PIX_WEBHOOK_TOKEN` no campo de token de autenticação.
5. Em `js/config.js`, mude `PIX_GATEWAY_ENABLED: true`.
6. Teste no sandbox antes de ir para produção.

**Como o pagamento é validado** (nenhuma etapa é opcional):

```
pedido criado → cobrança PIX gerada → cliente paga
→ provedor chama o webhook → função confere o token do webhook
→ função reconsulta a cobrança direto na API do provedor
→ confere o valor pago contra o valor do pedido
→ grava payment_confirmed no Supabase → dispara e-mail e ativação
```

O sistema nunca aceita "eu paguei" como confirmação, nem confia no corpo do POST sem reconsultar a origem.

---

## 9. Configurar o Pterodactyl

1. No painel Pterodactyl: **Admin → Application API → Create New**, com permissão de leitura e escrita em Users, Servers e Nodes.
2. Cadastre nos Secrets do Supabase: `PTERODACTYL_URL`, `PTERODACTYL_API_KEY`, `PTERODACTYL_NEST_ID`, `PTERODACTYL_EGG_ID`, `PTERODACTYL_LOCATION_ID`, `PTERODACTYL_DOCKER_IMAGE`, `PTERODACTYL_STARTUP`.
3. Deploy: `supabase functions deploy activate-server`.
4. Em `js/config.js`, ajuste `PTERODACTYL_PANEL_URL` para o endereço do seu painel.
5. Para criar automaticamente assim que o pagamento cair, cadastre o segredo `AUTO_PROVISION=true`. Enquanto estiver `false`, você clica em **Criar via Pterodactyl** no painel admin.

A API key nunca aparece no navegador: o frontend chama a Edge Function, e ela fala com o painel.

---

## 10. Configurar os e-mails

1. Crie conta em um serviço transacional (o código usa a API do **Resend**; Brevo e Mailgun funcionam com pequena adaptação no `fetch`).
2. Verifique seu domínio no serviço, se já tiver um.
3. Cadastre os segredos `EMAIL_API_KEY`, `EMAIL_FROM` e `SITE_URL`.
4. Deploy: `supabase functions deploy send-email`.

Templates prontos: conta criada, pedido criado, comprovante recebido, pagamento confirmado, serviço ativado, vencimento próximo e serviço suspenso.

Sem a `EMAIL_API_KEY`, nada quebra: a função registra o envio como `skipped` na tabela `email_log`.

---

## 11. Publicar o site

**GitHub Pages** (grátis e suficiente, já que o frontend é estático):

1. No repositório: **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**; branch `main`, pasta `/ (root)`. Salve.
3. Em um ou dois minutos o site fica em `https://seuusuario.github.io/GameCloudHostinger/`.
4. Volte ao Supabase e coloque esse endereço em **Authentication → URL Configuration**.

Alternativas com deploy automático a cada commit: **Netlify** ou **Vercel** — basta conectar o repositório, sem comando de build e com a pasta raiz como diretório de publicação.

---

## 12. Configurar o domínio depois

1. Registre o domínio (Registro.br para `.com.br`, ou qualquer registrador internacional).
2. No GitHub Pages, campo **Custom domain**, escreva `gamecloudhostinger.com` e salve — isso cria o arquivo `CNAME` no repositório.
3. No painel de DNS do registrador:
   - `A` para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`
   - `CNAME` de `www` para `seuusuario.github.io`
4. Marque **Enforce HTTPS** quando o certificado for emitido (leva alguns minutos).
5. Atualize no Supabase a **Site URL**, as **Redirect URLs** e o segredo `ALLOWED_ORIGIN`.

---

## 13. Segurança: o que nunca vai para o GitHub

Pode ficar no repositório (é público por natureza):
- URL do projeto Supabase
- Chave **publicável** (`sb_publishable_...`)
- Chave PIX, WhatsApp, e-mail de contato

Nunca pode:
- `service_role` key do Supabase
- Senha do banco
- API key do Pterodactyl
- Token ou chave privada do gateway PIX
- Token do webhook
- API key do serviço de e-mail

Tudo dessa segunda lista fica só em **Supabase → Edge Functions → Secrets**. Se algum segredo vazar em um commit, revogue no provedor e gere outro — apagar o commit não basta.

Camadas de proteção já implementadas:
- RLS ligado em todas as tabelas; o cliente só lê os próprios pedidos, servidores, pagamentos, comprovantes e tickets.
- O preço vem da função `create_order` no banco, então alterar o HTML não muda o valor cobrado.
- Mudança de status de pedido só por admin ou pelo webhook validado.
- Bucket privado com URLs assinadas de curta duração.
- Webhook com token verificado em tempo constante, idempotência por evento e reconsulta na origem.
- `admins` como tabela separada, com `is_admin()` em `security definer`.

---

## 14. Revisão do projeto e pontos de atenção

Revisão feita antes da entrega:

- **Links**: todas as páginas se referenciam por caminho relativo e existem no projeto (`index`, `login`, `register`, `recuperar-senha`, `nova-senha`, `pedido`, `dashboard`, `admin`). Nenhum link aponta para arquivo ausente.
- **Mobile**: menu hambúrguer no site e nas áreas internas, tabelas com rolagem horizontal, cards em coluna única e alvos de toque de 44px.
- **Checkout**: se o visitante não estiver logado, a intenção de compra é guardada e a compra continua sozinha depois do login. Planos de demonstração (quando o `seed.sql` ainda não rodou) ficam com o botão desativado em vez de gerar erro.
- **Autenticação**: mensagens de erro do Supabase traduzidas; senha mínima de 8 caracteres; confirmação de senha no cadastro; recuperação com redirect configurável.
- **RLS**: revisado para não haver recursão (`is_admin()` é `security definer`) e para o `anon` só enxergar catálogo e configurações marcadas como públicas.
- **Comprovantes**: validação de tipo e tamanho no navegador, e limites reforçados no bucket — o servidor recusa mesmo se alguém burlar o HTML.
- **Acessibilidade**: foco visível, `prefers-reduced-motion` respeitado, contraste alto nas áreas de leitura em branco.

O que depende de você para ficar 100%:

| Falta | Onde configurar |
|---|---|
| Chave PIX (modo manual) | `js/config.js` e painel admin |
| `PIX_PROVIDER_API_KEY` e `PIX_WEBHOOK_TOKEN` | Secrets do Supabase |
| `PTERODACTYL_URL` e `PTERODACTYL_API_KEY` | Secrets do Supabase |
| `EMAIL_API_KEY` e `EMAIL_FROM` | Secrets do Supabase |
| URL do site em Authentication | Painel do Supabase |
| Inserir sua conta em `admins` | `supabase/admin.sql` |

Sugestões para a próxima versão: logs de auditoria das ações do admin, renovação com um clique reaproveitando o pedido anterior, cupons de desconto e integração do suporte com o Discord.

---

© GameCloudHostinger — Sua diversão, nossa infraestrutura.
