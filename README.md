# TR Serviços de Reservas — estrutura do projeto

```
tr_reserva/
├── index.html              ← Login (ponto de entrada, fora de /app)
├── README.md
├── app/                     ← Telas autenticadas (uma por módulo do PRD)
│   ├── dashboard.html
│   ├── reservas.html        (a criar — Etapa 4)
│   ├── imoveis.html         (a criar — Etapa 3)
│   ├── proprietarios.html   (a criar — Etapa 3)
│   ├── reservas.html        ← pronto (Etapa 4)
│   ├── imoveis.html         ← pronto (Etapa 3)
│   ├── proprietarios.html   ← pronto (Etapa 3)
│   ├── financeiro.html      ← pronto (Etapa 5)
│   ├── fechamento.html      ← pronto (Etapa 6)
│   ├── relatorios.html      ← pronto (Etapa 7)
│   └── parametros.html      ← pronto (Etapa 2, só perfil Gestor)
└── assets/
    ├── css/
    │   └── theme.css         ← paleta e estilos compartilhados
    ├── js/
    │   ├── supabaseClient.js ← cliente único do Supabase (URL + anon key)
    │   ├── auth-guard.js     ← protege páginas de /app, perfil e logout
    │   ├── sidebar.js        ← menu lateral retrátil (off-canvas) em mobile
    │   ├── modal.js          ← modais próprios (alerta/confirmação/formulário) —
    │   │                        nunca usar alert()/confirm() nativos no projeto
    │   └── calculo.js        ← motor de cálculo (comissão, limpeza,
    │                            competência proporcional, distribuição
    │                            de lucro) — funções puras, sem UI
    └── img/
        └── logo.png           ← colocar aqui a logo em alta resolução
```

## Padrões do projeto (a partir de agora)

- **Nunca usar `alert()`/`confirm()` nativos.** Sempre importar de
  `assets/js/modal.js`: `mostrarAlerta(mensagem, { titulo })` e
  `confirmarAcao(mensagem, { titulo, textoConfirmar, perigo })` — ambos
  retornam uma Promise, então sempre chamados com `await` dentro de uma
  função `async`.
- **Listas que podem crescer (Proprietários, Imóveis) usam edição em
  modal**, não painel inline na mesma página. O conteúdo do formulário
  fica num `<template>` no fim do `<body>`, clonado a cada abertura via
  `abrirModal({ titulo, corpoEl, largura })`. Parâmetros continua
  inline por enquanto — a lista ali é curta e não deve crescer muito.
- **Embeds do Supabase com FK ambígua:** sempre que uma tabela tiver
  mais de um caminho possível até outra (ex.: `imoveis` → `proprietarios`
  direto, e também via `imovel_coproprietarios`), apontar a FK
  explicitamente na query: `proprietarios!proprietario_id(nome)`.

## Imóveis e Proprietários (Etapa 3)

- `proprietarios.html`: dados cadastrais + contas bancárias (um
  proprietário pode ter várias contas, uma marcada como padrão). O
  bloco de contas bancárias só aparece para Gestor/Administrador — para
  Operador, a tabela `contas_bancarias` nem retorna linhas (RLS).
- `imoveis.html`: editor em abas — **Detalhes** (dados gerais +
  coproprietários), **Inventário**, **Acesso** (Gestor/Administrador) e
  **Regras específicas** (só Gestor). Um único botão "Salvar
  alterações" grava Detalhes + Inventário + Acesso de uma vez (são só
  colunas da mesma linha em `imoveis`); trocar de aba nunca descarta o
  que foi digitado, porque as abas só ficam escondidas via CSS — o
  conteúdo continua montado no DOM. "Regras" é a exceção: cada
  regra é salva no instante em que é adicionada (é outra tabela,
  `imovel_parametros`, sem "rascunho" por natureza), por isso só fica
  disponível depois que o imóvel já tem um `id` (ou seja, depois do
  primeiro "Salvar alterações" num imóvel novo).
