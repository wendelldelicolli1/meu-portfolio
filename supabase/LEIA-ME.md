# Painel WLD FILMS — configuração do Supabase

Faz uma vez só. Plano gratuito, ~15 minutos.

## 1. Criar o projeto
1. https://supabase.com → entrar → **New project**
   - Name: `wldfilms`
   - Database password: crie uma senha forte e guarde
   - Region: **South America (São Paulo)**
2. Aguarde 1–2 minutos.

## 2. Criar as tabelas
**SQL Editor → New query** → colar todo o conteúdo de `supabase/schema.sql` → **Run**.
Deve aparecer "Success". Os 7 projetos que já estão no site entram automaticamente.

## 3. Criar o seu login
1. **Authentication → Users → Add user → Create new user** — seu e-mail e senha, marcando **Auto Confirm User**.
2. No SQL Editor:
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'SEU-EMAIL@exemplo.com'
on conflict do nothing;
```

## 4. Bloquear novos cadastros
**Authentication → Sign In / Providers** → desligar **Allow new users to sign up** → Save.

## 5. Endereços (para "Esqueci minha senha")
**Authentication → URL Configuration**
- Site URL: `https://wldfilms.com.br`
- Redirect URLs: `https://wldfilms.com.br/admin`

## 6. Conectar o site
**Project Settings → API Keys** — copiar a **Project URL** e a **Publishable key** (ou "anon public")
e colar em `assets/config.js`.

Pronto: painel em **https://wldfilms.com.br/admin**.

## 7. (Opcional) Avisos de novo pedido (WhatsApp e e-mail)
Rodar `supabase/avisos.sql` no SQL Editor. Depois, no painel → **Ajustes → Avisos de novo pedido**:
preencher WhatsApp + chave do CallMeBot e/ou e-mail + chave do Resend (instruções na tela) e usar
os botões de teste.
