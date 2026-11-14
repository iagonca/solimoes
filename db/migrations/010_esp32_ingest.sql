-- Dados reais do ESP32.
--
-- 1. Cada linha de telemetry passa a ter a própria duração (dt_h, em horas). Os dados
--    simulados continuam com 0,25 h (15 min); o nó real manda pacotes de poucos segundos.
--    Energia e horas acumuladas somam dt_h em vez de contar linhas × 0,25.
-- 2. O pacote inteiro, como chega, fica em telemetry_raw.
-- 3. Cada casa pode ter o identificador do nó (node_id) que manda os dados dela.
-- 4. Comunidades simuladas ficam marcadas (is_demo), para o seed recriar só elas.

alter table telemetry add column if not exists dt_h real not null default 0.25;

-- Sensor que falhou chega como null: as colunas de medida passam a aceitar nulo.
alter table telemetry
  alter column v_bat_avg drop not null, alter column v_bat_min drop not null, alter column v_bat_max drop not null,
  alter column i_bat_avg drop not null, alter column p_panel_avg drop not null, alter column p_load_avg drop not null,
  alter column t_bat_avg drop not null, alter column t_bat_max drop not null, alter column t_box drop not null,
  alter column rh_box drop not null, alter column v_mid_delta drop not null, alter column soc drop not null,
  alter column ah_in drop not null, alter column ah_out drop not null;

alter table systems add column if not exists node_id text unique;
alter table communities add column if not exists is_demo boolean not null default false;
update communities set is_demo = true where slug in ('caiambe', 'santa-luzia', 'boa-esperanca', 'nazare', 'ponta-castanha', 'mamia');

create table if not exists telemetry_raw (
  id           bigserial primary key,
  received_at  timestamptz not null default now(),
  node         text,
  system_id    int references systems(id) on delete set null,
  status       text not null,          -- 'gravado' | 'no_desconhecido' | 'invalido'
  payload      jsonb,
  ip           text
);
create index if not exists telemetry_raw_node on telemetry_raw (node, received_at desc);

-- Trava da reavaliação de alertas disparada pelos pacotes (no máximo uma a cada 30 s).
insert into settings (key, value) values ('last_refresh', '2000-01-01T00:00:00Z') on conflict (key) do nothing;

create or replace view v_daily as
select
  system_id,
  local_day(ts)                                        as day,
  sum(p_panel_avg * dt_h)::float8                      as e_gen_wh,
  sum(p_load_avg * dt_h)::float8                       as e_load_wh,
  min(soc)                                             as soc_min,
  max(soc)                                             as soc_max,
  coalesce(sum(dt_h) filter (where soc < 50), 0)::numeric as h_below_50,
  max(t_bat_max)                                       as t_bat_max,
  coalesce(sum(dt_h) filter (where t_bat_max > 40), 0)::numeric as h_above_40,
  bool_or(soc >= 98)                                   as reached_full,
  sum(ah_out)                                          as ah_out,
  count(*)                                             as samples,
  sum(dt_h)                                            as covered_h
from telemetry
group by system_id, local_day(ts);

create or replace view v_pr_daily as
select
  t.system_id,
  local_day(t.ts)                                                       as day,
  max(h.kwh_m2)                                                         as kwh_m2,   -- irradiação total do dia
  (sum(t.p_panel_avg * t.dt_h) filter (where is_bulk(t.flags)))::float8             as e_gen_bulk_wh,
  (sum(i.w_m2 * t.dt_h) filter (where is_bulk(t.flags)))::float8 / 1000             as h_bulk_kwh_m2,
  case
    when (sum(i.w_m2 * t.dt_h) filter (where is_bulk(t.flags)))::float8 / 1000 >= 1.0   -- pelo menos 1 kWh/m² em bulk
    then ((sum(t.p_panel_avg * t.dt_h) filter (where is_bulk(t.flags)))::float8)
         / ((sum(i.w_m2 * t.dt_h) filter (where is_bulk(t.flags)))::float8 / 1000 * s.panel_count * s.panel_wp)
  end                                                                   as pr
from telemetry t
join systems s on s.id = t.system_id
join hub_irradiance_15m i on i.community_id = s.community_id and i.ts = t.ts
join hub_irradiance h     on h.community_id = s.community_id and h.day = local_day(t.ts)
group by t.system_id, local_day(t.ts), s.panel_count, s.panel_wp
-- Dia sem irradiância suficiente em bulk não tem PR medido e fica de fora:
-- assim a regra "3 últimos dias de sol" só conta dias com medida válida.
having (sum(i.w_m2 * t.dt_h) filter (where is_bulk(t.flags)))::float8 / 1000 >= 1.0;

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
             and t.ts < st.ts + interval '24 hours' and t.v_bat_min < 11.8 * (select s.bank_nominal_v from systems s where s.id = st.system_id) / 12) as end_ts
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
end
$$;