- **Coproprietários:** sim, um imóvel pode ter mais de um proprietário.
  O principal fica em `imoveis.proprietario_id`; os demais entram na
  aba Detalhes, seção "Coproprietários", que grava em
  `imovel_coproprietarios` (tabela de junção já criada na Etapa 1).
- No mobile, o editor de imóvel ocupa a tela toda (não é mais uma
  caixa centralizada) e as abas viram uma barra horizontal rolável no
  topo em vez de um menu lateral — ver `abrirModal(..., { cheio: true })`
  em `modal.js`. O modal "cheio" usa altura fixa (`h-full` no mobile,
  `h-[85vh]` a partir de `sm`) em vez de altura automática com limite —
  com várias camadas de flexbox aninhadas, "altura automática com
  limite" só fica definida quando o conteúdo excede o limite, o que é
  frágil; altura fixa garante que a rolagem interna de cada aba (ex.:
  Inventário, com muitos itens) sempre funcione.
- O inventário é salvo como um único campo `jsonb`; a lista de itens
  (quartos, TV, ar-condicionado etc.) está no array `ITENS_INVENTARIO`
  no topo do `<script>` de `imoveis.html` — adicionar um item novo é só
  acrescentar uma linha ali.

## Testando o motor de cálculo (`calculo.js`)

Abra qualquer página de `/app` com `?testCalculo=1` na URL (ex.:
`dashboard.html?testCalculo=1`) e olhe o console do navegador: ele roda
o exemplo da seção 6.3 do PRD (reserva de 28/01 a 03/02) e confere se
os valores batem.

## Por que essa divisão

- **`index.html` na raiz, fora de `/app`:** é a única página que um
  visitante não autenticado deve conseguir abrir. Nenhuma página dentro
  de `/app` carrega sem sessão válida.
- **Cada módulo do PRD = um arquivo HTML em `/app`:** sem bundler/build,
  isso mantém cada tela simples de abrir, editar e testar isoladamente.
  O menu lateral (em `dashboard.html`, repetido nas demais) é o que dá a
  sensação de app único.
- **`auth-guard.js` no topo de toda página de `/app`:** redireciona para
  o login se não houver sessão, busca o perfil do usuário e esconde no
  menu os links que esse perfil não deveria ver (`data-perfil="gestor"`
  em Parâmetros, por exemplo).
- **A segurança de verdade é o RLS do `schema.sql`, não esses arquivos.**
  Esconder um link no menu é só UX — se alguém digitar a URL de
  `parametros.html` sem ser Gestor, o Supabase já recusa a consulta no
  banco por causa das políticas de RLS.

## Como rodar localmente

Como os módulos JS usam `type="module"` e `import`, abrir o
`index.html` direto como arquivo (`file://`) trava por CORS. Rode um
servidor local simples a partir da pasta `tr_reserva`:

```
python3 -m http.server 5500
```

e acesse `http://localhost:5500`.

## Reservas (Etapa 4)

- `reservas.html`: lançamento com cálculo em tempo real (comissão,
  repasse) usando o motor de `calculo.js`, respeitando a hierarquia
  exceção do imóvel → parâmetro geral, e campo de ajuste manual com
  justificativa obrigatória (RF14).
- **Overbooking:** a constraint `sem_overbooking` do `schema.sql` já
  recusa no banco qualquer sobreposição de datas no mesmo imóvel; a
  tela captura o erro (código Postgres `23P01`) e mostra uma mensagem
  amigável em vez do erro técnico.
- **Competência proporcional:** quando a reserva atravessa virada de
  mês, a prévia já mostra a divisão por mês antes de salvar, e ao
  salvar grava as linhas correspondentes em `reserva_competencias`.
- **Bug encontrado e corrigido durante o teste desta etapa:** o
  repasse mensal em `dividirCompetencia()` (`calculo.js`) estava
  descontando a limpeza duas vezes (uma vez por já estar fora do
  valor de diárias, outra por ser subtraída de novo no cálculo do
  repasse). Testado com Node contra o exemplo da seção 6.3 do PRD
  antes de liberar — Jan R$960 + Fev R$480 = R$1.440, batendo com o
  valor da reserva inteira.
