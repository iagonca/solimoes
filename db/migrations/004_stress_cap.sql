-- "Dias sem carga completa" fica limitado à janela de 30 dias de dados:
-- se não houve carga completa no período, o valor é 31 (lido como "mais de 30").
create or replace view v_stress as
select
  s.id as system_id,
  coalesce(sum(d.h_below_50), 0)                                      as h_below_50_30d,
  coalesce(sum(d.h_above_40), 0)                                      as h_above_40_30d,
  least(31, local_day(app_now()) - coalesce(max(d.day) filter (where d.reached_full), local_day(app_now()) - 31)) as days_since_full,
  (s.ah_throughput_offset + coalesce(sum(d.ah_out), 0))
    / (s.bank_nominal_ah * 0.5 * 500)                                 as throughput_ratio
from systems s
left join v_daily d on d.system_id = s.id and d.day > local_day(app_now()) - 30
group by s.id, s.ah_throughput_offset, s.bank_nominal_ah, s.installed_on;
