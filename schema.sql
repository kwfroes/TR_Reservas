-- =====================================================================
-- TR SERVIÇOS DE RESERVAS — Schema inicial (Supabase / PostgreSQL)
-- Etapa 1: Infraestrutura e Modelagem
-- =====================================================================
-- Convenção: todo valor monetário em numeric(12,2); toda FK com
-- on delete restrict (apagar um registro referenciado é bloqueado;
-- use status/flags de inativação em vez de apagar).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 0. PERFIS DE USUÁRIO (Gestor / Administrador / Operador)
-- ---------------------------------------------------------------------
-- Cada usuário autenticado (auth.users) tem uma linha aqui com seu perfil.
-- "Gestor" é quem administra o sistema (não é funcionário da TR).
create type perfil_usuario as enum ('gestor', 'administrador', 'operador');

create table public.usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null unique,
  perfil      perfil_usuario not null default 'operador',
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Função auxiliar para checar o perfil do usuário autenticado dentro das
-- políticas de RLS, sem repetir o subselect em cada policy.
create or replace function public.meu_perfil()
returns perfil_usuario
language sql stable security definer
set search_path = public
as $$
  select perfil from public.usuarios where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 1. PROPRIETÁRIOS E CONTAS BANCÁRIAS
-- ---------------------------------------------------------------------
create table public.proprietarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cpf_cnpj    text,
  telefone    text,
  email       text,
  criado_em   timestamptz not null default now()
);

create table public.contas_bancarias (
  id              uuid primary key default gen_random_uuid(),
  proprietario_id uuid not null references public.proprietarios(id) on delete restrict,
  favorecido      text not null,            -- pode ser diferente do nome do proprietário
  tipo            text not null,            -- 'PIX' | 'BB' | 'Itaú' | ...
  dados_bancarios text not null,            -- chave PIX, agência/conta, e-mail PIX etc.
  padrao          boolean not null default false,
  criado_em       timestamptz not null default now()
);

-- Garante no máximo uma conta padrão por proprietário
create unique index contas_bancarias_uma_padrao_por_proprietario
  on public.contas_bancarias (proprietario_id)
  where padrao;

