-- WLD FILMS — avisos quando chega um pedido de orçamento
--   • WhatsApp via CallMeBot: mensagem curta (só nome e serviço)
--   • E-mail via Resend: detalhes completos (aviso reserva, mais confiável)
-- Números, chaves e e-mail ficam em Ajustes no painel (tabela settings, só admin lê).
-- Rodar inteiro no SQL Editor. Pode rodar de novo sem problema.

create extension if not exists pg_net with schema extensions;

drop function if exists public.notify_test();

create or replace function public.html_escape(value text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(coalesce(value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- WhatsApp (CallMeBot)
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

-- E-mail (Resend)
create or replace function public.send_email(subject text, html text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg jsonb;
  to_address text;
  api_key text;
begin
  select data into cfg from public.settings where id = 1;
  to_address := trim(coalesce(cfg->>'notify_email', ''));
  api_key := trim(coalesce(cfg->>'notify_resend_key', ''));
  if coalesce((cfg->>'notify_email_enabled')::boolean, false) is false or to_address = '' or api_key = '' then
    return null;
  end if;
  return net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'WLD FILMS <onboarding@resend.dev>',
      'to', jsonb_build_array(to_address),
      'subject', subject,
      'html', html
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.send_whatsapp(text) from public, anon, authenticated;
revoke execute on function public.send_email(text, text) from public, anon, authenticated;

-- Dispara a cada pedido novo vindo do formulário.
create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_rows text := '';
  v_label text;
  v_value text;
begin
  -- WhatsApp: só o essencial (os dados do cliente ficam no painel).
  begin
    perform public.send_whatsapp(
      '🎬 *Novo pedido de orçamento*' || E'\n' ||
      split_part(new.name, ' ', 1) || ' — ' || new.service ||
      E'\n\nVer no painel: https://wldfilms.com.br/admin'
    );
  exception when others then
    raise warning 'Aviso de WhatsApp falhou: %', sqlerrm;
  end;

  -- E-mail: detalhes completos.
  begin
    for v_label, v_value in
      select t.label, t.value from (values
        ('Nome', new.name),
        ('WhatsApp', new.phone),
        ('E-mail', new.email),
        ('Empresa / Instagram', new.company),
        ('Serviço', new.service),
        ('Do que se trata', new.project_type),
        ('Data prevista', to_char(new.event_date, 'DD/MM/YYYY')),
        ('Local', new.location),
        ('Cobertura', new.duration),
        ('Entregas', nullif(array_to_string(new.deliverables, ', '), '')),
        ('Quantidades', new.deliverables_detail),
        ('Prazo', new.deadline),
        ('Investimento', new.budget_range),
        ('Como conheceu', new.source),
        ('Sobre a ideia', new.message),
        ('Referências', new.references_links)
      ) as t(label, value)
      where t.value is not null and t.value <> ''
    loop
      email_rows := email_rows || '<tr><td style="padding:8px 14px 8px 0;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:.08em;vertical-align:top;white-space:nowrap">'
        || v_label || '</td><td style="padding:8px 0;font-size:15px;white-space:pre-wrap">' || public.html_escape(v_value) || '</td></tr>';
    end loop;

    perform public.send_email(
      'Novo pedido de orçamento: ' || new.name || ' — ' || new.service,
      '<div style="font-family:Arial,sans-serif;color:#11110f;max-width:620px">'
      || '<div style="background:#11110f;color:#fff;padding:22px 26px"><b style="font-size:20px;letter-spacing:-1px">WLD</b> FILMS'
      || '<div style="font-size:26px;font-weight:800;margin-top:14px">Novo pedido de <span style="color:#d7ff3f;font-family:Georgia,serif;font-weight:400;font-style:italic">orçamento.</span></div></div>'
      || '<table style="border-collapse:collapse;margin:20px 26px">' || email_rows || '</table>'
      || '<div style="padding:0 26px 26px"><a href="https://wldfilms.com.br/admin" style="display:inline-block;background:#d7ff3f;color:#11110f;padding:14px 22px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.1em">ABRIR O PAINEL →</a></div>'
      || '</div>'
    );
  exception when others then
    raise warning 'Aviso por e-mail falhou: %', sqlerrm;
  end;

  return new; -- o pedido é salvo mesmo se os avisos falharem
end;
$$;

revoke execute on function public.notify_new_request() from public, anon, authenticated;

drop trigger if exists quote_requests_notify on public.quote_requests;
create trigger quote_requests_notify
  after insert on public.quote_requests
  for each row execute function public.notify_new_request();

-- Botões de teste do painel (só admin). canal: 'whatsapp' ou 'email'.
create or replace function public.notify_test(channel text)
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
  if channel = 'email' then
    request_id := public.send_email(
      'Teste do painel WLD FILMS',
      '<p style="font-family:Arial,sans-serif;font-size:15px">✅ Os avisos de novos pedidos de orçamento vão chegar neste e-mail.</p>'
    );
  else
    request_id := public.send_whatsapp('✅ Teste do painel WLD FILMS: os avisos de novos orçamentos vão chegar aqui.');
  end if;
  return case when request_id is null then 'desligado' else 'enviado' end;
end;
$$;

revoke execute on function public.notify_test(text) from public, anon;
grant execute on function public.notify_test(text) to authenticated;
