-- Evolução diária do índice de saúde (mesma fórmula de v_health, com janelas
-- móveis terminando em cada dia) e indicadores de impacto para a página pública.

create or replace view v_health_daily as
with rint_day as (
  select system_id, local_day(ts) as day, avg(rint_mohm) as rint_mohm
  from telemetry where rint_mohm is not null
  group by system_id, local_day(ts)
),
base as (
  select
    d.system_id, d.day, d.h_below_50, d.h_above_40, d.reached_full, d.ah_out,
    r.rint_mohm,
    r.rint_mohm / s.rint_initial_mohm as rint_ratio,
    p.pr, p.kwh_m2,
    s.ah_throughput_offset, s.bank_nominal_ah
  from v_daily d
  join systems s on s.id = d.system_id
  left join rint_day r  on r.system_id = d.system_id and r.day = d.day
  left join v_pr_daily p on p.system_id = d.system_id and p.day = d.day
),
win as (
  select
    b.*,
    sum(h_below_50) over w30                                          as h_below_50_30d,
    sum(h_above_40) over w30                                          as h_above_40_30d,
    avg(pr) filter (where kwh_m2 >= 4) over w7                        as pr_7d,
    day - max(case when reached_full then day end) over wall          as days_since_full,
    (ah_throughput_offset + sum(ah_out) over wall) / (bank_nominal_ah * 0.5 * 500) as throughput_ratio,
    avg(rint_ratio) over w3                                           as rint_ratio_3d
  from base b
  window
    w30  as (partition by system_id order by day rows between 29 preceding and current row),
    w7   as (partition by system_id order by day rows between 6 preceding and current row),
    w3   as (partition by system_id order by day rows between 2 preceding and current row),
    wall as (partition by system_id order by day rows between unbounded preceding and current row)
)
select
  system_id, day, rint_mohm, rint_ratio_3d, pr, pr_7d,
  greatest(0, least(100, round(
      100
    - least(35, greatest(0, coalesce(rint_ratio_3d, 1) - 1) * 60)
    - least(20, h_below_50_30d / 5)
    - least(15, h_above_40_30d / 2)
    - least(10, greatest(0, coalesce(days_since_full, 31) - 1) * 2)
    - least(15, greatest(0, 0.85 - coalesce(pr_7d, 0.85)) * 100)
    - least(5,  throughput_ratio * 5)
  )))::int as health
from win;

-- Impacto dos últimos 30 dias. Fatores em settings:
--   diesel_l_per_kwh  litros de diesel que um gerador pequeno queimaria por kWh
--   co2_kg_per_l      kg de CO2 por litro de diesel (≈ 2,7)
create or replace view v_impact as
with gen as (
  select sum(e_gen_wh) / 1000 as kwh_30d
  from v_daily where day > local_day(app_now()) - 30
),
f as (
  select
    (select value::numeric from settings where key = 'diesel_l_per_kwh') as l_per_kwh,
    (select value::numeric from settings where key = 'co2_kg_per_l')     as kg_per_l
),
life as (
  -- vida projetada = idade / fração da vida nominal já consumida (limitada a 10 anos)
  select avg(least(10,
           ((local_day(app_now()) - s.installed_on) / 365.0) / greatest(st.throughput_ratio, 0.05)
         )) as battery_life_years,
         avg((local_day(app_now()) - s.installed_on) / 365.0) as battery_age_years
  from systems s join v_stress st on st.system_id = s.id
)
select
  g.kwh_30d,
  g.kwh_30d * f.l_per_kwh                   as diesel_l_30d,
  g.kwh_30d * f.l_per_kwh * f.kg_per_l      as co2_kg_30d,
  l.battery_life_years,
  l.battery_age_years,
  (select count(*) from tickets where status = 'resolvido' and resolved_at > app_now() - interval '30 days') as tickets_resolved_30d,
  (select count(*) from tickets where status = 'resolvido' and verified_improved and resolved_at > app_now() - interval '30 days') as tickets_verified_30d,
  (select count(*) from systems)            as systems,
  (select count(*) from communities)        as communities,
  f.l_per_kwh, f.kg_per_l
from gen g, f, life l;
