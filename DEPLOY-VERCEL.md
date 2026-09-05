# Deploy na Vercel

## Como o projeto roda na Vercel

O que antes era um único processo Express (`server.ts`) virou duas peças:

| Peça | Onde vive | O que serve |
| --- | --- | --- |
| SPA React | `dist/`, arquivos estáticos na CDN | `/` e demais rotas do painel |
| API Express | `api/index.ts`, uma função serverless | `/api/*` e `/r/*` |

O `vercel.json` reescreve `/api/*` e `/r/*` para a função e manda o resto para
`index.html`. As reescritas rodam **depois** da checagem de arquivos, então
`/assets/*` continua vindo da CDN.

O app Express em si (`server/app.ts`) é o mesmo nos dois ambientes:
`server.ts` o usa localmente atrás do Vite, `api/index.ts` o usa na Vercel.

## Persistência

O filesystem da Vercel é somente leitura (fora `/tmp`, que é efêmero e por
instância), então `data/db.json` e `data/reports/*.html` não funcionam mais.
O servidor agora usa o **mesmo Firestore que o front-end**, via `firebase-admin`:

| Coleção | Conteúdo | Acesso do cliente |
| --- | --- | --- |
| `reports` | metadados + HTML inline (< 700 KB) | pelas regras existentes |
| `reportContents/{id}/chunks/*` | HTML de relatórios grandes, fatiado | negado |
| `serverUsers` | contas do servidor, com hash e salt de senha | negado |
| `serverSessions` | tokens de sessão ativos | negado |

As três coleções novas têm `allow read, write: if false` em `firestore.rules`.
O Admin SDK ignora as regras, então só o servidor as enxerga.

Um documento do Firestore é limitado a 1 MiB. Relatórios até 700 KB continuam
gravados inline em `reports/{id}.htmlContent`, exatamente como o cliente já faz,
e por isso o painel segue funcionando sem alteração. Acima disso o HTML vai só
para `reportContents` em pedaços de 900 KB, e o campo inline fica vazio com
`htmlContentOffloaded: true`.

## Variáveis de ambiente

No painel da Vercel, em Settings → Environment Variables. Todas em Production,
Preview e Development.

**Front-end** (embutidas no bundle durante o build):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_ID
```

Elas são **obrigatórias**: `firebase-applet-config.json` é injetado pelo AI Studio
e está no `.gitignore`, então não existe na Vercel. O build cai em
`firebase-applet-config.default.json`, que só tem strings vazias.

**Servidor** — uma das duas opções. Em ambientes Google (Cloud Run, AI Studio)
nada disso é necessário: o Admin SDK usa as credenciais padrão da aplicação
(ADC) da própria identidade de execução. A Vercel não tem ADC, então lá as
variáveis são obrigatórias.

```
FIREBASE_SERVICE_ACCOUNT     # JSON completo do service account, cru ou em base64
```

ou os três campos separados, mais fáceis de colar no painel:

```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY         # aceita \n literais no lugar de quebras de linha
```

E mais:

```
FIREBASE_DATABASE_ID         # mesmo valor de VITE_FIREBASE_DATABASE_ID
```

Para gerar o service account: console do Firebase → Configurações do projeto →
Contas de serviço → Gerar nova chave privada. Ele dá acesso total ao projeto —
guarde só na Vercel, nunca no repositório.

Se preferir uma variável só e sem dor de cabeça com quebras de linha:

```sh
base64 -i caminho/para/service-account.json | pbcopy
```

e cole em `FIREBASE_SERVICE_ACCOUNT`.

## Domínio autorizado no Firebase Auth

O login com Google Workspace usa `signInWithPopup`, que só funciona em domínios
autorizados. Adicione o domínio da Vercel em Firebase Console → Authentication →
Settings → Authorized domains:

- `seu-projeto.vercel.app`
- o domínio customizado, se houver

Os domínios de preview (`*-git-branch-org.vercel.app`) mudam a cada branch e
teriam de ser adicionados um a um — o login pelo Google não funciona neles
enquanto isso não for feito.

## Deploy

```sh
npm install
npx vercel          # preview
npx vercel --prod   # produção
```

Ou conecte o repositório na Vercel; o `vercel.json` já traz build, output e
install command.

Depois de subir, publique as regras atualizadas do Firestore:

```sh
firebase deploy --only firestore:rules
```

## Limites a considerar

**Corpo da requisição: 4,5 MB.** É um teto da plataforma para funções
serverless, abaixo do `limit: '50mb'` do Express. Um upload maior que isso
recebe 413 antes mesmo de chegar ao código. Na prática o front-end já grava no
Firestore direto do navegador, onde o teto de 1 MiB por documento é ainda menor.

**Cold start.** A primeira requisição depois de um período ocioso inicializa o
Admin SDK e abre a conexão com o Firestore. O handle do Firestore fica em cache
no escopo do módulo, então invocações seguintes na mesma instância reaproveitam.

**`/api/reports/sync-bulk` virou no-op.** Ele existia para reidratar o
armazenamento efêmero em disco. Agora servidor e cliente compartilham a mesma
coleção `reports`, e reescrever esses documentos ecoaria de volta no
`onSnapshot` do cliente, num laço infinito. A rota continua respondendo 200 para
não quebrar clientes antigos, mas não grava nada.

**Conta de demonstração.** `guilherme@nextfit.com.br` / `password123` não é mais
criada automaticamente — a senha é pública e ia parar no Firestore de produção.
Para recriá-la em um ambiente de teste, defina `SEED_DEFAULT_USER=true` (e
opcionalmente `SEED_DEFAULT_USER_PASSWORD`). Sem nenhuma conta cadastrada,
`POST /api/reports` de visitante responde 401 em vez de atribuir o relatório ao
primeiro usuário da base.

## Desenvolvimento local

```sh
cp .env.example .env    # preencha os valores
npm run dev             # Express + Vite em http://localhost:3000
```

`server.ts` carrega o `.env` via `dotenv`. Sem as credenciais do Admin,
`/api/health` e o SPA sobem normalmente, mas qualquer rota que toque no
Firestore responde 500 com a mensagem explicando o que falta.

## Google AI Studio e outras hospedagens de processo único

O caminho antigo continua intacto e é o padrão:

```sh
npm run build           # vite build + bundle CJS do servidor em dist/server.cjs
NODE_ENV=production npm start
```

`npm run build` segue gerando SPA **e** servidor, que é a convenção que o Cloud
Run do AI Studio usa. A Vercel não precisa do bundle do servidor — lá o Express
vira função serverless — então ela usa `npm run build:web`, apontado no
`vercel.json`.

O que muda para o applet do AI Studio:

- **Credenciais**: nenhuma configuração nova. Sem `FIREBASE_SERVICE_ACCOUNT`, o
  Admin SDK cai em ADC e usa a service account do próprio Cloud Run. Ela precisa
  ter acesso ao Firestore do projeto — é o único ponto a confirmar no primeiro
  deploy.
- **`firebase-applet-config.json`**: continua tendo prioridade quando o AI Studio
  o injeta. O `firebase-applet-config.default.json` só entra em cena quando o
  arquivo não existe.
- **Armazenamento**: os relatórios não vão mais para o disco do container. Isso
  é um ganho também aqui, já que o disco do Cloud Run é efêmero — era justamente
  por isso que existia a reidratação via `sync-bulk`. Agora o dado nasce
  persistente.
