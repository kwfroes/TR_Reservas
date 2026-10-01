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
│   ├── financeiro.html      (a criar — Etapa 5)
│   ├── relatorios.html      (a criar — Etapa 7)
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

## Próximos passos (Etapa 5)

- Criar `app/financeiro.html`: manutenções com dedução automática no
  repasse, despesas da TR com rateio de parcelas, pagamentos de
  pessoal e a tela de repasses por proprietário/mês.
- Pendência técnica (não urgente): `dados_acesso` em `imoveis` hoje é
  só uma coluna comum — a tela esconde a aba "Acesso" de quem não é
  Gestor/Administrador, mas o RLS atual não impede uma chamada direta
  à API de ler essa coluna. Vale revisar com uma política de RLS mais
  fina (ou uma view separada) quando formos reforçar segurança.
