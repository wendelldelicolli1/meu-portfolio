-- WLD FILMS — usar o projeto Supabase "portfolio" (uplqlliyrqouoltgqndu) como banco do painel
--
-- Por quê: o site apontava para um projeto (groozsvduklsdrjjaoxu) que não existe mais
-- na conta. O projeto "portfolio" tinha só 4 tabelas de um app antigo, com dados de
-- teste de fev/2026 (clients, leads, projects, services). Elas conflitam com a
-- tabela "projects" do painel, então saem antes de instalar o schema.
--
-- Ordem (SQL Editor → New query, uma de cada vez):
--   1. ESTE arquivo inteiro (passo A)
--   2. supabase/schema.sql inteiro
--   3. supabase/avisos.sql inteiro
--   4. passo B abaixo (cadastra o admin)
--   5. assets/config.js → url e anonKey do projeto "portfolio"
--      (só trocar DEPOIS dos passos 1–4, senão o painel fica sem tabelas)

-- ---- Passo A: remove as tabelas de teste do app antigo --------------------
-- ATENÇÃO: apaga os dados dessas 4 tabelas (eram só testes).
drop table if exists public.clients, public.leads, public.projects, public.services cascade;


-- ---- Passo B: rodar DEPOIS de schema.sql e avisos.sql ---------------------
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'wldfilmms@gmail.com'
-- on conflict do nothing;
