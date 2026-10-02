-- =====================================================================
-- LANÇAMENTOS DE TESTE — extraídos da planilha real (aba "2026")
-- 10 reservas sem competência + 4 que atravessam mês + 1 reserva direta
-- Rode no SQL Editor do Supabase. Idempotente onde possível (pode rodar
-- mais de uma vez sem duplicar proprietários/imóveis).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Parâmetro geral de comissão (só insere se ainda não existir nenhum
--    em vigor — pule este bloco se você já configurou em Parâmetros).
-- ---------------------------------------------------------------------
insert into public.parametros_gerais (tipo, percentual, base_calculo, vigencia_inicio)
select 'comissao', 0.20, 'bruto_menos_limpeza', '2026-01-01'
where not exists (
  select 1 from public.parametros_gerais where tipo = 'comissao' and vigencia_fim is null
);

-- ---------------------------------------------------------------------
-- 2. Proprietários (8 pessoas; Ana Cleia e Marlene já aparecem em mais
--    de um imóvel na planilha — é esperado, não é duplicidade).
-- ---------------------------------------------------------------------
insert into public.proprietarios (nome, cpf_cnpj)
select nome, cpf_cnpj from (values
  ('Lety',                             null),
  ('Rejane',                           '226.320.425-34'),
  ('Alfredo',                          '137.182.905-53'),
  ('Ana Cleia',                        '284.201.605-04'),
  ('Marlene',                          '03.016.225/0001-24'),
  ('Maria de Fátima',                  '241.159.595-68'),
  ('Ana Cristina dos Santos Apostolo', '681.832.245-04')
) as novos(nome, cpf_cnpj)
where not exists (
  select 1 from public.proprietarios p where p.nome = novos.nome
);

-- ---------------------------------------------------------------------
-- 3. Contas bancárias (Marlene tem duas — PIX e Santander — com a PIX
--    marcada como padrão, igual está na planilha DADOS PROPRIETÁRIOS).
-- ---------------------------------------------------------------------
insert into public.contas_bancarias (proprietario_id, favorecido, tipo, dados_bancarios, padrao)
select p.id, c.favorecido, c.tipo, c.dados, c.padrao
from (values
  ('Lety',                             'Lety',                             'BB',        'BB AG 3459-2 CC 4829-1',              true),
  ('Rejane',                           'Rejane',                           'PIX',       'PIX 22632042534',                     true),
  ('Alfredo',                          'Alfredo',                          'PIX',       'PIX 13718290553',                     true),
  ('Ana Cleia',                        'Ana Cleia',                        'PIX',       'PIX 46469362591',                     true),
  ('Marlene',                          'Marlene',                          'PIX',       '00348234848',                          true),
  ('Marlene',                          'Marlene',                          'Santander', 'Ag: 0691 CC: 01.014739-5',             false),
  ('Maria de Fátima',                  'Maria de Fátima',                  'PIX',       'a541e96f-e887-4bd6-aeff-d757f9939028', true),
  ('Ana Cristina dos Santos Apostolo', 'Ana Cristina dos Santos Apostolo', 'PIX',       '71999005802',                          true)
) as c(nome_prop, favorecido, tipo, dados, padrao)
join public.proprietarios p on p.nome = c.nome_prop
where not exists (
  select 1 from public.contas_bancarias cb where cb.proprietario_id = p.id and cb.dados_bancarios = c.dados
);

-- ---------------------------------------------------------------------
-- 4. Imóveis (código interno = "Código do imóvel" da planilha).
-- ---------------------------------------------------------------------
insert into public.imoveis (codigo_interno, proprietario_id, nome_referencia)
select v.cod, p.id, v.nome from (values
  ('TR002',  'Lety',                             'Barra I'),
  ('TR003',  'Rejane',                           'Cobertura'),
  ('TR004',  'Alfredo',                          'Barra II'),
  ('TR005',  'Ana Cleia',                        'Gato'),
  ('TR011', 'Marlene',                          'Barra III'),
  ('TR012', 'Marlene',                          'The B the Place'),
  ('TR013', 'Maria de Fátima',                  'Celimar'),
  ('TR019', 'Ana Cristina dos Santos Apostolo', 'Celimar 2')
) as v(cod, nome_prop, nome)
join public.proprietarios p on p.nome = v.nome_prop
on conflict (codigo_interno) do nothing;

-- ---------------------------------------------------------------------
-- 5. Reservas sem competência (10) — hóspede, datas e valores reais.
--    valor = total pago pelo hóspede (já inclui limpeza), conforme
--    convenção do sistema.
-- ---------------------------------------------------------------------
insert into public.reservas
  (imovel_id, hospede, data_entrada, data_saida, valor_bruto, valor_limpeza, valor_comissao, valor_proprietario, numero_nf)