-- ---------------------------------------------------------------------
-- 2. IMÓVEIS E INVENTÁRIO
-- ---------------------------------------------------------------------
create table public.imoveis (
  id              uuid primary key default gen_random_uuid(),
  codigo_interno  text not null unique,
  proprietario_id uuid not null references public.proprietarios(id) on delete restrict,
  nome_referencia text not null,            -- ex.: "Barra I", "Cobertura"
  nome_predio     text,
  apto            text,
  andar           text,
  vaga            text,
  endereco        text,
  inventario      jsonb not null default '{}'::jsonb,   -- checklist: {item: {tem, qtd, marca, modelo}}
  dados_acesso    jsonb not null default '{}'::jsonb,   -- wifi, instruções, senha de cofre (sensível)
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- Coproprietários (um imóvel pode ter mais de um proprietário associado)
create table public.imovel_coproprietarios (
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  proprietario_id uuid not null references public.proprietarios(id) on delete restrict,
  primary key (imovel_id, proprietario_id)
);

-- ---------------------------------------------------------------------
-- 3. CANAIS DE VENDA E HÓSPEDES
-- ---------------------------------------------------------------------
create table public.canais_venda (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique                -- 'Airbnb' | 'Booking' | 'TR' | 'Direto' ...
);

create table public.hospedes (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  contato   text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. MÓDULO DE PARÂMETROS (regras configuráveis — só o Gestor edita)
-- ---------------------------------------------------------------------
create type tipo_parametro as enum (
  'comissao', 'limpeza', 'nf', 'competencia', 'distribuicao_lucro'
);

create table public.parametros_gerais (
  id                uuid primary key default gen_random_uuid(),
  tipo              tipo_parametro not null,
  valor             numeric(12,2),           -- quando for valor fixo
  percentual        numeric(5,4),            -- quando for percentual (ex.: 0.20 = 20%)
  base_calculo      text,                    -- ex.: 'bruto_menos_limpeza'
  vigencia_inicio   date not null default current_date,
  vigencia_fim      date,                    -- null = em vigor
  criado_por        uuid references public.usuarios(id),
  criado_em         timestamptz not null default now()
);

create table public.imovel_parametros (
  id                uuid primary key default gen_random_uuid(),
  imovel_id         uuid not null references public.imoveis(id) on delete cascade,
  tipo              tipo_parametro not null,
  valor             numeric(12,2),
  percentual        numeric(5,4),
  base_calculo      text,
  vigencia_inicio   date not null default current_date,
  vigencia_fim      date,
  criado_por        uuid references public.usuarios(id),
  criado_em         timestamptz not null default now()
);

create table public.participantes_lucro (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  percentual       numeric(5,4),
  valor_fixo       numeric(12,2),
  valor_minimo     numeric(12,2),
  deduz_do_lucro   boolean not null default false,
  vigencia_inicio  date not null default current_date,
  vigencia_fim     date,
  criado_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. RESERVAS (core)
-- ---------------------------------------------------------------------
create table public.reservas (
  id                      uuid primary key default gen_random_uuid(),
  imovel_id               uuid not null references public.imoveis(id) on delete restrict,
  canal_id                uuid references public.canais_venda(id) on delete restrict,
  hospede                 text not null,         -- texto livre (nome); hospede_id opcional abaixo
  hospede_id              uuid references public.hospedes(id) on delete set null,
  data_entrada            date not null,
  data_saida              date not null,
  valor_bruto             numeric(12,2) not null,
  valor_limpeza           numeric(12,2) not null default 0,
  valor_comissao          numeric(12,2) not null default 0,
  valor_proprietario      numeric(12,2) not null default 0,
  regra_comissao_aplicada jsonb,                 -- snapshot: {nivel, tipo, percentual|valor, base_calculo}
  numero_nf               text,
  conta_bancaria_id       uuid references public.contas_bancarias(id) on delete restrict,
  ajuste_manual           boolean not null default false,
  justificativa_ajuste    text,                  -- obrigatório quando ajuste_manual = true
  observacao              text,
  criado_por              uuid references public.usuarios(id),
  criado_em               timestamptz not null default now(),
  constraint datas_validas check (data_saida > data_entrada),
  constraint justificativa_quando_ajustado check (
    ajuste_manual = false or justificativa_ajuste is not null
  )
);

-- Divisão de competência por mês (reservas que atravessam virada de mês)
create table public.reserva_competencias (
  id                      uuid primary key default gen_random_uuid(),
  reserva_id              uuid not null references public.reservas(id) on delete cascade,
  mes_referencia          date not null,          -- sempre dia 1 do mês, ex. 2026-01-01
  noites                  integer not null,
  valor_bruto_mes         numeric(12,2) not null,
  valor_comissao_mes      numeric(12,2) not null,
  valor_proprietario_mes  numeric(12,2) not null
);

-- Reservas diretas (fora de plataforma)
create table public.reservas_diretas (
  id              uuid primary key default gen_random_uuid(),
  imovel_id       uuid not null references public.imoveis(id) on delete restrict,
  hospede         text not null,
  periodo_inicio  date,
  periodo_fim     date,
  valor_contrato  numeric(12,2) not null,
  valor_adiantado numeric(12,2) not null default 0,
  status          text not null default 'pendente',   -- 'pendente' | 'ok' | 'cancelado'
  criado_em       timestamptz not null default now()
);

-- Impede overbooking: nenhuma reserva pode se sobrepor a outra no mesmo
-- imóvel (check-out de uma pode coincidir com check-in da próxima).
create extension if not exists btree_gist;
alter table public.reservas
  add constraint sem_overbooking
  exclude using gist (
    imovel_id with =,
    daterange(data_entrada, data_saida, '[)') with &&
  );

-- ---------------------------------------------------------------------
-- 6. MANUTENÇÃO E DESPESAS
-- ---------------------------------------------------------------------
create table public.manutencoes (
  id                   uuid primary key default gen_random_uuid(),
  imovel_id            uuid not null references public.imoveis(id) on delete restrict,
  data                 date not null,
  servico              text not null,
  valor                numeric(12,2),
  status               text not null default 'pendente',   -- 'pendente' | 'ok'
  cobrado_proprietario boolean not null default false,
  repasse_id           uuid,            -- preenchido quando descontado de um repasse (ver §8)
  criado_em            timestamptz not null default now()
);

create table public.despesas_tr (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  item            text not null,
  forma_pagamento text,
  valor           numeric(12,2) not null,
  num_parcelas    integer not null default 1,
  criado_em       timestamptz not null default now()
);

create table public.despesa_parcelas (
  id             uuid primary key default gen_random_uuid(),
  despesa_id     uuid not null references public.despesas_tr(id) on delete cascade,
  mes_referencia date not null,
  valor_parcela  numeric(12,2) not null
);

create table public.pagamentos_pessoal (
  id                uuid primary key default gen_random_uuid(),
  funcionario       text not null,
  data              date not null,
  valor             numeric(12,2) not null,
  imoveis_atendidos text,
  num_recibo        text,
  criado_em         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. REPASSES, NOTAS FISCAIS E FECHAMENTO MENSAL
-- ---------------------------------------------------------------------
create table public.repasses (
  id              uuid primary key default gen_random_uuid(),
  imovel_id       uuid not null references public.imoveis(id) on delete restrict,
  mes_referencia  date not null,
  valor_bruto     numeric(12,2) not null,
  deducoes        numeric(12,2) not null default 0,
  valor_liquido   numeric(12,2) not null,
  status          text not null default 'pendente',  -- 'pendente' | 'pago'
  pago_em         timestamptz,
  criado_em       timestamptz not null default now(),
  unique (imovel_id, mes_referencia)
);

alter table public.manutencoes
  add constraint manutencoes_repasse_fk
  foreign key (repasse_id) references public.repasses(id) on delete set null;

create table public.notas_fiscais (
  id              uuid primary key default gen_random_uuid(),
  proprietario_id uuid references public.proprietarios(id) on delete restrict,
  reserva_id      uuid references public.reservas(id) on delete restrict,
  valor_base      numeric(12,2) not null,
  aliquota        numeric(5,4) not null,
  valor_nf        numeric(12,2) not null,
  periodicidade   text not null,            -- 'por_reserva' | 'mensal'
  numero_nf       text,
  criado_em       timestamptz not null default now(),
  constraint nf_tem_um_vinculo check (
    (proprietario_id is not null)::int + (reserva_id is not null)::int = 1
  )
);

create table public.fechamentos_mensais (
  id                  uuid primary key default gen_random_uuid(),
  mes_referencia      date not null unique,
  entrada_tr          numeric(12,2) not null,
  despesas            numeric(12,2) not null,
  distribuicao_lucro  jsonb not null default '[]'::jsonb,  -- snapshot por participante
  lucro_liquido       numeric(12,2) not null,
  bloqueado           boolean not null default false,
  fechado_por         uuid references public.usuarios(id),
  fechado_em          timestamptz
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
-- Regra geral:
--   gestor         → acesso total, inclusive parâmetros
--   administrador  → tudo, exceto parametros_gerais / imovel_parametros /
--                     participantes_lucro (Módulo de Parâmetros)
--   operador       → reservas, manutenções, despesas, pagamentos_pessoal;
--                     sem leitura de contas_bancarias e dados_acesso
--                     (tratado a nível de coluna na aplicação/views)

alter table public.usuarios                enable row level security;
alter table public.proprietarios           enable row level security;
alter table public.contas_bancarias        enable row level security;
alter table public.imoveis                 enable row level security;
alter table public.imovel_coproprietarios  enable row level security;
alter table public.canais_venda            enable row level security;
alter table public.hospedes                enable row level security;
alter table public.parametros_gerais       enable row level security;
alter table public.imovel_parametros       enable row level security;
alter table public.participantes_lucro     enable row level security;
alter table public.reservas                enable row level security;
alter table public.reserva_competencias    enable row level security;
alter table public.reservas_diretas        enable row level security;
alter table public.manutencoes             enable row level security;
alter table public.despesas_tr             enable row level security;
alter table public.despesa_parcelas        enable row level security;
alter table public.pagamentos_pessoal      enable row level security;
alter table public.repasses                enable row level security;
alter table public.notas_fiscais           enable row level security;
alter table public.fechamentos_mensais     enable row level security;

-- usuarios: todo mundo autenticado vê a própria linha; gestor vê todas
create policy usuarios_select on public.usuarios for select
  using (id = auth.uid() or public.meu_perfil() = 'gestor');
create policy usuarios_gestor_all on public.usuarios for all
  using (public.meu_perfil() = 'gestor');

-- Módulo de Parâmetros: só o gestor lê/escreve
create policy parametros_gerais_gestor on public.parametros_gerais for all
  using (public.meu_perfil() = 'gestor');
create policy imovel_parametros_gestor on public.imovel_parametros for all
  using (public.meu_perfil() = 'gestor');
create policy participantes_lucro_gestor on public.participantes_lucro for all
  using (public.meu_perfil() = 'gestor');

-- Dados bancários e dados de acesso: gestor e administrador
create policy contas_bancarias_admin on public.contas_bancarias for all
  using (public.meu_perfil() in ('gestor', 'administrador'));

-- Operacional: gestor, administrador e operador têm acesso de
-- leitura/escrita (a UI do operador simplesmente não expõe campos
-- sensíveis, como dados_acesso e contas_bancarias, que ficam de fora
-- das views que o perfil operador consulta)
create policy proprietarios_operacional on public.proprietarios for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy imoveis_operacional on public.imoveis for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy imovel_coprop_operacional on public.imovel_coproprietarios for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy canais_operacional on public.canais_venda for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy hospedes_operacional on public.hospedes for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy reservas_operacional on public.reservas for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy reserva_comp_operacional on public.reserva_competencias for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy reservas_diretas_operacional on public.reservas_diretas for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy manutencoes_operacional on public.manutencoes for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy despesas_tr_operacional on public.despesas_tr for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy despesa_parcelas_operacional on public.despesa_parcelas for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));
create policy pagamentos_pessoal_operacional on public.pagamentos_pessoal for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));

-- Financeiro sensível (repasses, NF, fechamento): gestor e administrador
create policy repasses_admin on public.repasses for all
  using (public.meu_perfil() in ('gestor', 'administrador'));
create policy notas_fiscais_admin on public.notas_fiscais for all
  using (public.meu_perfil() in ('gestor', 'administrador'));
create policy fechamentos_admin on public.fechamentos_mensais for all
  using (public.meu_perfil() in ('gestor', 'administrador'));

-- =====================================================================
-- Seed mínimo (canais de venda padrão)
-- =====================================================================
insert into public.canais_venda (nome) values
  ('Airbnb'), ('Booking'), ('TR'), ('Direto')
on conflict (nome) do nothing;
