// =====================================================================
// Motor de cálculo — TR Serviços de Reservas
//
// Funções puras (sem efeitos colaterais, sem UI): recebem dados já
// buscados do banco e devolvem os valores calculados + o "snapshot" da
// regra usada (para gravar em reservas.regra_comissao_aplicada, por
// exemplo). Mantidas num módulo único para que reservas, repasses e
// fechamento mensal sempre calculem do mesmo jeito.
//
// Hierarquia de prioridade (ver PRD seção 4):
//   1) ajuste manual na própria reserva
//   2) exceção cadastrada no imóvel (imovel_parametros)
//   3) parâmetro geral (parametros_gerais)
// =====================================================================

import { supabase } from './supabaseClient.js';

/**
 * Busca o parâmetro vigente de um tipo, para uma data de referência,
 * já aplicando a hierarquia imóvel > geral.
 *
 * @param {string} tipo        'comissao' | 'limpeza' | 'nf'
 * @param {string|null} imovelId
 * @param {string} dataRef     'YYYY-MM-DD' — normalmente a data de entrada da reserva
 * @returns {Promise<{nivel: 'imovel'|'geral'|null, tipo, valor, percentual, base_calculo}>}
 */
export async function buscarParametroVigente(tipo, imovelId, dataRef) {
  if (imovelId) {
    const { data: exImovel, error: erroImovel } = await supabase
      .from('imovel_parametros')
      .select('*')
      .eq('imovel_id', imovelId)
      .eq('tipo', tipo)
      .lte('vigencia_inicio', dataRef)
      .or(`vigencia_fim.is.null,vigencia_fim.gte.${dataRef}`)
      .order('vigencia_inicio', { ascending: false })
      .limit(1);

    if (erroImovel) throw erroImovel;
    if (exImovel && exImovel.length) {
      const r = exImovel[0];
      return { nivel: 'imovel', tipo, valor: r.valor, percentual: r.percentual, base_calculo: r.base_calculo };
    }
  }

  const { data: geral, error: erroGeral } = await supabase
    .from('parametros_gerais')
    .select('*')
    .eq('tipo', tipo)
    .lte('vigencia_inicio', dataRef)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${dataRef}`)
    .order('vigencia_inicio', { ascending: false })
    .limit(1);

  if (erroGeral) throw erroGeral;
  if (geral && geral.length) {
    const r = geral[0];
    return { nivel: 'geral', tipo, valor: r.valor, percentual: r.percentual, base_calculo: r.base_calculo };
  }

  return { nivel: null, tipo, valor: null, percentual: null, base_calculo: null };
}

/**
 * Calcula a comissão de uma reserva.
 * Base padrão = (valorBruto - valorLimpeza), salvo se a regra disser outra coisa.
 */
export async function calcularComissao({ valorBruto, valorLimpeza, imovelId, dataRef }) {
  const regra = await buscarParametroVigente('comissao', imovelId, dataRef);

  const base = regra.base_calculo === 'bruto'
    ? valorBruto
    : valorBruto - (valorLimpeza || 0);

  let comissao;
  if (regra.percentual != null) {
    comissao = arredondar(base * regra.percentual);
  } else if (regra.valor != null) {
    comissao = regra.valor;
  } else {
    comissao = 0; // nenhuma regra cadastrada — tela deve alertar o usuário
  }

  return { comissao, base, regraAplicada: regra };
}

/**
 * Divide o valor da limpeza cobrado na reserva entre a faxineira e a TR,
 * usando o parâmetro "limpeza" (valor que fica com a faxineira) do imóvel
 * ou, na ausência dele, o geral.
 */
export async function calcularSplitLimpeza({ valorLimpezaCobrada, imovelId, dataRef }) {
  const regra = await buscarParametroVigente('limpeza', imovelId, dataRef);
  const valorFaxineira = regra.valor != null ? Math.min(regra.valor, valorLimpezaCobrada) : 0;
  const valorTR = arredondar(valorLimpezaCobrada - valorFaxineira);
  return { valorFaxineira, valorTR, regraAplicada: regra };
}

/**
 * Divide diárias, comissão e repasse proporcionalmente pelas noites em
 * cada mês quando a reserva atravessa virada de mês. A limpeza fica
 * inteira no mês do check-out (PRD seção 6.3).
 *
 * ATENÇÃO — `valorBruto` aqui é só a PARTE DE DIÁRIAS, não o campo
 * `reservas.valor_bruto` (que é o total pago pelo hóspede, já incluindo
 * a limpeza, como na planilha). Antes de chamar esta função a partir de
 * uma reserva real, subtraia a limpeza:
 *   dividirCompetencia({ valorBruto: reserva.valor_bruto - reserva.valor_limpeza, ... })
 *
 * @returns {Array<{mesReferencia: string, noites: number, valorBrutoMes, valorComissaoMes, valorProprietarioMes, valorLimpezaMes}>}
 */
export function dividirCompetencia({ dataEntrada, dataSaida, valorBruto, valorComissao, valorLimpeza }) {
  const entrada = new Date(dataEntrada + 'T00:00:00');
  const saida = new Date(dataSaida + 'T00:00:00');
  const totalNoites = diasEntre(entrada, saida);
  if (totalNoites <= 0) throw new Error('Data de saída deve ser depois da entrada.');

  const valorPorNoite = valorBruto / totalNoites;
  const comissaoPorNoite = valorComissao / totalNoites;

  const mesesNoites = {}; // 'YYYY-MM-01' -> contagem de noites
  let cursor = new Date(entrada);
  for (let i = 0; i < totalNoites; i++) {
    const mesRef = primeiroDiaDoMes(cursor);
    mesesNoites[mesRef] = (mesesNoites[mesRef] || 0) + 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  const mesDoCheckout = primeiroDiaDoMes(saida); // limpeza vai inteira aqui
  const linhas = Object.entries(mesesNoites).map(([mesReferencia, noites]) => ({
    mesReferencia,
    noites,
    valorBrutoMes: arredondar(valorPorNoite * noites),
    valorComissaoMes: arredondar(comissaoPorNoite * noites),
    valorLimpezaMes: mesReferencia === mesDoCheckout ? arredondar(valorLimpeza || 0) : 0,
  }));

  // Ajuste de centavos primeiro: garante que a soma de cada coluna bate
  // exatamente com os totais originais (rateio por noite pode sobrar ou
  // faltar 1-2 centavos, mais provável quando as noites se dividem em
  // partes iguais entre os meses).
  ajustarArredondamento(linhas, 'valorBrutoMes', valorBruto);
  ajustarArredondamento(linhas, 'valorComissaoMes', valorComissao);

  // valorProprietarioMes = brutoMes - comissaoMes, calculado DEPOIS do ajuste
  // acima — calcular antes deixaria esse valor desatualizado em relação à
  // comissão corrigida. A limpeza NÃO entra aqui: valorBrutoMes já é só a
  // parte de diárias (sem limpeza), e a limpeza cobrada do hóspede nunca
  // compôs o repasse ao proprietário — é um fluxo à parte (hóspede → TR →
  // faxineira). valorLimpezaMes fica só para exibição/controle de qual mês
  // concentra essa cobrança.
  linhas.forEach((l) => {
    l.valorProprietarioMes = arredondar(l.valorBrutoMes - l.valorComissaoMes);
  });

  return linhas;
}

/**
 * Aplica a distribuição de lucro mensal entre os participantes
 * cadastrados (ex.: sócios), cada um com seu próprio percentual, valor
 * fixo ou mínimo garantido, e a opção de deduzir ou não do lucro.
 */
export function calcularDistribuicaoLucro(lucroBruto, participantes) {
  let totalDeduzido = 0;

  const detalhes = participantes.map((p) => {
    let valor;
    if (p.valor_fixo != null) {
      valor = p.valor_fixo;
    } else {
      valor = lucroBruto * (p.percentual || 0);
      if (p.valor_minimo != null) valor = Math.max(valor, p.valor_minimo);
    }
    valor = arredondar(valor);
    if (p.deduz_do_lucro) totalDeduzido += valor;
    return { participanteId: p.id, nome: p.nome, valor, deduzDoLucro: !!p.deduz_do_lucro };
  });

  return { detalhes, lucroLiquido: arredondar(lucroBruto - totalDeduzido) };
}

/**
 * Distribui o valor de uma despesa parcelada em meses consecutivos a
 * partir do mês da data de compra (equivalente à lógica de EDATE da
 * aba COMPRAS E DESPESAS da planilha).
 *
 * @param {object} p
 * @param {string} p.data          — 'YYYY-MM-DD', data da compra
 * @param {number} p.valor         — valor total da despesa
 * @param {number} p.numParcelas   — quantidade de parcelas (mínimo 1)
 * @returns {Array<{mesReferencia: string, valorParcela: number}>}
 */
export function ratearDespesa({ data, valor, numParcelas }) {
  const n = Math.max(1, Math.round(numParcelas || 1));
  const valorParcela = arredondar(valor / n);
  const dataCompra = new Date(data + 'T00:00:00');

  const linhas = Array.from({ length: n }, (_, i) => {
    const mes = new Date(dataCompra.getFullYear(), dataCompra.getMonth() + i, 1);
    return { mesReferencia: primeiroDiaDoMes(mes), valorParcela };
  });

  ajustarArredondamento(linhas, 'valorParcela', valor);
  return linhas;
}

// =====================================================================
// Repasses — PRD seção 5.4/5.5 / Etapa 5
// =====================================================================

/**
 * Soma, por imóvel, o valor a repassar ao proprietário das reservas que
 * tocam o mês — usando a divisão de competência quando a reserva
 * atravessa virada de mês. Usado tanto por financeiro.html (repasses)
 * quanto por relatorios.html (relatório mensal por imóvel).
 *
 * @param {string} mesReferencia — 'YYYY-MM-01'
 * @returns {Promise<Map<string, number>>} imovelId -> valorBruto
 */
export async function calcularBrutoPorImovelNoMes(mesReferencia) {
  const { inicio, fim } = limitesDoMes(mesReferencia);

  const { data: reservas, error: erroReservas } = await supabase
    .from('reservas')
    .select('id, imovel_id, valor_proprietario, data_entrada, data_saida')
    .lt('data_entrada', fim)
    .gt('data_saida', inicio);
  if (erroReservas) throw erroReservas;

  const idsReservas = reservas.map((r) => r.id);
  let competencias = [];
  if (idsReservas.length) {
    const { data, error } = await supabase
      .from('reserva_competencias')
      .select('reserva_id, valor_proprietario_mes')
      .eq('mes_referencia', inicio)
      .in('reserva_id', idsReservas);
    if (error) throw error;
    competencias = data;
  }
  const mapaCompetencia = new Map(competencias.map((c) => [c.reserva_id, c.valor_proprietario_mes]));

  const brutoPorImovel = new Map();
  reservas.forEach((r) => {
    const valor = mapaCompetencia.has(r.id) ? mapaCompetencia.get(r.id) : r.valor_proprietario;
    brutoPorImovel.set(r.imovel_id, (brutoPorImovel.get(r.imovel_id) || 0) + valor);
  });
  return brutoPorImovel;
}

/**
 * Cria ou atualiza o repasse de um imóvel/mês, descontando as
 * manutenções cobradas do proprietário ainda não vinculadas a nenhum
 * repasse. Nunca mexe num repasse já marcado como "pago".
 *
 * @returns {Promise<'ok'|'pago'>}
 */
export async function gerarRepasseImovel(imovelId, mesReferencia, valorBruto) {
  const { data: existente, error: erroExistente } = await supabase
    .from('repasses').select('*').eq('imovel_id', imovelId).eq('mes_referencia', mesReferencia).maybeSingle();
  if (erroExistente) throw erroExistente;

  if (existente && existente.status === 'pago') return 'pago';

  let query = supabase.from('manutencoes').select('id, valor').eq('imovel_id', imovelId).eq('cobrado_proprietario', true);
  query = existente ? query.or(`repasse_id.is.null,repasse_id.eq.${existente.id}`) : query.is('repasse_id', null);
  const { data: manuts, error: erroManuts } = await query;
  if (erroManuts) throw erroManuts;

  const deducoes = manuts.reduce((s, m) => s + Number(m.valor || 0), 0);
  const valorLiquido = valorBruto - deducoes;

  let repasseId;
  if (existente) {
    const { error } = await supabase.from('repasses').update({ valor_bruto: valorBruto, deducoes, valor_liquido: valorLiquido }).eq('id', existente.id);
    if (error) throw error;
    repasseId = existente.id;
  } else {
    const { data: novo, error } = await supabase.from('repasses').insert({
      imovel_id: imovelId, mes_referencia: mesReferencia, valor_bruto: valorBruto, deducoes, valor_liquido: valorLiquido, status: 'pendente',
    }).select().single();
    if (error) throw error;
    repasseId = novo.id;
  }

  if (manuts.length) {
    const { error } = await supabase.from('manutencoes').update({ repasse_id: repasseId }).in('id', manuts.map((m) => m.id));
    if (error) throw error;
  }
  return 'ok';
}

/** Gera/atualiza os repasses pendentes de todos os imóveis com movimento no mês. */
export async function sincronizarRepassesDoMes(mesReferencia) {
  const brutoPorImovel = await calcularBrutoPorImovelNoMes(mesReferencia);
  for (const [imovelId, valorBruto] of brutoPorImovel) {
    await gerarRepasseImovel(imovelId, mesReferencia, valorBruto);
  }
}

// =====================================================================
// Fechamento mensal (Tabela de Situação) — PRD seção 5.5 / Etapa 6
// =====================================================================

/**
 * Calcula os números de um mês (Entrada TR, Despesas, Lucro e distribuição
 * entre participantes) a partir dos dados atuais do banco. Usado tanto para
 * exibir um mês "aberto" (sempre ao vivo) quanto para recalcular um mês já
 * fechado depois que um lançamento retroativo é confirmado.
 *
 * @param {string} mesReferencia — 'YYYY-MM-01'
 */
export async function calcularFechamentoMensal(mesReferencia) {
  const { inicio, fim } = limitesDoMes(mesReferencia);

  // Entrada TR: soma das comissões das reservas que tocam o mês, usando a
  // divisão de competência quando a reserva atravessa virada de mês.
  const { data: reservas, error: erroReservas } = await supabase
    .from('reservas')
    .select('id, valor_comissao, data_entrada, data_saida')
    .lt('data_entrada', fim)
    .gt('data_saida', inicio);
  if (erroReservas) throw erroReservas;

  const idsReservas = reservas.map((r) => r.id);
  let competencias = [];
  if (idsReservas.length) {
    const { data, error } = await supabase
      .from('reserva_competencias')
      .select('reserva_id, valor_comissao_mes')
      .eq('mes_referencia', inicio)
      .in('reserva_id', idsReservas);
    if (error) throw error;
    competencias = data;
  }
  const mapaComissaoMes = new Map(competencias.map((c) => [c.reserva_id, c.valor_comissao_mes]));
  const entradaTR = arredondar(
    reservas.reduce((s, r) => s + (mapaComissaoMes.has(r.id) ? mapaComissaoMes.get(r.id) : r.valor_comissao), 0)
  );

  // Despesas: parcelas de despesas da TR do mês + manutenções pagas pela
  // própria TR do mês (cobrado_proprietario = false — as cobradas do
  // proprietário não entram aqui, pois já são descontadas do repasse dele).
  const { data: parcelas, error: erroParcelas } = await supabase
    .from('despesa_parcelas').select('valor_parcela').eq('mes_referencia', inicio);
  if (erroParcelas) throw erroParcelas;
  const totalParcelas = (parcelas || []).reduce((s, p) => s + Number(p.valor_parcela || 0), 0);

  const { data: manutTR, error: erroManut } = await supabase
    .from('manutencoes').select('valor').eq('cobrado_proprietario', false).gte('data', inicio).lt('data', fim);
  if (erroManut) throw erroManut;
  const totalManutTR = (manutTR || []).reduce((s, m) => s + Number(m.valor || 0), 0);

  const despesas = arredondar(totalParcelas + totalManutTR);
  const lucroBruto = arredondar(entradaTR - despesas);

  // Distribuição de lucro entre os participantes vigentes.
  const { data: participantes, error: erroPart } = await supabase
    .from('participantes_lucro').select('*').is('vigencia_fim', null);
  if (erroPart) throw erroPart;
  const { detalhes, lucroLiquido } = calcularDistribuicaoLucro(lucroBruto, participantes || []);

  return { mesReferencia: inicio, entradaTR, despesas, lucroBruto, distribuicao: detalhes, lucroLiquido };
}

/** Busca o registro de fechamento de um mês (ou null se ainda não existe). */
export async function obterFechamentoDoMes(mesReferencia) {
  const { data, error } = await supabase
    .from('fechamentos_mensais').select('*').eq('mes_referencia', mesReferencia).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Verifica se alguma das datas informadas cai num mês já fechado e, se sim,
 * pergunta (via a função de confirmação passada, ex.: confirmarAcao do
 * modal.js) se o usuário quer prosseguir mesmo assim. Retorna true se pode
 * prosseguir (nenhum mês fechado, ou usuário confirmou).
 *
 * @param {Array<string|null|undefined>} datas — 'YYYY-MM-DD'
 * @param {(mensagem: string, opcoes?: object) => Promise<boolean>} confirmarAcaoFn
 */
export async function confirmarSeMesFechado(datas, confirmarAcaoFn) {
  const meses = [...new Set(datas.filter(Boolean).map((d) => primeiroDiaDoMes(new Date(d + 'T00:00:00'))))];
  const fechados = [];
  for (const mes of meses) {
    const f = await obterFechamentoDoMes(mes);
    if (f && f.bloqueado) fechados.push(mes);
  }
  if (!fechados.length) return true;

  const lista = fechados.map((m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`).join(', ');
  const plural = fechados.length > 1;
  return confirmarAcaoFn(
    `O mês${plural ? 'es' : ''} ${lista} já ${plural ? 'estão fechados' : 'está fechado'}. Esse lançamento vai alterar os números do fechamento. Deseja continuar?`,
    { titulo: 'Mês já fechado', textoConfirmar: 'Continuar mesmo assim' }
  );
}

