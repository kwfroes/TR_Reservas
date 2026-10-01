// =====================================================================
// Cliente Supabase único do projeto.
// Importado via <script type="module"> em toda página (login e /app).
//
// A chave abaixo é a "anon/publishable key": ela é FEITA para ficar
// exposta no navegador. Quem protege os dados são as políticas de RLS
// do schema.sql — nunca coloque aqui a "service_role key".
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uafxpgralylqfeorrnms.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZnhwZ3JhbHlscWZlb3Jybm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODQ5NzAsImV4cCI6MjEwNjQ2MDk3MH0.5vyzP00GqaMr5z5DGb72nbyETTwdgFACeRG3Ahij5fQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Busca o perfil (gestor | administrador | operador) do usuário logado.
// Usado só para montar o menu/UI — a permissão de verdade é o RLS.
export async function obterPerfilAtual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('nome, perfil')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Erro ao buscar perfil:', error.message);
    return null;
  }
  return data; // { nome, perfil }
}
