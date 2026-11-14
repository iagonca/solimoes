-- Indicadores pré-calculados.
--
-- A visão geral recalculava, a cada abertura, o índice de saúde das casas, o PR de
-- 7 dias e o impacto de 30 dias a partir da telemetria inteira (~800 ms no banco).
-- Agora esses resultados ficam guardados em materialized views e são recalculados
-- junto com a reavaliação dos alertas: a cada pacote do ESP32 (no máximo uma vez a
-- cada 30 s), no seed e, sem pacotes, quando alguém abre o painel e a última
-- atualização tem mais de 5 minutos.

-- Materialized views rodam com search_path restrito (PostgreSQL 17): as funções usadas
-- que leem tabelas (app_now lê settings) precisam declarar o esquema delas.
alter function app_now() set search_path = public;

create materialized view if not exists mv_health as select * from v_health;
create unique index if not exists mv_health_pk on mv_health (system_id);

create materialized view if not exists mv_pr_7d as select * from v_pr_7d;
create unique index if not exists mv_pr_7d_pk on mv_pr_7d (system_id);

create materialized view if not exists mv_impact as select 1 as id, * from v_impact;
create unique index if not exists mv_impact_pk on mv_impact (id);

create or replace function refresh_indicators() returns void
language plpgsql as $$
begin
  -- concurrently: quem estiver lendo continua vendo a versão anterior durante o recálculo.
  refresh materialized view concurrently mv_health;
  refresh materialized view concurrently mv_pr_7d;
  refresh materialized view concurrently mv_impact;
  update settings set value = now()::text where key = 'last_indicators';
end
$$;

insert into settings (key, value) values ('last_indicators', now()::text) on conflict (key) do nothing;

create or replace function refresh_alerts() returns void
language plpgsql as $$
declare
  t_now timestamptz := app_now();
  rec record;
  new_alert_id int;
  new_ticket_id int;
