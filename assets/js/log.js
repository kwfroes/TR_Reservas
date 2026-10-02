// =====================================================================
// Log de atividades — registra quem criou, editou ou excluiu o quê.
// Chamado depois de toda operação de salvar/editar/excluir bem-sucedida,
// em qualquer tela do app. Nunca deve interromper o fluxo principal: se o
// log falhar, só registra no console e segue em frente.
// =====================================================================
import { supabase } from './supabaseClient.js';

/**
 * @param {object} p
 * @param {'criar'|'editar'|'excluir'} p.acao
 * @param {string} p.tabela       — nome da tabela afetada, ex. 'reservas'
 * @param {string} [p.registroId] — id do registro afetado, quando houver
 * @param {string} [p.descricao]  — resumo legível, ex. "Reserva de João em Barra I"
 */
export async function registrarLog({ acao, tabela, registroId, descricao }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('logs_atividade').insert({
      usuario_id: user.id,
      acao,
      tabela,
      registro_id: registroId || null,
      descricao: descricao || null,
    });
    if (error) console.error('Erro ao registrar log:', error.message);
  } catch (err) {
    console.error('Erro ao registrar log:', err.message);
  }
}