- **Reservas diretas:** seção própria, mais simples (sem cálculo de
  comissão), com sinal/saldo e status.
- Não incluído ainda: edição de reservas já lançadas (só criar e
  excluir por enquanto) e autocomplete de hóspedes recorrentes.

## Identidade visual

- `assets/img/logo.svg`: logo oficial da TR (T verde + R branco sobre
  fundo azul), já na paleta do projeto. Declarada como favicon
  (`<link rel="icon">`) em todas as páginas. O "TR" desenhado em
  HTML/CSS no topo do menu lateral (`tr-logo-ring`) continua como
  está por enquanto — dá pra trocar pelo SVG também, se preferir.

## Financeiro (Etapa 5)

- `financeiro.html`: restrito a Gestor/Administrador (igual já reforça
  a RLS de `repasses` no banco). Quatro blocos:
- **Manutenções:** ao marcar "cobrar do proprietário", a manutenção
  fica pendente de desconto (`repasse_id` nulo) até entrar no próximo
  repasse gerado daquele imóvel — é a dedução automática do RF14.
- **Despesas da TR:** `ratearDespesa()` (novo em `calculo.js`) distribui
  o valor em parcelas mensais a partir do mês da compra, testado com
  Node contra o exemplo real da planilha (Toalhas R$1.752,80 em 10×
  = R$175,28 cada, sobrando o ajuste de centavos na última parcela).
- **Pagamentos de pessoal:** registro simples (funcionário, data,
  valor, imóveis atendidos, recibo).
- **Repasses:** sem botão — enquanto o repasse do mês está "pendente",
  a tela recalcula sozinha (ao abrir a página, trocar o mês, ou
  lançar/concluir/excluir uma manutenção), somando por imóvel as
  reservas que tocam o mês — usando o valor já dividido em
  `reserva_competencias` quando a reserva atravessa virada de mês, e o
  valor cheio da reserva quando não atravessa — e descontando as
  manutenções pendentes daquele imóvel. Isso reproduz o comportamento
  da planilha (tudo por fórmula, sempre atual). Só ao marcar "Pago" o
  valor fica congelado: dali em diante, nenhum recálculo automático
  toca mais naquele repasse. Testado isoladamente (reserva comum +
  reserva que atravessa mês, verificando que só a parte proporcional
  de fevereiro entra na soma).
- Não incluído ainda: tela de edição de manutenções/despesas já
  lançadas (só adicionar e excluir por enquanto).

## Fechamento Mensal (Etapa 6)

- `fechamento.html`: restrito a Gestor/Administrador. Mostra, por mês:
  Entrada TR (comissões, já respeitando a divisão de competência),
  Despesas, Lucro bruto, Lucro líquido e a distribuição entre os
  participantes cadastrados em Parâmetros.
- **Mês aberto** (sem fechamento gravado, ou reaberto): tudo calculado
  **ao vivo** toda vez que a página é aberta — mesma filosofia do
  Repasses da Etapa 5, e também o comportamento da planilha hoje (tudo
  por fórmula). `calcularFechamentoMensal()` (novo em `calculo.js`) faz
  essa conta; testado isoladamente com um Supabase simulado (reserva
  comum + reserva que atravessa mês + despesa parcelada + manutenção
  TR + manutenção do proprietário, confirmando que só a manutenção da
  TR entra nas despesas).
- **Botão "Fechar mês":** grava um retrato definitivo em
  `fechamentos_mensais` (`bloqueado = true`). A partir daí a tela
  mostra os valores congelados daquele momento, não mais ao vivo.
  Existe também "Reabrir mês" (`bloqueado = false`), para quem quiser
  voltar ao modo ao vivo manualmente.
