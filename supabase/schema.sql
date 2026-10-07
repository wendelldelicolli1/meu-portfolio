-- WLD FILMS — banco do painel administrativo
-- Rodar inteiro no Supabase: SQL Editor → New query → colar → Run.
-- Pode rodar de novo sem problema (não apaga dados).

-- =====================================================================
-- ADMINISTRADORES
-- Só quem estiver nesta tabela consegue editar qualquer coisa.
-- =====================================================================
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists "admins leem a si mesmos" on public.admins;
create policy "admins leem a si mesmos" on public.admins
  for select using (user_id = auth.uid());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- PROJETOS DO PORTFÓLIO
-- =====================================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  category text not null default 'horizontal'
    check (category in ('horizontal', 'vertical', 'foto')),
  year int check (year between 1990 and 2100),
  client text,
  description text,
  video_url text,
  poster_url text,
  photos text[] not null default '{}',
  published boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

drop policy if exists "público vê publicados" on public.projects;
create policy "público vê publicados" on public.projects
  for select using (published or public.is_admin());

drop policy if exists "admin gerencia projetos" on public.projects;
create policy "admin gerencia projetos" on public.projects
  for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- PEDIDOS DE ORÇAMENTO (vindos do formulário do site)
-- =====================================================================
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 120),
  email text check (char_length(email) <= 160),
  phone text not null check (char_length(phone) between 8 and 40),
  company text check (char_length(company) <= 160),
  service text not null check (char_length(service) <= 80),
  project_type text check (char_length(project_type) <= 120),
  event_date date,
  location text check (char_length(location) <= 200),
  duration text check (char_length(duration) <= 80),
  deliverables text[] not null default '{}' check (cardinality(deliverables) <= 20),
  deliverables_detail text check (char_length(deliverables_detail) <= 1000),
  deadline text check (char_length(deadline) <= 120),
  budget_range text check (char_length(budget_range) <= 80),
  references_links text check (char_length(references_links) <= 1500),
  message text check (char_length(message) <= 4000),
  source text check (char_length(source) <= 120),
  status text not null default 'novo'
    check (status in ('novo', 'em_andamento', 'orcado', 'fechado', 'arquivado')),
  admin_notes text
);
alter table public.quote_requests enable row level security;

-- Visitantes só podem ENVIAR pedidos novos (não leem, não alteram).
drop policy if exists "visitante envia pedido" on public.quote_requests;
create policy "visitante envia pedido" on public.quote_requests
  for insert to anon, authenticated
  with check (status = 'novo' and admin_notes is null);

drop policy if exists "admin gerencia pedidos" on public.quote_requests;
create policy "admin gerencia pedidos" on public.quote_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- ORÇAMENTOS (montados no painel, viram PDF)
-- =====================================================================
create sequence if not exists public.quote_number_seq start 1;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.quote_number_seq'),
  request_id uuid references public.quote_requests (id) on delete set null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  issue_date date not null default current_date,
  valid_days int not null default 15,
  client_name text not null,
  client_company text,
  client_doc text,
  client_email text,
  client_phone text,
  title text,
  event_date date,
  location text,
  scope text,
  items jsonb not null default '[]',
  discount numeric(12, 2) not null default 0,
  payment_terms text,
  delivery_terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quotes enable row level security;

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();

drop policy if exists "admin gerencia orçamentos" on public.quotes;
create policy "admin gerencia orçamentos" on public.quotes
  for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- CONFIGURAÇÕES (dados da empresa, tabela de preços, textos padrão)
-- =====================================================================
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

