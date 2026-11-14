-- Mensagens enviadas pela página pública de contato. A coordenação lê no painel.
create table if not exists contact_messages (
  id            serial primary key,
  name          text not null,
  email         text not null,
  organization  text,
  audience      text not null check (audience in ('comunidade', 'concessionaria', 'governo', 'outro')),
  message       text not null,
  created_at    timestamptz not null default now(),
  handled       boolean not null default false
);
