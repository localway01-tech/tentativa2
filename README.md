# Localway Rank — Deploy na Vercel

## Estrutura do Projeto

```
localway-rank/
├── api/
│   └── places.js       ← Serverless Function (proxy da Google Places API)
├── public/
│   └── index.html      ← SPA principal
├── vercel.json         ← Configuração de rotas e funções
└── README.md
```

## Variáveis de Ambiente Obrigatórias

Configure na Vercel em **Settings → Environment Variables**:

| Variável                  | Descrição                                      | Onde obter                                               |
|---------------------------|------------------------------------------------|----------------------------------------------------------|
| `GOOGLE_PLACES_API_KEY`   | Chave da Google Places API (Legacy)            | [Google Cloud Console](https://console.cloud.google.com) |

### Como criar a chave do Google Places

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie ou selecione um projeto
3. Ative as APIs: **Places API**, **Maps JavaScript API**
4. Em **Credenciais → Criar credenciais → Chave de API**
5. Restrinja a chave por **Referenciador HTTP** (coloque o domínio da Vercel) e por **API** (somente Places API)

## Deploy

### Opção 1 — Via Vercel CLI

```bash
npm i -g vercel
cd localway-rank
vercel --prod
```

### Opção 2 — Via GitHub (recomendado)

1. Suba este repositório para o GitHub
2. Acesse [vercel.com/new](https://vercel.com/new)
3. Importe o repositório
4. Em **Root Directory**, deixe vazio (raiz)
5. Adicione a variável `GOOGLE_PLACES_API_KEY` em **Environment Variables**
6. Clique em **Deploy**

## Rotas

| Rota             | O que faz                                      |
|------------------|------------------------------------------------|
| `GET /`          | Serve o SPA (`public/index.html`)             |
| `GET /api/places`| Proxy da Google Places API (sem expor a chave)|

### Parâmetros de `/api/places`

| `?action=`    | Parâmetros adicionais                                      |
|---------------|------------------------------------------------------------|
| `search`      | `&query=nome+cidade`                                       |
| `details`     | `&place_id=ChIJ...`                                        |
| `nearby`      | `&location=lat,lng&radius=1000&keyword=pet+shop`           |
| `photo`       | `&ref=PHOTO_REFERENCE&maxwidth=600`                        |
| `resolve_url` | `&url=https://maps.app.goo.gl/...`                        |

## O que foi alterado em relação ao projeto original

| Arquivo               | Mudança                                                                      |
|-----------------------|------------------------------------------------------------------------------|
| `public/index.html`   | Removido script de decodificação de email do Cloudflare (`/cdn-cgi/...`)    |
| `api/places.js`       | **Criado** — função serverless no formato Vercel (ES Modules `export default`)|
| `vercel.json`         | **Criado** — rewrites, headers de segurança e timeout de 30s nas funções    |

> **Nota:** O frontend chama `/api/places` sem nenhuma mudança — as URLs já estavam corretas no `index.html` original. Nenhuma linha de JS do SPA precisou ser editada.
