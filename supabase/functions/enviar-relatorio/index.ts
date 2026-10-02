import { createClient } from 'npm:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Cliente com o JWT do usuário → respeita RLS e valida sessão
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ erro: 'Não autenticado.' }, 401);

    const { imovelId, tipo, periodoTexto, nomeArquivo, pdfBase64 } = await req.json();
    if (!imovelId || !pdfBase64 || !['mensal', 'anual'].includes(tipo)) {
      return json({ erro: 'Dados incompletos.' }, 400);
    }

    // Destinatário vem do banco, nunca do front
    const { data: imovel, error } = await supabase
      .from('imoveis')
      .select('nome_referencia, proprietarios!proprietario_id(nome, email)')
      .eq('id', imovelId).single();
    if (error) return json({ erro: error.message }, 400);

    const destinatario = imovel.proprietarios?.email;
    if (!destinatario) return json({ erro: 'Proprietário sem e-mail cadastrado.' }, 422);

    const nomeProp = imovel.proprietarios?.nome ?? '';
    const tituloRel = tipo === 'mensal'
      ? 'Relatório Mensal de Prestação de Contas'
      : 'Relatório Anual de Prestação de Contas';
    const referencia = tipo === 'mensal'
      ? `referente ao mês de ${periodoTexto}`
      : `referente ao ${periodoTexto.toLowerCase()}`; // "Ano de 2026" → "ano de 2026"

    const html = `
      <p>Prezado(a) ${nomeProp},</p>
      <p>Segue, em anexo, o <strong>${tituloRel}</strong> do imóvel
         <strong>${imovel.nome_referencia}</strong>, ${referencia}.</p>
      <p>O documento apresenta o resumo das reservas, diárias, comissões, deduções
         e o valor líquido repassado no período.</p>
      <p>Permanecemos à disposição para quaisquer esclarecimentos.</p>
      <p>Atenciosamente,<br>
         <strong>TR Serviços de Reservas Turísticas LTDA – TR Brazil Host</strong><br>
         (71) 9.8876-8130 · trbrazilhost@gmail.com</p>`;

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: Deno.env.get('GMAIL_USER')!, password: Deno.env.get('GMAIL_APP_PASSWORD')! },
      },
    });

    await client.send({
      from: `TR Brazil Host <${Deno.env.get('GMAIL_USER')}>`,
      to: destinatario,
      subject: `${tituloRel} – ${imovel.nome_referencia} – ${periodoTexto}`,
      html,
      content: 'auto',
      attachments: [{
        filename: nomeArquivo,
        content: pdfBase64,
        encoding: 'base64',
        contentType: 'application/pdf',
      }],
    });
    await client.close();

    return json({ ok: true, destinatario });
  } catch (e) {
    return json({ erro: String(e?.message ?? e) }, 500);
  }
});
