-- WLD FILMS — aviso no WhatsApp quando chega um pedido de orçamento
-- Usa o CallMeBot (gratuito, uso pessoal: só envia para o seu próprio número).
-- O número e a chave ficam em Ajustes no painel (tabela settings, só admin lê).
-- Rodar inteiro no SQL Editor. Pode rodar de novo sem problema.

create extension if not exists pg_net with schema extensions;

-- Envia uma mensagem para o WhatsApp configurado em Ajustes.
create or replace function public.send_whatsapp(message text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg jsonb;
  phone text;
  api_key text;
begin
  select data into cfg from public.settings where id = 1;
  phone := regexp_replace(coalesce(cfg->>'notify_phone', ''), '\D', '', 'g');
  api_key := trim(coalesce(cfg->>'notify_apikey', ''));
  if coalesce((cfg->>'notify_enabled')::boolean, false) is false or phone = '' or api_key = '' then
    return null;
  end if;
  if length(phone) in (10, 11) then
    phone := '55' || phone;
  end if;
  return net.http_get(
    url := 'https://api.callmebot.com/whatsapp.php',
    params := jsonb_build_object('phone', '+' || phone, 'apikey', api_key, 'text', message),
    timeout_milliseconds := 10000
  );
end;
$$;

-- Ninguém de fora chama essa função diretamente.
revoke execute on function public.send_whatsapp(text) from public, anon, authenticated;

-- Dispara a cada pedido novo vindo do formulário.
create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.send_whatsapp(
      '🎬 *Novo pedido de orçamento — WLD FILMS*' || E'\n\n' ||
      '*Nome:* ' || new.name ||
      coalesce(E'\n*Empresa:* ' || new.company, '') ||
      E'\n*Serviço:* ' || new.service ||
      coalesce(E'\n*Projeto:* ' || new.project_type, '') ||
      coalesce(E'\n*Data:* ' || to_char(new.event_date, 'DD/MM/YYYY'), '') ||
      coalesce(E'\n*Local:* ' || new.location, '') ||
      coalesce(E'\n*Investimento:* ' || new.budget_range, '') ||
      E'\n*WhatsApp:* ' || new.phone ||
      E'\n\nVer no painel: https://wldfilms.com.br/admin'
    );
  exception when others then
    raise warning 'Aviso de WhatsApp falhou: %', sqlerrm; -- o pedido é salvo mesmo assim
  end;
  return new;
end;
$$;

revoke execute on function public.notify_new_request() from public, anon, authenticated;

drop trigger if exists quote_requests_notify on public.quote_requests;
create trigger quote_requests_notify
  after insert on public.quote_requests
  for each row execute function public.notify_new_request();

-- Botão "Enviar mensagem de teste" do painel (só admin).
create or replace function public.notify_test()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id bigint;
begin
  if not public.is_admin() then
    raise exception 'sem permissão';
  end if;
  request_id := public.send_whatsapp('✅ Teste do painel WLD FILMS: os avisos de novos orçamentos vão chegar aqui.');
  if request_id is null then
    return 'desligado';
  end if;
  return 'enviado';
end;
$$;

revoke execute on function public.notify_test() from public, anon;
grant execute on function public.notify_test() to authenticated;