drop policy if exists "admin gerencia configurações" on public.settings;
create policy "admin gerencia configurações" on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.settings (id, data) values (1, jsonb_build_object(
  'business_name', 'WLD FILMS',
  'owner_name', 'Wendell Delicolli',
  'document', '',
  'email', 'wldfilmms@gmail.com',
  'phone', '(48) 99671-7002',
  'instagram', '@wldfilms_',
  'city', '',
  'pix', '',
  'payment_terms', '50% na assinatura/aprovação para reserva da data e 50% na entrega do material. Pagamento via PIX ou transferência.',
  'delivery_terms', 'Prévia em até 10 dias úteis após a captação. Material final em até 20 dias úteis, com 1 rodada de ajustes inclusa.',
  'notes', 'Deslocamentos fora da cidade, hospedagem e alimentação da equipe, quando necessários, são cobrados à parte. Direitos de uso do material para as finalidades combinadas neste orçamento.',
  'catalog', jsonb_build_array(
    jsonb_build_object('name', 'Diária de captação (até 8h)', 'price', 0),
    jsonb_build_object('name', 'Meia diária de captação (até 4h)', 'price', 0),
    jsonb_build_object('name', 'Edição de vídeo horizontal (até 3 min)', 'price', 0),
    jsonb_build_object('name', 'Vídeo vertical para Reels/TikTok', 'price', 0),
    jsonb_build_object('name', 'Ensaio fotográfico com fotos tratadas', 'price', 0),
    jsonb_build_object('name', 'Tratamento de cor (color grading)', 'price', 0),
    jsonb_build_object('name', 'Imagens aéreas (drone)', 'price', 0)
  )
))
on conflict (id) do nothing;

-- =====================================================================
-- ARMAZENAMENTO DE FOTOS E CAPAS
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin envia mídia" on storage.objects;
create policy "admin envia mídia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "admin altera mídia" on storage.objects;
create policy "admin altera mídia" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "admin apaga mídia" on storage.objects;
create policy "admin apaga mídia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- =====================================================================
-- PROJETOS QUE JÁ ESTAVAM NO SITE (só entra se a tabela estiver vazia)
-- =====================================================================
insert into public.projects (title, category, year, description, video_url, poster_url, position)
select * from (values
  ('Pile & Nilda', 'horizontal', 2026, null,
   'https://ik.imagekit.io/bix4diucx/PILE%20E%20NILDA.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/80KhZPOzY3s/hqdefault.jpg', 1),
  ('Filme Conceito', 'horizontal', 2022, 'Captação: Wendell Delicolli · Edição: Bryan Brittos',
   'https://ik.imagekit.io/bix4diucx/FILME%20CONCEITO.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/fKIbC9DGHG8/hqdefault.jpg', 2),
  ('Highlight Palavra Viva Church', 'horizontal', 2022, null,
   'https://ik.imagekit.io/bix4diucx/HIGHLIGHT%20PALAVRA%20VIVA%20CHURCH.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/3Vat3OU_R-0/hqdefault.jpg', 3),
  ('Compilado', 'vertical', 2026, null,
   'https://ik.imagekit.io/bix4diucx/COMPILADO.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/lqrhPloH71Q/hqdefault.jpg', 4),
  ('Rafael & Renata', 'vertical', 2026, null,
   'https://ik.imagekit.io/bix4diucx/RENATA%20E%20RAFAEL.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/iHvRf9Fg6II/hqdefault.jpg', 5),
  ('Highlight Restaurante', 'vertical', 2024, null,
   'https://ik.imagekit.io/bix4diucx/HIGHLIGHT%20RESTAURANTE.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/HYC5GogoBng/hqdefault.jpg', 6),
  ('Highlight 2', 'vertical', 2024, null,
   'https://ik.imagekit.io/bix4diucx/HIGHLIGHT%202%20RESTAURANTE%20.mp4?tr=orig-true',
   'https://i.ytimg.com/vi/I6NNVZsLsoI/hqdefault.jpg', 7)
) as v(title, category, year, description, video_url, poster_url, position)
where not exists (select 1 from public.projects);

-- =====================================================================
-- PERMISSÕES DA API (projetos novos do Supabase não liberam tabelas
-- automaticamente; as regras RLS acima continuam valendo por cima disto)
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select on public.projects to anon;
grant insert on public.quote_requests to anon;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.projects, public.quote_requests,
  public.quotes, public.settings to authenticated;
grant usage, select on sequence public.quote_number_seq to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
