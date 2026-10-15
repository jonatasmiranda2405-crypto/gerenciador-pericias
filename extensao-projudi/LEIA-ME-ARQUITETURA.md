# PROJUDI PDFs v1.7.0 — autos direto no Gerenciador de Perícia

## O fluxo (seu desenho, na nossa realidade)

```
Gerenciador de Perícia (página da perícia)            Extensão                         PROJUDI · TJGO
 1. "Baixar autos do PROJUDI"  ─────────▶  periciaflow.js → background.js
    número + código + IDs que já tem        cria o pedido e abre uma aba ──▶ 2. aba em segundo plano
                                                                             3a. "Processo por Código" (sem login)
                                                                             3b. login do perito (certificado ou
                                                                                 CPF + senha), feito POR ELE na aba
                                             robo.js: preenche a busca, abre o processo
                                             page.js: abre as movimentações, lista os PDFs
                                             offscreen.js: baixa 1 arquivo  ◀── 4. servidor de arquivos (PDF / .p7s)
                                             tira o PDF do .p7s (p7s.js)
 5. grava 1 arquivo por vez  ◀────────────  entrega em partes de 4 MB e espera o "salvo"
    ID fixo pj_<Id_MovimentacaoArquivo>
 6. Firebase Storage + Firestore da conta (criptografados em repouso pelo Google)
```

O Gerenciador de Perícia é o "servidor do gerenciador": a gravação usa a sessão do perito no Firebase,
então não existe uma API de upload aberta na internet. Duplicados são impossíveis porque
o documento recebe sempre o mesmo ID, e a extensão nem baixa o que o site disse que já tem.

## Login no PROJUDI: regra de ouro

Nem o Gerenciador de Perícia nem a extensão pedem, leem ou guardam senha ou certificado.
Quando o pedido precisa de login, a aba do PROJUDI vem para a frente com uma faixa
explicando o que fazer. O perito entra como sempre: certificado digital A1/A3 ou CPF,
senha e o código que chega por e-mail. A extensão só usa a sessão que ele abriu.

## Arquivos novos e alterados (sobre a v1.3)

| Arquivo | O que faz |
|---|---|
| `periciaflow.js` (novo) | Ponte com o site (postMessage na própria origem). |
| `robo.js` (novo) | Um passo por página: busca por código, busca logada, clique no processo, pedido de ajuda. |
| `p7s.js` (novo) | Extrai o PDF de assinaturas CMS (DER e BER em pedaços). |
| `background.js` | Motor de pedidos (`storage.session`), abre/fecha abas, filtra o que já existe. |
| `offscreen.js` | Baixa com 3 tentativas, um arquivo por vez, entrega em partes com confirmação. |
| `page.js` | Lê ID de cada arquivo e a capa; botão "Enviar ao Gerenciador de Perícia"; inicia sozinho em abas de pedido. |
| `bridge.js` | Rotas `lista` e `tarefa`. |
| `config.js` | `PERICIAFLOW_URL`, `PROJUDI_URLS` e `ROBO_MAX_TENTATIVAS`. |
| `manifest.json` | v1.7.0, permissão para o endereço do Gerenciador de Perícia, novos content scripts. |

## Dois destinos

A mesma extensão entrega no Gerenciador de Perícia do GitHub (Firebase) e no Gerenciador de Perícia PHP em
`http://localhost:8080` (pasta `periciaflow-php`, com a API de upload). Ela atende a aba que
fez o pedido; quando o envio começa no PROJUDI, usa a aba do Gerenciador de Perícia que estiver aberta.
Endereços em `PERICIAFLOW_URLS` (config.js) e no manifest.json.

## Antes de publicar na Chrome Web Store

1. **Esta é a versão base daqui para a frente.** A v1.6 não existe mais; o pagamento foi
   reconstruído aqui: botões Mensal (R$ 15,99), Trimestral (R$ 45,00) e Anual (R$ 150,00) no
   painel, que pedem ao Apps Script `{acao:'checkout', email, plano}` e abrem o Mercado Pago.
   Confira se os ids `mensal`, `trimestral` e `anual` batem com `PLANOS` do Code.gs (versão 3).
   A extensão aceita o link em `url`, `link` ou `init_point` e só abre endereços do Mercado Pago.
   Os ícones daqui são provisórios: troque pelos da loja.
2. **Cloudflare:** o PROJUDI bloqueia o clique automático em "Buscar" (visto na v1.1). O robô
   preenche número e código com ritmo de digitação humano e pede ao perito o clique; também
   reconhece a página de verificação e pede que ele a resolva. Chave `ROBO_CLICA_BUSCAR` no `config.js`.
3. **Calibrar o robô com um processo real.** Os endereços vêm do próprio PROJUDI, mas os
   nomes dos campos da busca não puderam ser vistos daqui. O robô procura os campos pelo rótulo
   ("Número do Processo", "Código de Acesso"). Se não achar, ele pede ao perito para abrir
   o processo na aba, e o download continua sozinho. Ajustes ficam em `robo.js` e `config.js`.
4. Atualizar a política de privacidade: os arquivos agora também vão para a conta do
   próprio perito no Gerenciador de Perícia.

## Teste automatizado

O teste de ponta a ponta roda o Chromium com esta extensão, um PROJUDI simulado (login,
consulta por código, `.p7s`) e o `index.html` do repositório. Foram 24 verificações no site do GitHub e 13 no PHP (inclui Cloudflare, clique do
perito, criptografia e Mercado Pago), todas aprovadas: código de acesso, login, sem duplicados, só arquivos novos, envio iniciado no
PROJUDI, ZIP antigo e nenhum erro de JavaScript.
