# PeríciaFlow

Gerenciador de perícias judiciais. O site é publicado pelo GitHub Pages a partir do `index.html`
(Firebase para login, banco e arquivos).

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | O PeríciaFlow publicado (app de uma página): perícias, importação de processos, publicações, prazos e alertas, tarefas, agenda, financeiro, cálculos, proposta, documentos, Revisão IA, equipe e integrações, com barra lateral em grupos e paleta Ctrl K. **É a única fonte: edite aqui.** |
| `anterior/index.html` | O site como estava antes da troca de 13/10/2026, para voltar rápido se precisar (`…/gerenciador-pericias/anterior/`). |
| `novo/` | Endereço antigo da prévia; agora só redireciona para o site principal. |
| `ferramentas/` | Referência das partes acrescentadas na prévia (telas novas, barra lateral, paleta). O `montar-novo.py` está aposentado. |
| `extensao-projudi/` | Extensão do Chrome **PROJUDI PDFs** (v1.7): ZIP dos autos, envio ao PeríciaFlow, busca pelo código de acesso ou com o login do perito, assinatura pelo Mercado Pago. Arquitetura em `extensao-projudi/LEIA-ME-ARQUITETURA.md`. |
| `servidor-php/` | Peças para o PeríciaFlow em PHP/MySQL (`localhost:8080`): API de upload dos autos (criptografada, sem duplicados), tabela e receptor. Instalação em `servidor-php/LEIA-ME.md`. |
| `vendor/` | Bibliotecas carregadas sob demanda: jsPDF 2.5.1 (licença MIT em `vendor/jspdf-LICENSE.txt`), usada no PDF dos erros da Revisão IA. |
| `testes/` | Testes de ponta a ponta com Chromium, a extensão real e um PROJUDI simulado. |

## Como os autos chegam

```
Perícia (PeríciaFlow) → extensão → aba do PROJUDI (código de acesso ou login do perito)
→ PDFs um por um (o .p7s vira PDF) → perícia, com ID fixo do PROJUDI (nunca duplica)
```

O PeríciaFlow nunca pede nem guarda senha ou certificado do PROJUDI. O login é sempre feito
pelo perito, no site do tribunal. Por causa do Cloudflare do PROJUDI, a extensão preenche a busca
e quem clica em **Consultar** é o perito.

## Dados das telas novas

Tarefas, compromissos e o valor depositado ficam dentro de cada perícia (mesmo documento do
Firestore: `tarefas`, `compromissos`, `honorariosDepositados`), então não há coleção nova no Firebase.
Se as regras do Firestore limitarem os campos aceitos em `casos`, esses campos precisam ser liberados
(inclusive `analiseIA` e `iaRevisao`, da Revisão IA).

## Revisão IA

A tela lê os autos com o Gemini (chave do próprio perito) e devolve **achados**: erros e
inconsistências por categoria (Cálculo, Valores, Índices, Datas, Documentos, Prazos, Honorários),
cada um com gravidade e o lugar exato para conferir. Não sugere quesitos: o perito responde aos das partes.

- Cartões em carrossel por categoria; deslize, use as setas ou os botões.
- Cada achado recebe uma decisão (Confirmar erro, Não é erro, Ver depois), guardada em `iaRevisao`.
- **Baixar PDF dos erros**: relatório A4 com os erros confirmados e os pontos a conferir, quadrado
  para marcar, anotações e assinatura. Os descartados ficam de fora.
- Se a perícia mudar (documento novo), aparece o aviso; com a opção ligada, a revisão roda de novo sozinha
  depois de uma importação.

## Voltar para a versão anterior

Se algo der errado, copie `anterior/index.html` por cima do `index.html` e publique. O site
volta a ser o de antes; os dados não mudam.

## Testes

```bash
./testes/rodar.sh
```

Precisa de Node, PHP (pdo_sqlite e openssl), OpenSSL e Playwright com Chromium. O script
sobe o PROJUDI simulado (HTTPS local) e o PHP de teste (SQLite), e roda as três suítes:
o fluxo dos autos no site (24), as telas, a barra lateral, a paleta e a Revisão IA (46) e o PHP com o Mercado Pago (13).

## Publicar uma nova versão da extensão

1. Suba `version` no `extensao-projudi/manifest.json`. A descrição tem no máximo 132 caracteres.
2. Rode `./testes/rodar.sh`.
3. Compacte o **conteúdo** de `extensao-projudi/` (sem a pasta por fora) e envie na Chrome Web Store.

Nunca suba `servidor-php/api/autos-config.php`: ele tem a senha do banco e a chave de criptografia
(já está no `.gitignore`).
