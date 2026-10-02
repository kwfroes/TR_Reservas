// =====================================================================
// Modais compartilhados — alerta, confirmação e formulário genérico.
// Usado em toda página de /app no lugar de alert()/confirm() nativos
// (que não seguem a identidade visual e travam em alguns navegadores
// mobile dentro de iframes).
// =====================================================================

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function garantirContainer() {
  let overlay = document.getElementById('modal-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div id="modal-caixa" class="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
        <h2 id="modal-titulo" class="font-semibold text-slate-900"></h2>
        <button id="modal-fechar-x" aria-label="Fechar" class="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>
      <div id="modal-corpo" class="px-5 py-4"></div>
      <div id="modal-rodape" class="px-5 py-4 border-t border-slate-200 flex justify-end gap-2"></div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });
  overlay.querySelector('#modal-fechar-x').addEventListener('click', () => fecharModal());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) fecharModal();
  });

  return overlay;
}

/**
 * Abre um modal genérico.
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} [opcoes.corpoHtml]   — usado se corpoEl não for passado
 * @param {HTMLElement} [opcoes.corpoEl] — elemento já montado (ex.: um <form> clonado)
 * @param {Array<{texto, classe, acao}>} [opcoes.botoes] — rodapé; omitido = sem rodapé
 * @param {string} [opcoes.largura] — classe Tailwind de largura máxima (padrão max-w-lg)
 * @param {boolean} [opcoes.cheio] — true = ocupa a tela toda no mobile, com layout
 *   flex interno (uso: editores com abas). O conteúdo (corpoEl) controla sua própria
 *   navegação/rodapé; este modo não usa `botoes` nem o preenchimento padrão de `corpo`.
 * @returns {{ corpo: HTMLElement, fechar: Function }}
 */
export function abrirModal({ titulo, corpoHtml, corpoEl, botoes, largura = 'max-w-lg', cheio = false }) {
  const overlay = garantirContainer();
  const caixa = document.getElementById('modal-caixa');

  overlay.className = cheio
    ? 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center sm:p-4'
    : 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';

  caixa.className = cheio
    ? `bg-white w-full h-full sm:h-[85vh] ${largura} rounded-none sm:rounded-xl shadow-xl flex flex-col overflow-hidden`
    : `bg-white rounded-xl shadow-xl w-full ${largura} max-h-[90vh] overflow-y-auto`;

  document.getElementById('modal-titulo').textContent = titulo || '';

  const corpo = document.getElementById('modal-corpo');
  corpo.className = cheio ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'px-5 py-4';
  corpo.innerHTML = '';
  if (corpoEl) corpo.appendChild(corpoEl);
  else corpo.innerHTML = corpoHtml || '';

  const rodape = document.getElementById('modal-rodape');
  rodape.innerHTML = '';
  if (!cheio && botoes && botoes.length) {
    rodape.classList.remove('hidden');
    botoes.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.texto;
      btn.className = `rounded-lg px-4 py-2 text-sm font-semibold ${b.classe || 'tr-btn'}`;
      btn.addEventListener('click', b.acao);
      rodape.appendChild(btn);
    });
  } else {
    rodape.classList.add('hidden');
  }

  overlay.classList.remove('hidden');
  return { corpo, fechar: fecharModal };
}

export function fecharModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

/** Substitui window.alert(). */
export function mostrarAlerta(mensagem, { titulo = 'Aviso' } = {}) {
  return new Promise((resolve) => {
    abrirModal({
      titulo,
      corpoHtml: `<p class="text-sm text-slate-600">${escapeHtml(mensagem)}</p>`,
      botoes: [{ texto: 'OK', acao: () => { fecharModal(); resolve(); } }],
    });
  });
}

/**
 * Modal de "ficha" somente-leitura — visual rico, sem campos editáveis.
 *
 * @param {object} opcoes
 * @param {string}  opcoes.titulo
 * @param {string}  [opcoes.subtitulo]     — linha menor abaixo do título
 * @param {string}  [opcoes.badge]         — texto do badge (ex.: "2 noites")
 * @param {string}  [opcoes.badgeCor]      — 'blue'|'green'|'amber'|'slate' (padrão: 'slate')
 * @param {string}  [opcoes.destaque]      — bloco HTML destacado (ex.: prévia de cálculo)
 * @param {Array<{secao?:string, campos:Array<{label,valor,html?}>}>} opcoes.secoes
 *   Cada item pode ser uma seção com título próprio e lista de campos.
 *   `campos` também pode ser passado diretamente no nível raiz (compatível com uso antigo).
 * @param {Array<{label,valor,html?}>} [opcoes.campos]  — atalho: uma única seção sem título
 * @param {string}  [opcoes.largura]
 */
export function exibirDetalhes({ titulo, subtitulo, badge, badgeCor = 'slate', destaque, secoes, campos, largura = 'max-w-lg' }) {
  // Compatibilidade: campos no nível raiz → transforma numa seção sem título
  const listaSecoes = secoes || (campos ? [{ campos }] : []);

  const corBadge = {
    blue:  'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  }[badgeCor] || 'bg-slate-100 text-slate-600';

  function renderCampo(c) {
    if (c.html) return `<div class="sm:col-span-2">${c.html}</div>`;
    const val = (c.valor != null && c.valor !== '') ? escapeHtml(String(c.valor)) : '—';
    const span = c.span2 ? 'sm:col-span-2' : '';
    return `<div class="${span}">
      <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-0.5">${escapeHtml(c.label)}</dt>
      <dd class="text-slate-800 font-medium break-words text-sm">${val}</dd>
    </div>`;
  }

  const secaoHtml = listaSecoes.map((s) => `
    ${s.secao ? `<p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-4 mb-2">${escapeHtml(s.secao)}</p>` : ''}
    <dl class="grid grid-cols-2 gap-x-6 gap-y-3">${s.campos.map(renderCampo).join('')}</dl>
  `).join('<div class="border-t border-slate-100 my-3"></div>');

  const corpoHtml = `
    <div class="space-y-1">
      <div class="flex items-start justify-between gap-3">
        <div>
          ${subtitulo ? `<p class="text-xs text-slate-500 mb-0.5">${escapeHtml(subtitulo)}</p>` : ''}
        </div>
        ${badge ? `<span class="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${corBadge}">${escapeHtml(badge)}</span>` : ''}
      </div>
      ${destaque ? `<div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">${destaque}</div>` : ''}
      ${secaoHtml}
    </div>`;

  abrirModal({
    titulo,
    corpoHtml,
    largura,
    botoes: [{ texto: 'Fechar', classe: 'bg-slate-100 text-slate-700 hover:bg-slate-200', acao: fecharModal }],
  });
}

/** Substitui window.confirm(). Resolve true/false. */
export function confirmarAcao(mensagem, { titulo = 'Confirmar', textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', perigo = false } = {}) {
  return new Promise((resolve) => {
    abrirModal({
      titulo,
      corpoHtml: `<p class="text-sm text-slate-600">${escapeHtml(mensagem)}</p>`,
      botoes: [
        { texto: textoCancelar, classe: 'bg-slate-100 text-slate-700 hover:bg-slate-200', acao: () => { fecharModal(); resolve(false); } },
        { texto: textoConfirmar, classe: perigo ? 'bg-red-600 text-white hover:bg-red-700' : 'tr-btn', acao: () => { fecharModal(); resolve(true); } },
      ],
    });
  });
}
