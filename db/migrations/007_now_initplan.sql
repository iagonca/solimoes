-- app_now() dentro de filtro era reavaliada para cada linha (~1 s por consulta).
-- Escrita como (select app_now()), vira um InitPlan: calculada uma vez por consulta.
-- O resultado das views não muda.

create or replace view v_rint as
select
  s.id as system_id,
  avg(t.rint_mohm)                          as rint_mohm,
  avg(t.rint_mohm) / s.rint_initial_mohm    as rint_ratio
from systems s
left join telemetry t
  on t.system_id = s.id and t.rint_mohm is not null and t.ts > (select app_now()) - interval '3 days'
group by s.id, s.rint_initial_mohm;

create or replace view v_capacity as
with starts as (
  select system_id, ts
  from (
    select system_id, ts, soc, lead(soc) over (partition by system_id order by ts) as next_soc
    from telemetry
    where ts > (select app_now()) - interval '30 days'
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

create or replace view v_stress as
select
  s.id as system_id,
  coalesce(sum(d.h_below_50), 0)                                      as h_below_50_30d,
  coalesce(sum(d.h_above_40), 0)                                      as h_above_40_30d,
  least(31, local_day((select app_now())) - coalesce(max(d.day) filter (where d.reached_full), local_day((select app_now())) - 31)) as days_since_full,
  (s.ah_throughput_offset + coalesce(sum(d.ah_out), 0))
    / (s.bank_nominal_ah * 0.5 * 500)                                 as throughput_ratio
from systems s
left join v_daily d on d.system_id = s.id and d.day > local_day((select app_now())) - 30
group by s.id, s.ah_throughput_offset, s.bank_nominal_ah, s.installed_on;

create or replace view v_pr_7d as
select system_id, avg(pr) as pr_7d
from v_pr_daily
where day > local_day((select app_now())) - 7 and kwh_m2 >= 4 and pr is not null
group by system_id;

create or replace view v_impact as
with gen as (
  select sum(e_gen_wh) / 1000 as kwh_30d
  from v_daily where day > local_day((select app_now())) - 30
),
f as (
  select
    (select value::numeric from settings where key = 'diesel_l_per_kwh') as l_per_kwh,
    (select value::numeric from settings where key = 'co2_kg_per_l')     as kg_per_l
),
life as (
  -- vida projetada = idade / fração da vida nominal já consumida (limitada a 10 anos)
  select avg(least(10,
           ((local_day((select app_now())) - s.installed_on) / 365.0) / greatest(st.throughput_ratio, 0.05)
         )) as battery_life_years,
         avg((local_day((select app_now())) - s.installed_on) / 365.0) as battery_age_years
  from systems s join v_stress st on st.system_id = s.id
)
select
  g.kwh_30d,
  g.kwh_30d * f.l_per_kwh                   as diesel_l_30d,
  g.kwh_30d * f.l_per_kwh * f.kg_per_l      as co2_kg_30d,
  l.battery_life_years,
  l.battery_age_years,
  (select count(*) from tickets where status = 'resolvido' and resolved_at > (select app_now()) - interval '30 days') as tickets_resolved_30d,
  (select count(*) from tickets where status = 'resolvido' and verified_improved and resolved_at > (select app_now()) - interval '30 days') as tickets_verified_30d,
  (select count(*) from systems)            as systems,
  (select count(*) from communities)        as communities,
  f.l_per_kwh, f.kg_per_l
from gen g, f, life l;
