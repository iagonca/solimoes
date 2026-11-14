-- Esquema base do Projeto Solimões.
-- Convenções: tempos em timestamptz (UTC), energia em Wh, potência em W,
-- corrente em A (positiva = entrando na bateria), tensão do banco em V.

create table if not exists settings (
  key   text primary key,
  value text not null
);

create table if not exists communities (
  id             serial primary key,
  slug           text not null unique,
  name           text not null,
  municipality   text not null,
  lat            double precision not null,
  lon            double precision not null,
  agent_name     text,
  agent_phone    text,
  hub_last_seen  timestamptz,
  boat_next_trip date
);

-- Um sistema = a instalação solar de uma casa (o nó ESP32 fica nela).
create table if not exists systems (
  id                  serial primary key,
  community_id        int not null references communities(id),
  house_number        int not null,
  family_name         text not null,
  lat                 double precision not null,
  lon                 double precision not null,
  battery_model       text not null,
  battery_count       int not null,
  bank_nominal_v      numeric not null,      -- 24 V = 2 x 12 V em série
  bank_nominal_ah     numeric not null,
  battery_chemistry   text not null default 'chumbo-ácido',
  panel_count         int not null,
  panel_wp            numeric not null,
  installed_on        date not null,
  rint_initial_mohm   numeric not null,      -- medida na instalação
  last_seen           timestamptz,
  unique (community_id, house_number)
);

-- Aparelhos da casa, usados na tela do morador ("o que dá para usar").
create table if not exists appliances (
  id          serial primary key,
  system_id   int not null references systems(id),
  kind        text not null check (kind in ('luz', 'celular', 'freezer', 'tv', 'radio', 'ventilador')),
  label       text not null,
  watts       numeric not null,
  essential   boolean not null default false
);

-- Pacote resumido que o nó manda a cada 15 min (média/mín/máx de cada grandeza).
create table if not exists telemetry (
  system_id    int not null references systems(id),
  ts           timestamptz not null,
  v_bat_avg    real not null,
  v_bat_min    real not null,
  v_bat_max    real not null,
  i_bat_avg    real not null,
  p_panel_avg  real not null,
  p_load_avg   real not null,
  t_bat_avg    real not null,
  t_bat_max    real not null,
  t_box        real not null,
  rh_box       real not null,
  v_mid_delta  real not null,             -- |V(bat1) - V(bat2)|
  soc          real not null,             -- %, contagem de coulombs no nó
  ah_in        real not null,
  ah_out       real not null,
  rint_mohm    real,                      -- ΔV/ΔI medido num degrau de carga, quando houve
  flags        int not null default 0,    -- bit 0: corte de carga ativo
  primary key (system_id, ts)
);

-- Célula de referência do hub: irradiação diária por comunidade.
create table if not exists hub_irradiance (
  community_id  int not null references communities(id),
  day           date not null,
  kwh_m2        real not null,
  primary key (community_id, day)
);

-- Previsão de irradiação para a tela do morador (na demo vem do seed;
-- em produção poderia vir da NASA POWER ou de um serviço meteorológico).
create table if not exists hub_forecast (
  community_id  int not null references communities(id),
  day           date not null,
  kwh_m2        real not null,
  primary key (community_id, day)
);

create table if not exists events (
  id         bigserial primary key,
  system_id  int not null references systems(id),
  ts         timestamptz not null,
  kind       text not null check (kind in ('corte_carga', 'religamento', 'carga_completa', 'reinicio_no', 'intervencao')),
  detail     text
);
create index if not exists events_system_ts on events (system_id, ts desc);

create table if not exists protocols (
  id        serial primary key,
  code      text not null unique,
  title     text not null,
  summary   text not null,
  minutes   int not null,
  audience  text not null default 'agente',
  steps     jsonb not null  -- [{ "text": "...", "icon": "chave" }]
);

-- Um alerta por (regra, sistema) enquanto a condição durar.
-- system_id nulo = alerta da comunidade inteira (ex.: hub offline).
create table if not exists alerts (
  id            serial primary key,
  community_id  int not null references communities(id),
  system_id     int references systems(id),
  rule          text not null,
  severity      text not null check (severity in ('cinza', 'amarelo', 'vermelho')),
  title         text not null,
  action        text not null,
  value         real,
  opened_at     timestamptz not null,
  closed_at     timestamptz
);
create unique index if not exists alerts_one_open
  on alerts (rule, community_id, coalesce(system_id, 0)) where closed_at is null;

create table if not exists tickets (
  id                 serial primary key,
  alert_id           int not null unique references alerts(id),
  status             text not null default 'aberto'
                     check (status in ('aberto', 'em_analise', 'aguardando_acao_local', 'resolvido')),
  assignee_email     text,
  diagnosis          text,
  protocol_id        int references protocols(id),
  current_step       int not null default 0,
  created_at         timestamptz not null,
  updated_at         timestamptz not null,
  local_done_at      timestamptz,
  resolved_at        timestamptz,
  verified_improved  boolean          -- preenchido pela verificação automática
);

create table if not exists ticket_events (
  id         bigserial primary key,
  ticket_id  int not null references tickets(id),
  ts         timestamptz not null,
  actor      text not null,
  kind       text not null,
  note       text
);
create index if not exists ticket_events_ticket on ticket_events (ticket_id, ts);

-- Mensagens para o agente local. Ficam "na fila" até o hub ter conexão.
create table if not exists outbox (
  id            bigserial primary key,
  community_id  int not null references communities(id),
  ticket_id     int references tickets(id),
  channel       text not null check (channel in ('whatsapp', 'sms')),
  body          text not null,
  queued_at     timestamptz not null,
  sent_at       timestamptz
);

create table if not exists logistics_items (
  id            serial primary key,
  community_id  int not null references communities(id),
  ticket_id     int references tickets(id),
  item          text not null,
  qty           int not null,
  status        text not null default 'pendente' check (status in ('pendente', 'embarcado', 'entregue'))
);

-- Perfil de cada conta do Neon Auth, ligado pelo e-mail.
create table if not exists profiles (
  email         text primary key,
  display_name  text not null,
  role          text not null check (role in ('engenheiro', 'coordenador', 'agente', 'morador')),
  community_id  int references communities(id),
  system_id     int references systems(id),
  active        boolean not null default true
);