- **Lançamento retroativo num mês já fechado — maleável, como você
  pediu:** ao salvar/excluir uma reserva (`reservas.html`), uma despesa
  ou uma manutenção **paga pela própria TR** (`financeiro.html`), se a
  data cair num mês fechado, aparece um aviso explicando que isso vai
  alterar o fechamento e pedindo confirmação. Se confirmado, o
  lançamento é salvo normalmente e o fechamento daquele mês é
  recalculado na hora — continua "fechado", só que com os números
  corrigidos; ninguém precisa reabrir manualmente. Testado
  isoladamente (mês fechado pede confirmação; mês aberto não pede
  nada). Manutenção **cobrada do proprietário** não dispara esse
  aviso, porque não entra no fechamento — ela afeta o repasse do
  imóvel, não a Entrada TR/Despesas da empresa.

## Edição (adicionado após a Etapa 6)

Cinco pontos que só tinham "adicionar e excluir" ganharam edição:

- **Reservas** (`reservas.html`): botão "Editar" reabre o mesmo modal de
  lançamento, já preenchido, com a prévia de cálculo recalculando
  conforme você altera os campos. Ao salvar, a divisão de competência
  antiga é apagada e recriada do zero (os valores podem ter mudado). O
  aviso de "mês fechado" considera as datas antigas **e** as novas —
  editar uma reserva que saiu de um mês fechado para outro avisa sobre
  os dois.
- **Despesas, Manutenções e Pagamentos de pessoal** (`financeiro.html`):
  edição inline no mesmo formulário de cada seção — o botão "Adicionar"
  vira "Salvar alterações" e aparece um "Cancelar" para sair do modo
  edição sem salvar. Em Despesas, editar refaz as parcelas do zero
  (`despesa_parcelas`); em Manutenções, o aviso de mês fechado olha
  tanto o estado antigo quanto o novo do campo "cobrado do
  proprietário", já que isso muda se a manutenção entra ou não no
  fechamento.
- **Contas bancárias** (`proprietarios.html`): mesmo padrão inline
  dentro do modal do proprietário — edita favorecido, tipo e dados
  bancários de uma conta já cadastrada (tornar padrão e remover já
  existiam).

Todos os cinco foram conferidos (sintaxe + IDs) antes de entregar.

## Relatórios PDF (Etapa 7)

- `relatorios.html`: restrito a Gestor/Administrador. Gera PDF mensal
  ou anual, por imóvel, usando `jspdf` + `jspdf-autotable` (carregados
  via CDN — jsdelivr `+esm`, mesmo padrão já usado para o Supabase).
  Cabeçalho oficial (nome da empresa, imóvel, proprietário, período),
  indicadores consolidados (nº de reservas, diárias, bruto, média de
  diária, limpeza, comissão, deduções, líquido repassado — e taxa de
  ocupação no mensal), tabela detalhada por reserva, tabela de
  deduções (manutenções cobradas do proprietário) e campo de
  observações livre.
- **Decisão importante de design, documentada para não confundir no
  futuro:** este relatório agrupa as reservas pelo **mês de check-in**
  (como um extrato tradicional — a reserva aparece inteira no mês em
  que começou). Isso é **diferente** do Fechamento Mensal (Etapa 6),
  que usa a divisão de competência por noite para a contabilidade da
  empresa. Para uma reserva que atravessa virada de mês, os dois
  relatórios vão mostrar números diferentes para aquele mês — é
  esperado, não é bug. A taxa de ocupação é a exceção: ela conta as
  noites realmente ocupadas dentro do mês (overlap), não por check-in,
  porque fisicamente o imóvel está ocupado nesses dias independente de
  quando a reserva começou.
- Testei isoladamente com Node a matemática de limites de mês (inclusive
  virada de ano, dezembro→janeiro), contagem de noites e o recorte de
  noites ocupadas dentro do mês, antes de usar na tela.
- **Refatoração de passagem:** a lógica de gerar/atualizar um repasse
  (que já existia em `financeiro.html`) foi movida para `calculo.js`
  (`calcularBrutoPorImovelNoMes`, `gerarRepasseImovel`,
  `sincronizarRepassesDoMes`) — `financeiro.html` agora importa em vez
  de duplicar, e fica pronta para o Dashboard (Etapa 8) reaproveitar
  também.

## Lançamentos de teste com dados reais (planilha atualizada)

