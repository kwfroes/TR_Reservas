-- Adiciona a coluna `ativo` em `imoveis` caso ainda não exista.
-- Rodar uma vez no SQL Editor do Supabase.
alter table public.imoveis
  add column if not exists ativo boolean not null default true;
