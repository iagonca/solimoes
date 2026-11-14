-- Indicadores e regras de alerta, calculados no próprio Postgres.
-- Tudo aqui é view ou função: o site só consulta.

alter table systems add column if not exists ah_throughput_offset numeric not null default 0;
create index if not exists telemetry_ts on telemetry (ts);

-- Relógio da aplicação. Em modo 'demo', "agora" é o último pacote recebido,
-- para os dados gerados não envelhecerem; em modo 'live' é o now() do banco.
create or replace function app_now() returns timestamptz
language sql stable as $$
  select case
    when (select value from settings where key = 'clock') = 'live' then now()
    else coalesce((select max(ts) from telemetry), now())
  end
$$;

create or replace function local_day(t timestamptz) returns date
language sql immutable as $$ select (t at time zone 'America/Manaus')::date $$;

-- Último pacote de cada sistema.
create or replace view v_latest as
select distinct on (system_id) *
from telemetry
order by system_id, ts desc;

-- Agregado diário por sistema (dia no fuso de Manaus).
create or replace view v_daily as
select
  system_id,
  local_day(ts)                                        as day,
  sum(p_panel_avg) * 0.25                              as e_gen_wh,
  sum(p_load_avg)  * 0.25                              as e_load_wh,
  min(soc)                                             as soc_min,
  max(soc)                                             as soc_max,
  count(*) filter (where soc < 50) * 0.25              as h_below_50,
  max(t_bat_max)                                       as t_bat_max,
  count(*) filter (where t_bat_max > 40) * 0.25        as h_above_40,
  bool_or(soc >= 98)                                   as reached_full,
  sum(ah_out)                                          as ah_out,
  count(*)                                             as samples
from telemetry
group by system_id, local_day(ts);

-- Taxa de desempenho do painel: PR = E_gerada / (H_irradiação × P_nominal).
-- H em kWh/m² × Wp dá Wh nas condições padrão (1 kW/m²), então a razão é adimensional.
create or replace view v_pr_daily as
select
  d.system_id,
  d.day,
  h.kwh_m2,
  d.e_gen_wh,
  case when h.kwh_m2 > 0
       then d.e_gen_wh / (h.kwh_m2 * s.panel_count * s.panel_wp)
  end as pr
from v_daily d
join systems s        on s.id = d.system_id
join hub_irradiance h on h.community_id = s.community_id and h.day = d.day
where d.samples >= 80;   -- dia com pelo menos ~20 h de dados

-- Resistência interna recente (média das medidas dos últimos 3 dias).
create or replace view v_rint as
select
  s.id as system_id,
  avg(t.rint_mohm)                          as rint_mohm,
  avg(t.rint_mohm) / s.rint_initial_mohm    as rint_ratio
from systems s
left join telemetry t
  on t.system_id = s.id and t.rint_mohm is not null and t.ts > app_now() - interval '3 days'
group by s.id, s.rint_initial_mohm;

-- Capacidade efetiva: Ah entregues entre uma carga completa e o limite de tensão
-- sob carga (23,6 V no banco de 24 V). Considera-se que esse limite corresponde a
-- ~25% de carga numa bateria sã, então capacidade ≈ Ah entregues / 0,75.
-- Só existe amostra quando houve descarga profunda nos últimos 30 dias.
create or replace view v_capacity as
with starts as (
  select system_id, ts
  from (
    select system_id, ts, soc, lead(soc) over (partition by system_id order by ts) as next_soc
    from telemetry
    where ts > app_now() - interval '30 days'
  ) x
  where soc >= 98 and next_soc < 98
),
segments as (
  select st.system_id, st.ts as start_ts,
         (select min(t.ts) from telemetry t
           where t.system_id = st.system_id and t.ts > st.ts
             and t.ts < st.ts + interval '24 hours' and t.v_bat_min < 23.6) as end_ts
  from starts st
)
select
  sg.system_id,
  max(sg.end_ts) as last_sample_at,
  avg((select sum(t.ah_out) from telemetry t
        where t.system_id = sg.system_id and t.ts > sg.start_ts and t.ts <= sg.end_ts) / 0.75) as capacity_ah