Em `testes/lancamentos_teste_planilha_2026.sql` (fora da pasta do app,
na raiz do projeto) — 15 lançamentos reais extraídos da aba "2026" da
planilha atual, prontos para rodar no SQL Editor do Supabase: 10
reservas simples + 4 que atravessam virada de mês (já com a divisão de
competência calculada e conferida) + 1 reserva direta. Cria também os
8 proprietários, contas bancárias e 8 imóveis necessários (idempotente
— pode rodar mais de uma vez sem duplicar).

**Bug encontrado e corrigido a partir desse teste:** `dividirCompetencia()`
calculava o repasse mensal (`valorProprietarioMes`) **antes** do ajuste
de centavos corrigir a comissão — então, quando a correção de
arredondamento caía no mês errado, o repasse ficava com o valor
desatualizado (1 centavo de diferença). Corrigido invertendo a ordem:
ajuste de centavos primeiro, repasse por mês depois. Validado com 2.000
casos aleatórios (zero falhas) e uma nova trava de regressão no bloco
`?testCalculo=1`.

## Achados analisando a planilha atual (pontos de regra a decidir)

1. **A comissão diferenciada do RV (10%) não aparece mais em 2026** —
   todos os imóveis testados, incluindo "Rv Conceito" e "Rv conceito 2",
   usam 20% flat. Se vocês realmente padronizaram para 20% em todo
   lugar, não precisa de nenhuma exceção cadastrada em Parâmetros. Vale
   confirmar se isso é intencional.
2. **O canal de venda (Airbnb/Booking) sumiu da planilha.** A coluna que
   antes indicava a plataforma agora só tem "TR"/"Tiê" (parece indicar
   a conta de depósito, não o canal). Isso conflita com `reservas.html`,
   que hoje **exige** um canal ao lançar. Precisamos decidir: o canal
   deixou de ser controlado e o campo deveria virar opcional, ou a Tiê
   ainda sabe informar isso na hora do lançamento mesmo não estando mais
   na planilha?
3. **O portfólio de imóveis cresceu bastante** — de ~12 para 19 imóveis
   distintos. Nomes como "Rv Conceito"/"Rv conceito 2" e
   "Celimar"/"Celimar 2"/"Celimar 3" reforçam a importância de
   padronizar nomes antes da migração (Etapa 9). Ponto positivo: os
   códigos de imóvel estão todos únicos agora (não achei mais
   duplicidade como o antigo código 7 repetido).
4. **Confirmado com dado real:** um proprietário pode ter mais de uma
   conta bancária (Marlene tem PIX e Santander, para dois imóveis
   diferentes) — exatamente o que já construímos em Proprietários.
5. **Taxa de limpeza por imóvel confirmada:** a maioria usa R$140, mas
   Barra Ladeira/Barra III/Celimar/Celimar 2/Celimar 3 usam R$180 —
   isso já é só o valor digitado por reserva (não precisa de parâmetro
   algum), confirma que o desenho atual está certo.
6. **Aba nova "ESTOQUE"** (Data da Compra, Item, Quantidade, Quantidade
   Atual, Valor unitário) — não existe no PRD. Parece controle de
   itens de reposição (ex.: lençóis, produtos de limpeza). Vale
   perguntar se isso deve entrar no escopo do sistema ou fica de fora.
7. A aba "PAGAMENTOS" (nova) generalizou "PAGAMENTOS PESSOAL" (antes só
   Iris) para qualquer pessoa — confirma que nosso `pagamentos_pessoal`
   já está modelado certo, nenhuma mudança necessária.

## Financeiro em abas, Estoque e Log de atividades (ajustes pós-Etapa 7)

- **Canal de venda:** `reservas.html` agora marca "TR" como padrão no
  select (a planilha não registra mais o canal por reserva — ver
  achados da seção anterior). Continua editável.
- **Estoque entrou no escopo:** nova tabela `estoque` (data da compra,
  item, quantidade comprada, quantidade atual, valor unitário) e uma
  aba própria dentro de Financeiro, com o mesmo padrão de
  criar/editar/excluir das outras seções.
