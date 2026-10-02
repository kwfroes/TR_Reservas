-- =====================================================================
-- MIGRAÇÃO — rodar uma vez no SQL Editor do Supabase (banco já existe,
-- por isso não é o schema.sql inteiro de novo, só o que mudou agora).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ESTOQUE (itens de reposição — lençóis, produtos de limpeza etc.)
-- ---------------------------------------------------------------------
create table if not exists public.estoque (
  id                uuid primary key default gen_random_uuid(),
  data_compra       date not null,
  item              text not null,
  quantidade        numeric(12,2) not null,
  quantidade_atual  numeric(12,2) not null,
  valor_unitario    numeric(12,2),
  criado_em         timestamptz not null default now()
);
alter table public.estoque enable row level security;
drop policy if exists estoque_operacional on public.estoque;
create policy estoque_operacional on public.estoque for all
  using (public.meu_perfil() in ('gestor', 'administrador', 'operador'));

-- ---------------------------------------------------------------------
-- 2. LOG DE ATIVIDADES (auditoria de criar/editar/excluir)
-- ---------------------------------------------------------------------
create table if not exists public.logs_atividade (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid references public.usuarios(id),
  acao         text not null,
  tabela       text not null,
  registro_id  uuid,
  descricao    text,
  criado_em    timestamptz not null default now()
);
alter table public.logs_atividade enable row level security;
drop policy if exists logs_insercao on public.logs_atividade;
create policy logs_insercao on public.logs_atividade for insert
  with check (usuario_id = auth.uid());
drop policy if exists logs_leitura on public.logs_atividade;
create policy logs_leitura on public.logs_atividade for select
  using (public.meu_perfil() in ('gestor', 'administrador'));

-- ---------------------------------------------------------------------
-- 3. Correção de RLS: a tela de Logs é usada por Gestor E Administrador,
--    mas a política de leitura de `usuarios` só deixava o Gestor ver o
--    nome de outras pessoas. Sem isso, um Administrador veria "—" no
--    lugar do nome de quem fez cada ação (exceto a própria).
-- ---------------------------------------------------------------------
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using (id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador'));
