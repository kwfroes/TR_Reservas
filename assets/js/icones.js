// =====================================================================
// Botões de ação com ícone (visualizar/editar/excluir), reaproveitados
// em toda tabela do app no lugar dos antigos links de texto.
// =====================================================================

const SVG_VISUALIZAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_EDITAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>';
const SVG_EXCLUIR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

function botao(svg, dataId, classeExtra, titulo, corHover) {
  return `<button data-id="${dataId}" class="${classeExtra} inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 ${corHover} transition-colors" title="${titulo}" aria-label="${titulo}">${svg}</button>`;
}

/** Botão "olho" — abre a ficha somente-leitura. */
export function btnVisualizar(dataId, classeExtra) {
  return botao(SVG_VISUALIZAR, dataId, classeExtra, 'Visualizar', 'hover:text-slate-700 hover:bg-slate-100');
}

/** Botão "lápis" — abre o formulário de edição. */
export function btnEditar(dataId, classeExtra) {
  return botao(SVG_EDITAR, dataId, classeExtra, 'Editar', 'hover:text-blue-600 hover:bg-blue-50');
}

/** Botão "lixeira" — exclui o registro. */
export function btnExcluir(dataId, classeExtra) {
  return botao(SVG_EXCLUIR, dataId, classeExtra, 'Excluir', 'hover:text-red-600 hover:bg-red-50');
}

/** Agrupa os três (ou os que forem passados) numa única célula de tabela. */
export function celulaAcoes(...botoesHtml) {
  return `<div class="inline-flex gap-1">${botoesHtml.join('')}</div>`;
}
