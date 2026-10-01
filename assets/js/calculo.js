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

  // valorProprietarioMes = brutoMes - comissaoMes. A limpeza NÃO entra aqui:
  // valorBrutoMes já é só a parte de diárias (sem limpeza), e a limpeza cobrada
  // do hóspede nunca compôs o repasse ao proprietário — ela é um fluxo à parte
  // (hóspede → TR → faxineira). valorLimpezaMes fica só para exibição/controle
  // de qual mês concentra essa cobrança.
  linhas.forEach((l) => {
    l.valorProprietarioMes = arredondar(l.valorBrutoMes - l.valorComissaoMes);
  });

  // Ajuste de centavos: garante que a soma bate exatamente com os totais
  // originais (rateio por noite pode sobrar/faltar 1 ou 2 centavos).
  ajustarArredondamento(linhas, 'valorBrutoMes', valorBruto);
  ajustarArredondamento(linhas, 'valorComissaoMes', valorComissao);

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

  const distrib = calcularDistribuicaoLucro(5000, [
    { id: '1', nome: 'Moisés', percentual: 0.2, valor_minimo: 1000, deduz_do_lucro: false },
    { id: '2', nome: 'Emilly', valor_fixo: 200, deduz_do_lucro: true },
  ]);
  console.table(distrib.detalhes);
  console.log('Lucro líquido após deduções:', distrib.lucroLiquido);
}
