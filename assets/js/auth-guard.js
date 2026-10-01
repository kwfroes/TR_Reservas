// =====================================================================
// Guard de sessão para páginas de /app/*.html
//
// Uso (no <head>, antes do resto do script da página):
//   <script type="module">
//     import { exigirSessao } from '../assets/js/auth-guard.js';
//     const { usuario, perfil } = await exigirSessao();
//   </script>
//
// Sem sessão válida → redireciona para o login (index.html na raiz).
// Isto é só UX (evita mostrar a tela em branco); a proteção real dos
// dados é o RLS do banco, não este redirecionamento.
// =====================================================================
import { supabase, obterPerfilAtual } from './supabaseClient.js';

export async function exigirSessao() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '../index.html';
    // Lança para interromper o restante do script da página que chamou.
    throw new Error('Sem sessão — redirecionando para login.');
  }

  const perfilInfo = await obterPerfilAtual();
  if (!perfilInfo) {
    window.location.href = '../index.html';
    throw new Error('Perfil não encontrado — redirecionando para login.');
  }

  return { usuario: session.user, ...perfilInfo };
}

// Bloqueia a página para quem não está entre os perfis permitidos.
// Uso, logo após exigirSessao():
//   const { perfil } = await exigirSessao();
//   exigirPerfil(perfil, ['gestor']);
// Isto é só UX (evita renderizar uma tela que a pessoa não deveria ver);
// a proteção real do dado continua sendo o RLS do banco.
export function exigirPerfil(perfilAtual, permitidos) {
  if (!permitidos.includes(perfilAtual)) {
    window.location.href = 'dashboard.html';
    throw new Error(`Perfil "${perfilAtual}" sem acesso a esta página.`);
  }
}

export async function sair() {
  await supabase.auth.signOut();
  window.location.href = '../index.html';
}

// Mostra/esconde itens de menu marcados com data-perfil="gestor,administrador"
// conforme o perfil do usuário logado. Ex.: o link de Parâmetros no menu
// leva data-perfil="gestor" e só aparece para o Gestor.
export function aplicarVisibilidadePorPerfil(perfilAtual) {
  document.querySelectorAll('[data-perfil]').forEach((el) => {
    const permitidos = el.dataset.perfil.split(',').map((p) => p.trim());
    el.style.display = permitidos.includes(perfilAtual) ? '' : 'none';
  });
}
