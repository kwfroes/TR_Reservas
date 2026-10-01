// =====================================================================
// Menu lateral retrátil (off-canvas) para telas estreitas.
// Reaproveitado em toda página de /app que usa o layout padrão
// (aside#sidebar + header#topo-mobile + div#sidebar-overlay).
//
// Em telas sm (≥640px) o CSS já mostra o menu fixo ao lado do conteúdo;
// este script só entra em ação no recorte mobile.
// =====================================================================
export function initSidebarMobile() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btnAbrir = document.getElementById('btn-menu-abrir');
  const btnFechar = document.getElementById('btn-menu-fechar');

  if (!sidebar || !overlay || !btnAbrir) return;

  function abrir() {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
    btnAbrir.setAttribute('aria-expanded', 'true');
  }

  function fechar() {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
    btnAbrir.setAttribute('aria-expanded', 'false');
  }

  btnAbrir.addEventListener('click', abrir);
  if (btnFechar) btnFechar.addEventListener('click', fechar);
  overlay.addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });

  // Ao navegar para outra página pelo menu, fecha antes de sair
  // (evita o "flash" do menu aberto na página seguinte).
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', fechar));
}