select im.id, v.hospede, v.entrada::date, v.saida::date, v.valor, v.limpeza, v.comissao, v.prop, v.nf
from (values
  ('TR002',  'Angela',   '2026-01-03', '2026-01-07', 1174.00, 140, 206.80,  827.20, '753'),
  ('TR002',  'fernanda', '2026-01-07', '2026-01-12', 1240.45, 140, 220.09,  880.36, '775'),
  ('TR002',  'Natalie',  '2026-01-13', '2026-01-18', 1584.00, 140, 288.80, 1155.20, '795'),
  ('TR003',  'wandson',  '2026-03-26', '2026-03-29',  687.22, 140, 109.44,  437.78, '1012'),
  ('TR012', 'Larissa',  '2026-03-02', '2026-03-06',  906.70, 140, 153.34,  613.36, '945'),
  ('TR004',  'carlos',   '2026-04-23', '2026-04-29', 1479.43, 140, 267.89, 1071.54, '1088'),
  ('TR019', 'Cristian', '2026-04-13', '2026-04-16',  811.34, 180, 126.27,  505.07, '1064'),
  ('TR013', 'marjorie', '2026-05-26', '2026-05-29', 1183.52, 180, 200.70,  802.82, '1175'),
  ('TR005',  'mairi',    '2026-06-08', '2026-06-10',  524.90, 140,  76.98,  307.92, '1213'),
  ('TR003',  'claire',   '2026-07-10', '2026-07-19', 1861.15, 140, 344.23, 1376.92, '1261')
) as v(cod, hospede, entrada, saida, valor, limpeza, comissao, prop, nf)
join public.imoveis im on im.codigo_interno = v.cod;

-- ---------------------------------------------------------------------
-- 6. Reservas que atravessam virada de mês (4) — já com a divisão de
--    competência calculada (valores conferidos com calculo.js via Node
--    antes de gerar este SQL). Duas delas (Barra I/nicolas e Barra
--    III/maxuel) têm check-out no dia 1º do mês seguinte, então todas
--    as noites caem no mês anterior — é esperado só uma linha de
--    competência nesses dois casos.
-- ---------------------------------------------------------------------

-- 6a. Barra I / nicolas — 28/01 a 01/02 (4 noites, todas em janeiro)
with nova as (
  insert into public.reservas (imovel_id, hospede, data_entrada, data_saida, valor_bruto, valor_limpeza, valor_comissao, valor_proprietario, numero_nf)
  select id, 'nicolas', '2026-01-28', '2026-02-01', 1274.07, 140, 226.81, 907.26, '838'
  from public.imoveis where codigo_interno = 'TR002'
  returning id
)
insert into public.reserva_competencias (reserva_id, mes_referencia, noites, valor_bruto_mes, valor_comissao_mes, valor_proprietario_mes)
select id, '2026-01-01', 4, 1134.07, 226.81, 907.26 from nova;

-- 6b. Cobertura / leandro — 29/01 a 05/02 (7 noites: 3 jan + 4 fev)
with nova as (
  insert into public.reservas (imovel_id, hospede, data_entrada, data_saida, valor_bruto, valor_limpeza, valor_comissao, valor_proprietario, numero_nf)
  select id, 'leandro', '2026-01-29', '2026-02-05', 2233.50, 140, 418.70, 1674.80, '839'
  from public.imoveis where codigo_interno = 'TR003'
  returning id
)
insert into public.reserva_competencias (reserva_id, mes_referencia, noites, valor_bruto_mes, valor_comissao_mes, valor_proprietario_mes)
select id, m.mes, m.noites, m.bruto, m.comissao, m.prop
from nova, (values
  ('2026-01-01'::date, 3, 897.21, 179.44, 717.77),
  ('2026-02-01'::date, 4, 1196.29, 239.26, 957.03)
) as m(mes, noites, bruto, comissao, prop);

-- 6c. Celimar / alicia — 30/01 a 03/02 (4 noites: 2 jan + 2 fev)
with nova as (
  insert into public.reservas (imovel_id, hospede, data_entrada, data_saida, valor_bruto, valor_limpeza, valor_comissao, valor_proprietario, numero_nf)
  select id, 'alicia', '2026-01-30', '2026-02-03', 1698.96, 180, 303.79, 1215.17, '845'
  from public.imoveis where codigo_interno = 'TR013'
  returning id
)
insert into public.reserva_competencias (reserva_id, mes_referencia, noites, valor_bruto_mes, valor_comissao_mes, valor_proprietario_mes)
select id, m.mes, m.noites, m.bruto, m.comissao, m.prop
from nova, (values
  ('2026-01-01'::date, 2, 759.48, 151.90, 607.58),
  ('2026-02-01'::date, 2, 759.48, 151.89, 607.59)
) as m(mes, noites, bruto, comissao, prop);

-- 6d. Barra III / maxuel — 30/01 a 01/02 (2 noites, todas em janeiro)
with nova as (
  insert into public.reservas (imovel_id, hospede, data_entrada, data_saida, valor_bruto, valor_limpeza, valor_comissao, valor_proprietario, numero_nf)
  select id, 'maxuel', '2026-01-30', '2026-02-01', 964.01, 180, 156.80, 627.21, '843'
  from public.imoveis where codigo_interno = 'TR011'
  returning id
)
insert into public.reserva_competencias (reserva_id, mes_referencia, noites, valor_bruto_mes, valor_comissao_mes, valor_proprietario_mes)
select id, '2026-01-01', 2, 784.01, 156.80, 627.21 from nova;

-- ---------------------------------------------------------------------
-- 7. Uma reserva direta (fora de plataforma), real, da aba
--    "RESERVAS FORA PLATAFORMA" — para testar reservas_diretas também.
-- ---------------------------------------------------------------------
insert into public.reservas_diretas (imovel_id, hospede, periodo_inicio, periodo_fim, valor_contrato, valor_adiantado, status)
select id, 'Angela', '2025-01-21', '2025-02-04', 5040.00, 2520.00, 'ok'
from public.imoveis where codigo_interno = 'TR005';