/**
 * Depois de um lançamento confirmado sobre um mês fechado, recalcula e
 * atualiza o fechamento daquele mês (continua fechado, só que com os
 * números corrigidos) — reflete o lançamento imediatamente, sem precisar
 * reabrir o mês manualmente.
 *
 * @param {Array<string|null|undefined>} datas — 'YYYY-MM-DD'
 */
export async function recalcularFechamentosFechados(datas) {
  const meses = [...new Set(datas.filter(Boolean).map((d) => primeiroDiaDoMes(new Date(d + 'T00:00:00'))))];
  for (const mes of meses) {
    const fechamento = await obterFechamentoDoMes(mes);
    if (fechamento && fechamento.bloqueado) {
      const recalculo = await calcularFechamentoMensal(mes);
      await supabase.from('fechamentos_mensais').update({
        entrada_tr: recalculo.entradaTR,
        despesas: recalculo.despesas,
        distribuicao_lucro: recalculo.distribuicao,
        lucro_liquido: recalculo.lucroLiquido,
      }).eq('id', fechamento.id);
    }
  }
}

// ---------------------------------------------------------------------
// Auxiliares internos
// ---------------------------------------------------------------------
function arredondar(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function diasEntre(a, b) {
  return Math.round((b - a) / 86400000);
}

function primeiroDiaDoMes(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-01`;
}

function limitesDoMes(mesReferencia) {
  const [ano, mes] = mesReferencia.split('-').map(Number);
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  return { inicio: mesReferencia, fim };
}

function ajustarArredondamento(linhas, campo, totalEsperado) {
  const somaAtual = arredondar(linhas.reduce((s, l) => s + l[campo], 0));
  const diferenca = arredondar(totalEsperado - somaAtual);
  if (diferenca !== 0 && linhas.length) {
    linhas[linhas.length - 1][campo] = arredondar(linhas[linhas.length - 1][campo] + diferenca);
  }
}

// =====================================================================
// Autoverificação manual — abra qualquer página com ?testCalculo=1 na
// URL e confira no console se os valores batem com o exemplo do PRD
// (seção 6.3): reserva de 28/01 a 03/02, 6 noites, diária R$ 300,
// limpeza R$ 140 → Jan: 4 noites / R$1.200 bruto / R$240 comissão (20%)
// / R$960 proprietário; Fev: 2 noites / R$600 / R$120 / R$480 + limpeza.
// =====================================================================
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('testCalculo')) {
  const resultado = dividirCompetencia({
    dataEntrada: '2026-01-28',
    dataSaida: '2026-02-03',
    valorBruto: 1800,
    valorComissao: 360,
    valorLimpeza: 140,
  });
  console.table(resultado);
  console.assert(resultado[0].valorBrutoMes === 1200, 'Janeiro deveria ser R$1.200');
  console.assert(resultado[1].valorLimpezaMes === 140, 'Limpeza deveria cair em Fevereiro');
  console.assert(resultado[0].valorProprietarioMes === 960, 'Repasse Janeiro deveria ser R$960');
  console.assert(resultado[1].valorProprietarioMes === 480, 'Repasse Fevereiro deveria ser R$480 (limpeza não desconta do repasse)');

  // Caso real (Celimar/alicia, 30/01→03/02) que revelou um bug de 1 centavo:
  // o repasse por mês era calculado ANTES do ajuste de arredondamento da
  // comissão, então ficava com o valor desatualizado. Trava essa regressão.
  const resultado2 = dividirCompetencia({
    dataEntrada: '2026-01-30', dataSaida: '2026-02-03',
    valorBruto: 1518.96, valorComissao: 303.79, valorLimpeza: 180,
  });
  const somaPropor = resultado2.reduce((s, l) => s + l.valorProprietarioMes, 0);
  console.assert(Math.abs(somaPropor - 1215.17) < 0.001, 'Soma do repasse mensal deveria bater com o valor da reserva inteira (R$1.215,17)');

  const distrib = calcularDistribuicaoLucro(5000, [
    { id: '1', nome: 'Moisés', percentual: 0.2, valor_minimo: 1000, deduz_do_lucro: false },
    { id: '2', nome: 'Emilly', valor_fixo: 200, deduz_do_lucro: true },
  ]);
  console.table(distrib.detalhes);
  console.log('Lucro líquido após deduções:', distrib.lucroLiquido);
}
