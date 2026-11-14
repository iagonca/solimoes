-- Pedidos de ajuda feitos por pessoas (não pelos sensores).
--   morador → agente local e engenharia ao mesmo tempo (target = 'agente_engenharia')
--   agente local → engenharia (target = 'engenharia')
-- Ficam separados dos chamados, que continuam nascendo só de alertas.
create table if not exists help_requests (
  id               serial primary key,
  community_id     int not null references communities(id),
  system_id        int references systems(id),          -- casa do morador, ou a casa que o agente indicou
  requester_email  text not null references profiles(email),
  requester_role   text not null check (requester_role in ('morador', 'agente')),
  target           text not null check (target in ('agente_engenharia', 'engenharia')),
  reason           text not null check (reason in ('sem_luz', 'bateria_apitando', 'aparelho_nao_liga', 'outro', 'duvida_protocolo', 'problema_tecnico')),
  note             text,
  status           text not null default 'aberto' check (status in ('aberto', 'em_atendimento', 'resolvido')),
  handled_by_email text references profiles(email),
  response         text,
  created_at       timestamptz not null,
  updated_at       timestamptz not null,
  resolved_at      timestamptz
);
create index if not exists help_requests_open on help_requests (community_id, status);