begin
  create temp table cond (
    rule text, community_id int, system_id int, severity text,
    title text, action text, value real
  ) on commit drop;

  -- Comunidade inteira muda: problema no hub, não nas casas.
  insert into cond
  select 'hub_offline', c.id, null, 'cinza',
         'Hub sem comunicar há mais de 2 h', 'Verificar alimentação e antena do hub',
         extract(epoch from t_now - max(s.last_seen)) / 3600
  from communities c join systems s on s.community_id = c.id
  group by c.id
  having max(s.last_seen) < t_now - interval '2 hours';

  -- Nó isolado sem comunicar (o resto da comunidade fala).
  insert into cond
  select 'no_offline', s.community_id, s.id, 'cinza',
         'Nó sem comunicar há mais de 2 h', 'Verificar alimentação e antena',
         extract(epoch from t_now - s.last_seen) / 3600
  from systems s
  where s.last_seen < t_now - interval '2 hours'
    and s.community_id not in (select community_id from cond where rule = 'hub_offline');

  -- As demais regras só valem para quem está comunicando.
  create temp table online on commit drop as
  select s.* from systems s where s.last_seen >= t_now - interval '2 hours';

  insert into cond
  select 'soc_baixo', o.community_id, o.id, 'amarelo',
         'Bateria abaixo de 50% há mais de 12 h', 'Orientar redução de consumo', max(t.soc)
  from online o join telemetry t on t.system_id = o.id and t.ts > t_now - interval '12 hours'
  group by o.id, o.community_id
  having max(t.soc) < 50 and sum(t.dt_h) >= 11;   -- pelo menos 11 h de dados nas últimas 12 h

  insert into cond
  select 'corte_carga', o.community_id, o.id, 'vermelho',
         'Tensão crítica sob carga (corte acionado)', 'Investigar causa da descarga', l.v_bat_min
  from online o join v_latest l on l.system_id = o.id
  where (l.flags & 1) = 1;

  insert into cond
  select 'temp_alta', o.community_id, o.id, 'vermelho',
         'Temperatura da bateria acima de 45 °C', 'Melhorar ventilação ou sombreamento da caixa', max(t.t_bat_max)
  from online o join telemetry t on t.system_id = o.id and t.ts > t_now - interval '2 hours'
  group by o.id, o.community_id
  having max(t.t_bat_max) > 45;

  -- PR < 70% nos três últimos dias de sol da última semana.
  insert into cond
  select 'pr_baixo', o.community_id, o.id, 'amarelo',
         'Desempenho do painel abaixo de 70% por 3 dias de sol', 'Limpar painel, verificar sombra e conexões', avg(x.pr)
  from online o
  join lateral (
    select p.pr from v_pr_daily p
    where p.system_id = o.id and p.kwh_m2 >= 4 and p.day > local_day(t_now) - 7
    order by p.day desc limit 3
  ) x on true
  group by o.id, o.community_id
  having count(*) = 3 and max(x.pr) < 0.70;

  insert into cond
  select 'rint_alta', o.community_id, o.id, 'amarelo',
         'Resistência interna 50% acima da inicial', 'Planejar substituição na próxima viagem', r.rint_ratio
  from online o join v_rint r on r.system_id = o.id
  where r.rint_ratio > 1.5;

  insert into cond
  select 'desequilibrio', o.community_id, o.id, 'amarelo',
         'Desequilíbrio no ponto médio acima de 0,3 V', 'Testar baterias individualmente', l.v_mid_delta
  from online o join v_latest l on l.system_id = o.id
  where l.v_mid_delta > 0.3;

  insert into cond
  select 'umidade', o.community_id, o.id, 'amarelo',
         'Umidade interna da caixa acima de 85%', 'Trocar sílica, verificar vedação', l.rh_box
  from online o join v_latest l on l.system_id = o.id
  where l.rh_box > 85;

  -- Fecha o que normalizou.
  for rec in
    select a.id, t.id as ticket_id from alerts a
    left join tickets t on t.alert_id = a.id
    where a.closed_at is null
      and not exists (select 1 from cond c
                      where c.rule = a.rule and c.community_id = a.community_id
                        and coalesce(c.system_id, 0) = coalesce(a.system_id, 0))
  loop
    update alerts set closed_at = t_now where id = rec.id;
    if rec.ticket_id is not null then
      insert into ticket_events (ticket_id, ts, actor, kind, note)
      values (rec.ticket_id, t_now, 'sistema', 'alerta_normalizado', 'Os dados voltaram ao normal.');
    end if;
  end loop;

  -- Atualiza o valor dos que continuam abertos.
  update alerts a set value = c.value
  from cond c
  where a.closed_at is null and c.rule = a.rule and c.community_id = a.community_id
    and coalesce(c.system_id, 0) = coalesce(a.system_id, 0);

  -- Abre os novos, cada um com seu chamado.
  for rec in
    select c.* from cond c
    where not exists (select 1 from alerts a
                      where a.closed_at is null and a.rule = c.rule and a.community_id = c.community_id
                        and coalesce(a.system_id, 0) = coalesce(c.system_id, 0))
  loop
    insert into alerts (community_id, system_id, rule, severity, title, action, value, opened_at)
    values (rec.community_id, rec.system_id, rec.rule, rec.severity, rec.title, rec.action, rec.value, t_now)
    returning id into new_alert_id;

    insert into tickets (alert_id, status, created_at, updated_at)
    values (new_alert_id, 'aberto', t_now, t_now)
    returning id into new_ticket_id;

    insert into ticket_events (ticket_id, ts, actor, kind, note)
    values (new_ticket_id, t_now, 'sistema', 'aberto', rec.title);
  end loop;

  -- Verificação automática: 6 h depois de resolvido, os dados melhoraram?
  update tickets t
  set verified_improved = (a.closed_at is not null)
  from alerts a
  where a.id = t.alert_id and t.status = 'resolvido'
    and t.verified_improved is null and t.resolved_at <= t_now - interval '6 hours';

  -- Recalcula os indicadores guardados (saúde, PR de 7 dias e impacto).
  perform refresh_indicators();
end
$$;