- **`financeiro.html` virou um editor em abas**, igual ao padrão do
  editor de Imóveis (Etapa 3) — só que direto na tela, sem modal: menu
  lateral no desktop, barra horizontal no mobile. Abas: Repasses,
  Manutenções, Despesas, Pessoal, Estoque e Logs. Nenhuma lógica de
  cálculo mudou, só a organização visual.
- **Log de atividades:** nova tabela `logs_atividade` e um módulo
  compartilhado (`assets/js/log.js`, função `registrarLog()`) chamado
  depois de toda ação de criar, editar ou excluir — em Reservas,
  Imóveis (dados gerais, regras específicas, coproprietários),
  Proprietários (cadastro e contas bancárias), Financeiro (todas as
  seções, incluindo marcar repasse como pago), Parâmetros (regras
  gerais e participantes de lucro) e Fechamento (fechar/reabrir mês).
  A aba **Logs** dentro de Financeiro mostra os últimos 200 registros:
  quando, quem, ação, tabela e uma descrição legível. Só Gestor/
  Administrador podem ler esse histórico; qualquer perfil autenticado
  pode gravar a própria ação.
- **Migração necessária no banco já existente:** como o Supabase de
  vocês já está rodando, rodem
  `testes/migracao_estoque_e_logs.sql` **uma vez** no SQL Editor —
  cria as tabelas novas e corrige uma política de RLS (a leitura de
  `usuarios` só deixava o Gestor ver o nome de outras pessoas; sem
  isso, um Administrador veria "—" no lugar do nome de quem fez cada
  ação nos Logs, exceto a própria). `schema.sql` já está atualizado
  para refletir isso num banco novo do zero.

## Correção: imóveis duplicados ao trocar para TR0XX

Rodar o SQL de teste de novo com os códigos já no formato `TR0XX` criou
imóveis **duplicados** — o `ON CONFLICT (codigo_interno)` não reconhece
"Barra I (2)" e "Barra I (TR002)" como o mesmo imóvel, porque o código
mudou. Rode `testes/corrigir_imoveis_duplicados.sql` uma vez: ele funde
cada par pelo nome igual, move reservas/manutenções/etc. do antigo pro
novo, e apaga o duplicado. Pode rodar mais de uma vez sem problema.

## Código padronizado dos imóveis (TR0XX) e revisão visual

- **Código interno dos imóveis:** convenção agora é `TR` + 3 dígitos
  (ex.: `TR013`). O SQL de teste já foi atualizado para esse padrão. Ao
  cadastrar um imóvel novo em `imoveis.html`, se você digitar só
  números no campo "Código interno" e sair do campo, ele formata
  sozinho (`13` → `TR013`).
- **Revisão visual** (menos "quadrado"): `theme.css` ganhou sombra e
  leve elevação ao passar o mouse nos cartões (`tr-card`, substitui o
  `bg-white rounded-xl border border-slate-200` repetido em toda tela),
  fundo do menu lateral com gradiente sutil em vez de cor chapada,
  botões com sombra e leve "levantada" ao passar o mouse, campos de
  texto com anel de foco mais suave, e **ícones em cada item do menu
  lateral** (Dashboard, Reservas, Imóveis, etc.) em todas as páginas.
  Nenhuma lógica mudou, só a casca visual.

## Relatórios: pré-visualização e envio por e-mail

Você mesmo já tinha avançado bastante nisso enquanto eu estava em outra
tarefa — continuei de onde parou:

- **Pré-visualização em modal** antes de baixar: o botão virou
  "Visualizar Relatório", abre o PDF num iframe dentro de um modal,
  com opções de Baixar, Imprimir e **Enviar por e-mail**.
- **Cabeçalho do PDF redesenhado** por você: logo com geometria
  paramétrica, CNPJ, endereço completo com quebra automática,
  telefone/e-mail — e um **rodapé novo** com "Emitido em.../Página X de
  Y" em todas as páginas.
