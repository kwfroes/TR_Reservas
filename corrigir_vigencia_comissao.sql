-- =====================================================================
-- CORREÇÃO — regra de comissão com vigência errada (2026-10-01 em vez
-- de 2026-01-01), o que fazia o cálculo retornar zero para reservas
-- de jan a set de 2026.
--
-- Estratégia: encerra a regra atual e recria com vigência desde 2026-01-01
-- (ou desde quando a TR começou a operar, se for antes de 2026).
-- Ajuste a data abaixo se necessário.
-- =====================================================================

-- 1. Encerra a regra com data errada
update public.parametros_gerais
set vigencia_fim = '2025-12-31'
where tipo = 'comissao'
  and vigencia_inicio = '2026-10-01'
  and vigencia_fim is null;

-- 2. Insere a regra correta — vigente desde 2026-01-01
insert into public.parametros_gerais (tipo, percentual, base_calculo, vigencia_inicio)
select 'comissao', 0.20, 'bruto_menos_limpeza', '2026-01-01'
where not exists (
  select 1 from public.parametros_gerais
  where tipo = 'comissao'
    and vigencia_inicio = '2026-01-01'
    and vigencia_fim is null
);

-- Conferência: deve mostrar a regra com vigencia_inicio = 2026-01-01
select tipo, percentual, base_calculo, vigencia_inicio, vigencia_fim
from public.parametros_gerais
where tipo = 'comissao'
order by vigencia_inicio desc;
