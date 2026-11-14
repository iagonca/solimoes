-- O relógio da demo calculava max(ts) sobre a telemetria inteira. Dentro do
-- filtro das views isso era reavaliado para cada linha e uma consulta passava
-- de 4 minutos. Agora o "agora" da demo fica guardado em settings ('demo_now'),
-- gravado pelo seed; ler uma linha por chave primária é barato.
create or replace function app_now() returns timestamptz
language sql stable as $$
  select case
    when (select value from settings where key = 'clock') = 'live' then now()
    else coalesce((select value::timestamptz from settings where key = 'demo_now'), now())
  end
$$;

insert into settings (key, value)
select 'demo_now', max(ts)::text from telemetry
on conflict (key) do update set value = excluded.value;