- **Carregamento do jsPDF mudou de ESM para `<script>` global**
  (`window.jspdf`) — provavelmente por isso mesmo: eu tinha avisado que
  não conseguiria testar o carregamento via `+esm` num navegador real,
  e essa troca sugere que não carregou direito. Deixei assim, é mais
  robusto para essas duas bibliotecas.
- **O que eu completei agora:** o botão "Enviar por e-mail" ainda não
  tinha um `addEventListener` (por isso não fazia nada), e as duas
  chamadas de `abrirPreview()` não passavam o terceiro argumento
  (`imovelId`, `tipo`, `periodoTexto`) que o envio por e-mail precisa.
  Adicionei os dois.
- **Edge Function** (`supabase/functions/enviar-relatorio/index.ts`,
  código seu): busca o e-mail do proprietário **no banco** (nunca
  confia no que o front manda), valida a sessão do usuário via RLS, e
  envia o PDF em anexo usando Gmail SMTP (`denomailer`).

### Como publicar a Edge Function

Isso precisa da CLI do Supabase (não dá para criar uma Edge Function só
pelo SQL Editor):

```bash
supabase login
supabase link --project-ref <seu-project-ref>
supabase functions deploy enviar-relatorio
```

E configurar os segredos (uma vez só):

```bash
supabase secrets set GMAIL_USER=trbrazilhost@gmail.com
supabase secrets set GMAIL_APP_PASSWORD=<senha-de-app-do-gmail>
```

**Atenção:** `GMAIL_APP_PASSWORD` precisa ser uma ["senha de app" do
Google](https://myaccount.google.com/apppasswords) — só existe com a
verificação em duas etapas ativada na conta, e é diferente da senha
normal do Gmail. `SUPABASE_URL` e `SUPABASE_ANON_KEY` não precisam ser
configurados manualmente — toda Edge Function já recebe os dois
automaticamente.

**Pré-requisito nos dados:** o proprietário precisa ter e-mail
cadastrado (`proprietarios.html` já tem esse campo) — sem isso, a
função retorna erro "Proprietário sem e-mail cadastrado" em vez de
enviar.

## Ícones de ação e modais de visualização

- **`assets/js/icones.js`** (novo): `btnVisualizar`, `btnEditar`,
  `btnExcluir` e `celulaAcoes` — os antigos links de texto "Editar" /
  "Excluir" / "Remover" viraram botões com ícone (olho, lápis, lixeira)
  em toda lista do app. "Encerrar" e "tornar padrão" continuam como
  texto — não são edição/exclusão, então não entraram no escopo.
- **`exibirDetalhes()`** (novo em `modal.js`): modal de "ficha"
  somente-leitura genérico, usado pelo botão de olho em Reservas
  (incluindo reservas diretas), Manutenções, Despesas, Pagamentos de
  Pessoal e Estoque — sem nenhum campo editável.
- **Proprietários e Imóveis** são mais ricos (o editor já é um
  modal/painel inteiro, não uma ficha simples), então ali o botão
  "Visualizar" reabre o **mesmo** editor de sempre, só que travado:
  todos os campos desabilitados, botão de salvar escondido, e — no
  caso de Imóveis — os formulários de adicionar regra/coproprietário e
  os botões de Encerrar/Excluir/Remover dentro dessas duas listas
  também ficam ocultos. Zero risco de alterar algo por engano.
- **Parâmetros não ganhou modal de visualização** — a tabela ali já
  mostra tudo (tipo, valor, base, vigência) na própria linha, então um
  modal só repetiria a mesma informação sem ganho nenhum.

## Próximos passos (Etapa 8)

- Dashboard: indicadores de bruto/líquido/repasse por mês e por
  imóvel, ranking de imóveis e hóspedes, totais de limpeza e despesas,
  com filtros por período e por imóvel.

## Pendências técnicas (não urgentes)

- `dados_acesso` em `imoveis` hoje é só uma coluna comum — a tela
  esconde a aba "Acesso" de quem não é Gestor/Administrador, mas o RLS
  atual não impede uma chamada direta à API de ler essa coluna. Vale
  revisar com uma política de RLS mais fina (ou uma view separada)
  quando formos reforçar segurança.
