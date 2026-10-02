-- =====================================================================
-- CORREÇÃO — funde imóveis duplicados criados pela mudança de código
-- (ex.: "Barra I" com código "2" e "Barra I" com código "TR002").
--
-- Para cada par com o MESMO nome_referencia, onde um tem código só
-- numérico e o outro já está no padrão TR0XX:
--   1. Move tudo que aponta pro imóvel antigo (reservas, reservas
--      diretas, manutenções, regras específicas, coproprietários,
--      repasses) para o imóvel novo.
--   2. Apaga a linha antiga, que já ficou sem nada vinculado.
--
-- Rode uma vez no SQL Editor. Dá pra rodar de novo sem problema — se
-- não houver mais duplicados, o laço simplesmente não encontra nada
-- pra fazer.
-- =====================================================================

do $$
declare
  rec record;
begin
  for rec in
    select
      antigo.id   as id_antigo,
      antigo.codigo_interno as codigo_antigo,
      novo.id     as id_novo,
      novo.codigo_interno   as codigo_novo,
      antigo.nome_referencia as nome
    from public.imoveis antigo
    join public.imoveis novo
      on novo.nome_referencia = antigo.nome_referencia
     and novo.id <> antigo.id
     and novo.codigo_interno ~ '^TR[0-9]+$'
    where antigo.codigo_interno ~ '^[0-9]+$'
  loop
    raise notice 'Fundindo "%": código % → %', rec.nome, rec.codigo_antigo, rec.codigo_novo;

    -- O SQL de lançamentos de teste rodou duas vezes (uma por código antigo,
    -- outra por TR0XX) sem proteção contra duplicar reservas. Isso criou a
    -- MESMA reserva sob os dois imóveis — o que só vira problema agora, ao
    -- mover tudo pro mesmo imóvel (a trava de overbooking não deixa duas
    -- reservas iguais no mesmo imóvel). Apaga a cópia do antigo quando já
    -- existe uma igual (mesmo hóspede e mesmas datas) no novo, antes de mover
    -- o restante.
    delete from public.reservas r
    using public.reservas r2
    where r.imovel_id = rec.id_antigo
      and r2.imovel_id = rec.id_novo
      and r.hospede = r2.hospede
      and r.data_entrada = r2.data_entrada
      and r.data_saida = r2.data_saida;

    delete from public.reservas_diretas r
    using public.reservas_diretas r2
    where r.imovel_id = rec.id_antigo
      and r2.imovel_id = rec.id_novo
      and r.hospede = r2.hospede
      and r.periodo_inicio is not distinct from r2.periodo_inicio
      and r.periodo_fim is not distinct from r2.periodo_fim;

    update public.reservas               set imovel_id = rec.id_novo where imovel_id = rec.id_antigo;
    update public.reservas_diretas       set imovel_id = rec.id_novo where imovel_id = rec.id_antigo;
    update public.manutencoes            set imovel_id = rec.id_novo where imovel_id = rec.id_antigo;
    update public.imovel_parametros      set imovel_id = rec.id_novo where imovel_id = rec.id_antigo;
    update public.repasses               set imovel_id = rec.id_novo where imovel_id = rec.id_antigo;
    -- Coproprietário que por acaso já exista nos dois lados não pode duplicar a chave composta.
    update public.imovel_coproprietarios set imovel_id = rec.id_novo
      where imovel_id = rec.id_antigo
        and proprietario_id not in (
          select proprietario_id from public.imovel_coproprietarios where imovel_id = rec.id_novo
        );
    delete from public.imovel_coproprietarios where imovel_id = rec.id_antigo;

    delete from public.imoveis where id = rec.id_antigo;
  end loop;
end $$;

-- Conferência: não deve sobrar nenhuma linha com código só numérico.
select codigo_interno, nome_referencia from public.imoveis
where codigo_interno ~ '^[0-9]+$';