from segments sg
where sg.end_ts is not null
group by sg.system_id;

-- Fatores de estresse acumulados nos últimos 30 dias.
create or replace view v_stress as
select
  s.id as system_id,
  coalesce(sum(d.h_below_50), 0)                                      as h_below_50_30d,
  coalesce(sum(d.h_above_40), 0)                                      as h_above_40_30d,
  local_day(app_now()) - coalesce(max(d.day) filter (where d.reached_full), s.installed_on) as days_since_full,
  (s.ah_throughput_offset + coalesce(sum(d.ah_out), 0))
    / (s.bank_nominal_ah * 0.5 * 500)                                 as throughput_ratio  -- vida nominal: 500 ciclos a 50% DoD
from systems s
left join v_daily d on d.system_id = s.id and d.day > local_day(app_now()) - 30
group by s.id, s.ah_throughput_offset, s.bank_nominal_ah, s.installed_on;

-- PR médio dos últimos 7 dias com sol (≥ 4 kWh/m²), para não punir dia nublado.
create or replace view v_pr_7d as
select system_id, avg(pr) as pr_7d
from v_pr_daily
where day > local_day(app_now()) - 7 and kwh_m2 >= 4
group by system_id;

-- Índice de saúde de 0 a 100. Cada fator tira pontos até um teto:
--   resistência interna acima da inicial  até 35
--   horas abaixo de 50% (30 d)            até 20
--   horas acima de 40 °C (30 d)           até 15
--   dias sem carga completa               até 10
--   PR abaixo de 85%                       até 15
--   energia acumulada vs. vida nominal    até  5
create or replace view v_health as
select
  s.id as system_id,
  r.rint_mohm, r.rint_ratio,
  c.capacity_ah,
  st.h_below_50_30d, st.h_above_40_30d, st.days_since_full, st.throughput_ratio,
  p.pr_7d,
  greatest(0, least(100, round(
      100
    - least(35, greatest(0, coalesce(r.rint_ratio, 1) - 1) * 60)
    - least(20, st.h_below_50_30d / 5)
    - least(15, st.h_above_40_30d / 2)
    - least(10, greatest(0, st.days_since_full - 1) * 2)
    - least(15, greatest(0, 0.85 - coalesce(p.pr_7d, 0.85)) * 100)
    - least(5,  st.throughput_ratio * 5)
  )))::int as health
from systems s
left join v_rint r     on r.system_id = s.id
left join v_capacity c on c.system_id = s.id
left join v_stress st  on st.system_id = s.id
left join v_pr_7d p    on p.system_id = s.id;

-- Gravidade como número, para achar o "pior status".
create or replace function severity_rank(sev text) returns int
language sql immutable as $$
  select case sev when 'vermelho' then 3 when 'amarelo' then 2 when 'cinza' then 1 else 0 end
$$;

-- Status de cada sistema: pior alerta aberto dele ou da comunidade (hub offline).
create or replace view v_system_status as
select
  s.id as system_id,
  s.community_id,
  coalesce(
    (select a.severity from alerts a
      where a.closed_at is null
        and (a.system_id = s.id or (a.system_id is null and a.community_id = s.community_id))
      order by severity_rank(a.severity) desc limit 1),
    'verde') as status
from systems s;

create or replace view v_community_status as
select
  c.id as community_id,
  coalesce(
    (select st.status from v_system_status st
      where st.community_id = c.id
      order by severity_rank(st.status) desc limit 1),
    'verde') as status
from communities c;

-- Avalia todas as regras de alerta, abre alertas novos (com chamado), atualiza
-- o valor dos que continuam e fecha os que normalizaram. Também faz a
-- verificação automática dos chamados resolvidos.
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
  having max(t.soc) < 50 and count(*) >= 44;

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
end
$$;
