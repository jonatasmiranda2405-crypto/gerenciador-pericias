# Gerenciador de Perícia

Gerenciador de perícias judiciais. O site é publicado pelo GitHub Pages a partir do `index.html`
(Firebase para login, banco e arquivos).

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | O Gerenciador de Perícia publicado (app de uma página): perícias, importação de processos, publicações, prazos e alertas, tarefas, agenda, financeiro, cálculos, proposta, documentos, Revisão IA, equipe e integrações, com barra lateral em grupos e paleta Ctrl K. O cadastro do perito fica em **Meu perfil** (clique no nome, no rodapé da barra lateral); **Configurações** tem tema claro/escuro, cores e os manuais de uso em PDF. **É a única fonte: edite aqui.** |
| `anterior/index.html` | O site como estava antes da troca de 13/10/2026, para voltar rápido se precisar (`…/gerenciador-pericias/anterior/`). |
| `novo/` | Endereço antigo da prévia; agora só redireciona para o site principal. |
| `ferramentas/` | Referência das partes acrescentadas na prévia (telas novas, barra lateral, paleta). O `montar-novo.py` está aposentado. |
| `extensao-projudi/` | Extensão do Chrome **PROJUDI PDFs** (v1.7.2): ZIP dos autos, envio ao Gerenciador de Perícia, busca pelo código de acesso ou com o login do perito, assinatura pelo Mercado Pago. Arquitetura em `extensao-projudi/LEIA-ME-ARQUITETURA.md`. |
| `servidor-php/` | Peças para o Gerenciador de Perícia em PHP/MySQL (`localhost:8080`): API de upload dos autos (criptografada, sem duplicados), tabela e receptor. Instalação em `servidor-php/LEIA-ME.md`. |
| `apresentacao/` | Telas reais (WebP, dados fictícios) usadas na página de apresentação. |
| `icones/` | Ícone do Gerenciador de Perícia (pasta com lupa): SVG, favicons, ícones do app e `site.webmanifest` na raiz. |
| `vendor/` | Bibliotecas servidas pelo próprio site (sem CDN): Firebase 10.13.2, pdf.js 2.16.105, JSZip 3.10.1 e jsPDF 2.5.1, com as licenças ao lado. |
| `firebase/` | Regras de segurança do Firestore e do Storage, com testes no emulador (`firebase/testes`, rodam no GitHub Actions a cada mudança). |
| `testes/` | Testes de ponta a ponta com Chromium, a extensão real e um PROJUDI simulado. |

## Como os autos chegam

```
Perícia (Gerenciador de Perícia) → extensão → aba do PROJUDI (código de acesso ou login do perito)
→ PDFs um por um (o .p7s vira PDF) → perícia, com ID fixo do PROJUDI (nunca duplica)
```

O Gerenciador de Perícia nunca pede nem guarda senha ou certificado do PROJUDI. O login é sempre feito
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

## Página de apresentação

Quem não entrou vê a apresentação (`renderApresentacao`): o que o sistema faz, demonstração com telas
reais que passam sozinhas, Revisão IA, simulador de honorários e contador de prazo (funcionam sem conta),
segurança, dúvidas, suporte (e-mail; WhatsApp aparece quando `SUPORTE_WHATSAPP` for preenchido) e o
login numa janela. Para trocar as telas, gere novas imagens em `apresentacao/` com os mesmos nomes.

## Segurança

- **Regras do Firebase** (`firebase/firestore.rules` e `firebase/storage.rules`): cada perícia só é lida por quem está em `emails`, alterada por quem está em `editores` (só o dono tira ou rebaixa alguém) e excluída pelo dono; o perfil (com a chave da IA) só pela própria conta; arquivos seguem a perícia, até 50 MB, sem HTML/SVG/script; o resto fica fechado. **Para valer, publique no Firebase Console** (Firestore Database > Regras e Storage > Regras: colar e Publicar) ou com `firebase deploy --only firestore:rules,storage`.
- **No site**: política de segurança de conteúdo (CSP), anti-clickjacking, bibliotecas próprias em `vendor/`, dados da nuvem conferidos e convertidos ao tipo esperado (`limparCaso`, `limparDocumento`), argumentos de `onclick` sempre por `jsq()`, endereços de arquivo só do bucket do projeto.
- **Extensão 1.7.2**: cada mensagem só é aceita da origem certa (Gerenciador de Perícia ou PROJUDI) e só baixa arquivos do PROJUDI.
- **Termos e privacidade**: Termos de uso, Política de privacidade e Segurança (constante `LEGAL`, versão em `VERSAO_PRIVACIDADE`). Mudou o texto, suba a versão: cada conta aceita de novo.

## Manuais de uso

Os manuais (Comece por aqui, Chave da IA, Revisão IA, Extensão PROJUDI PDFs, Proposta, Prazos/agenda/tarefas,
Conta/equipe/privacidade) estão no `index.html`, na constante `MANUAIS`, e viram PDF no navegador com o jsPDF.
Mudou uma tela? Ajuste o texto ali e a data em `MANUAL_DATA`.

## Voltar para a versão anterior

Se algo der errado, copie `anterior/index.html` por cima do `index.html` e publique. O site
volta a ser o de antes; os dados não mudam.

## Testes

```bash
./testes/rodar.sh
```

Precisa de Node, PHP (pdo_sqlite e openssl), OpenSSL e Playwright com Chromium. O script
sobe o PROJUDI simulado (HTTPS local) e o PHP de teste (SQLite), e roda as três suítes:
o fluxo dos autos no site (24), as telas, a barra lateral, a paleta, a Revisão IA, Meu perfil, Configurações, segurança, termos e apresentação (78) e o PHP com o Mercado Pago (13).

## Publicar uma nova versão da extensão

1. Suba `version` no `extensao-projudi/manifest.json`. A descrição tem no máximo 132 caracteres.
2. Rode `./testes/rodar.sh`.
3. Compacte o **conteúdo** de `extensao-projudi/` (sem a pasta por fora) e envie na Chrome Web Store.

Nunca suba `servidor-php/api/autos-config.php`: ele tem a senha do banco e a chave de criptografia
(já está no `.gitignore`).
