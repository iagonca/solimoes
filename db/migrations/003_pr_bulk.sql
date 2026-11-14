-- PR só nos intervalos em que o controlador NÃO limita a geração.
--
-- Num sistema isolado, quando a bateria enche o controlador entra em flutuação
-- e o painel passa a entregar só o que as cargas consomem. Contar esses
-- intervalos no PR faz um painel limpo parecer sujo. Por isso:
--   - o hub manda a irradiância média de cada 15 min (célula de referência);
--   - o nó marca no pacote (flags, bit 1) os intervalos em bulk, isto é, com a
--     tensão abaixo da de absorção, quando o painel entrega tudo o que pode;
--   - PR = Σ geração nos intervalos bulk / Σ (irradiância × P_nominal) neles.

create table if not exists hub_irradiance_15m (
  community_id  int not null references communities(id),
  ts            timestamptz not null,
  w_m2          real not null,
  primary key (community_id, ts)
);

-- Bit 1 do campo flags: intervalo em bulk.
create or replace function is_bulk(flags int) returns boolean
language sql immutable as $$ select (flags & 2) = 2 $$;

-- As views dependentes são recriadas porque v_pr_daily muda de colunas.
drop view if exists v_health, v_pr_7d, v_pr_daily;

create view v_pr_daily as
select
  t.system_id,
  local_day(t.ts)                                                       as day,
  max(h.kwh_m2)                                                         as kwh_m2,   -- irradiação total do dia
  sum(t.p_panel_avg) filter (where is_bulk(t.flags)) * 0.25             as e_gen_bulk_wh,
  sum(i.w_m2) filter (where is_bulk(t.flags)) * 0.25 / 1000             as h_bulk_kwh_m2,
  case
    when sum(i.w_m2) filter (where is_bulk(t.flags)) * 0.25 / 1000 >= 1.0   -- pelo menos 1 kWh/m² em bulk
    then (sum(t.p_panel_avg) filter (where is_bulk(t.flags)) * 0.25)
         / (sum(i.w_m2) filter (where is_bulk(t.flags)) * 0.25 / 1000 * s.panel_count * s.panel_wp)
  end                                                                   as pr
from telemetry t
join systems s on s.id = t.system_id
join hub_irradiance_15m i on i.community_id = s.community_id and i.ts = t.ts
join hub_irradiance h     on h.community_id = s.community_id and h.day = local_day(t.ts)
group by t.system_id, local_day(t.ts), s.panel_count, s.panel_wp
-- Dia sem irradiância suficiente em bulk não tem PR medido e fica de fora:
-- assim a regra "3 últimos dias de sol" só conta dias com medida válida.
having sum(i.w_m2) filter (where is_bulk(t.flags)) * 0.25 / 1000 >= 1.0;

-- A média de 7 dias e a regra de alerta passam a ignorar dias sem PR válido.
create view v_pr_7d as
select system_id, avg(pr) as pr_7d
from v_pr_daily
where day > local_day(app_now()) - 7 and kwh_m2 >= 4 and pr is not null
group by system_id;

-- Índice de saúde de 0 a 100. Cada fator tira pontos até um teto:
--   resistência interna acima da inicial  até 35
--   horas abaixo de 50% (30 d)            até 20
--   horas acima de 40 °C (30 d)           até 15
--   dias sem carga completa               até 10
--   PR abaixo de 85%                       até 15
--   energia acumulada vs. vida nominal    até  5
create view v_health as
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

