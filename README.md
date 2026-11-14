# Projeto Solimões · site

Plataforma web do Projeto Solimões (Hack@Poli 2026): monitoramento de sistemas solares isolados em comunidades
ribeirinhas, com fila de chamados entre engenheiros voluntários e agentes locais.

## Stack

- Next.js 16 (App Router, `cacheComponents` desligado), hospedagem pensada para a Vercel
- Neon: Postgres (driver `pg` com pool) e Neon Auth (Managed Better Auth, `@neon/auth`)
- Leaflet + OpenStreetMap para o mapa, Chart.js para os gráficos
- Indicadores e regras de alerta em SQL, nas views de `db/migrations`

## Rodar localmente

```bash
npm install
neon deploy          # provisiona Postgres + Auth e grava .env.local
npm run db:migrate   # aplica db/migrations em ordem
npm run db:seed      # dados de demonstração + contas demo
npm run dev
```

`npm run sql -- "select ..."` roda uma consulta avulsa no banco.

## Perfis e telas

| Perfil | Tela | Conta demo |
| --- | --- | --- |
| Engenheiro voluntário | `/painel` (mapa, sistemas, chamados, protocolos, logística, impacto) | `marina@example.org`, `pedro@example.org` |
| Coordenação | `/painel` + `/painel/cadastros` | `coordenacao@example.org` |
| Agente local | `/agente` (tarefas passo a passo, guias, mensagens) | `raimunda@example.org`, `joao@example.org` |
| Morador | `/casa` (energia da casa, o que dá para usar à noite) | `francisca@example.org`, `lima@example.org` |

A senha das contas demo é gerada pelo seed e fica em `DEMO_PASSWORD`, no `.env.local`. A página `/` (impacto) é pública.

## Onde está cada coisa

- `db/migrations/001_schema.sql`: tabelas
- `db/migrations/002_indicators.sql`: relógio da aplicação, agregados diários, Rint, capacidade, estresse,
  índice de saúde, status e `refresh_alerts()` (regras de alerta, abertura de chamados e verificação automática)
- `003_pr_bulk.sql`: PR calculado só nos intervalos em que o controlador não limita a geração
- `005_history_impact.sql`: evolução diária da saúde e indicadores de impacto
- `006_clock_fast.sql`: relógio da demo guardado em `settings`
- `scripts/seed.ts`: simulação física dos 30 dias e falhas injetadas
- `src/lib/queries.ts`: todas as leituras do site; `src/app/actions.ts`: todas as escritas

## Relógio da demo

Em modo `demo` (padrão do seed), `app_now()` devolve `settings.demo_now`, o instante do último pacote gerado, para
os dados não envelhecerem. Quando os dados reais do ESP32 começarem a chegar, mude `settings.clock` para `live`.
