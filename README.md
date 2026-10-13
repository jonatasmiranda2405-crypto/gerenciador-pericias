# PeríciaFlow

Gerenciador de perícias judiciais. O site é publicado pelo GitHub Pages a partir do `index.html`
(Firebase para login, banco e arquivos).

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | O PeríciaFlow publicado (app de uma página). |
| `novo/index.html` | **Prévia** com as telas novas (Importar processo, Publicações, Prazos e alertas, Tarefas, Agenda, Financeiro, Integrações). Mesmo login e mesmos dados do site. Gerada, não editar à mão. |
| `ferramentas/` | `telas-novas.js` (código das telas novas) e `montar-novo.py`, que gera a prévia a partir do `index.html`. |
| `extensao-projudi/` | Extensão do Chrome **PROJUDI PDFs** (v1.7): ZIP dos autos, envio ao PeríciaFlow, busca pelo código de acesso ou com o login do perito, assinatura pelo Mercado Pago. Arquitetura em `extensao-projudi/LEIA-ME-ARQUITETURA.md`. |
| `servidor-php/` | Peças para o PeríciaFlow em PHP/MySQL (`localhost:8080`): API de upload dos autos (criptografada, sem duplicados), tabela e receptor. Instalação em `servidor-php/LEIA-ME.md`. |
| `testes/` | Testes de ponta a ponta com Chromium, a extensão real e um PROJUDI simulado. |

## Como os autos chegam

```
Perícia (PeríciaFlow) → extensão → aba do PROJUDI (código de acesso ou login do perito)
→ PDFs um por um (o .p7s vira PDF) → perícia, com ID fixo do PROJUDI (nunca duplica)
```

O PeríciaFlow nunca pede nem guarda senha ou certificado do PROJUDI. O login é sempre feito
pelo perito, no site do tribunal. Por causa do Cloudflare do PROJUDI, a extensão preenche a busca
e quem clica em **Consultar** é o perito.

## Prévia das telas novas

Endereço: `…/gerenciador-pericias/novo/`. Para refazer depois de mudar o `index.html` ou as telas:

```bash
python3 ferramentas/montar-novo.py
```

Tarefas, compromissos e o valor depositado ficam dentro de cada perícia (mesmo documento do
Firestore), então não há coleção nova nem regra nova no Firebase. Quando a prévia for aprovada,
ela passa a ser o `index.html`.

## Testes

```bash
./testes/rodar.sh
```

Precisa de Node, PHP (pdo_sqlite e openssl), OpenSSL e Playwright com Chromium. O script
sobe o PROJUDI simulado (HTTPS local) e o PHP de teste (SQLite), e roda as quatro suítes:
o site (24), o mesmo fluxo na prévia (24), as telas novas (27) e o PHP com o Mercado Pago (13).

## Publicar uma nova versão da extensão

1. Suba `version` no `extensao-projudi/manifest.json`. A descrição tem no máximo 132 caracteres.
2. Rode `./testes/rodar.sh`.
3. Compacte o **conteúdo** de `extensao-projudi/` (sem a pasta por fora) e envie na Chrome Web Store.

Nunca suba `servidor-php/api/autos-config.php`: ele tem a senha do banco e a chave de criptografia
(já está no `.gitignore`).
