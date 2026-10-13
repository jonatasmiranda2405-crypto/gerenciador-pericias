# Autos do PROJUDI no PeríciaFlow PHP

Peças para o PeríciaFlow em PHP/MySQL (localhost:8080) receber os autos pela extensão
PROJUDI PDFs v1.7. É o mesmo fluxo do site do GitHub. A diferença está no destino: os arquivos vão
para o seu servidor, criptografados, e não para o Firebase.

```
api/autos-projudi.php          API de upload: 1 arquivo por vez, sem duplicar, AES-256-GCM
api/autos-config.exemplo.php   configuração (copie para autos-config.php)
sql/autos_projudi.sql          tabela MySQL
js/pj-receptor.js              liga a página da perícia à extensão
teste/                         servidor de teste usado na verificação (não vai para produção)
```

## Instalação (5 passos)

1. **Tabela:** rode `sql/autos_projudi.sql` no banco do PeríciaFlow.
2. **Chave:** gere uma vez com `php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"` e guarde
   na variável de ambiente `PERICIAFLOW_CHAVE_AUTOS`. **Sem essa chave os arquivos não abrem**:
   faça backup dela separado do banco.
3. **Configuração:** copie `api/autos-config.exemplo.php` para `api/autos-config.php` e ajuste:
   - `dsn`, `usuario` e `senha` do MySQL;
   - `pasta`, que precisa ficar **fora** da pasta pública do site;
   - `usuario_atual()`, que diz quem está logado (o padrão é `$_SESSION['usuario_id']`);
   - `pode_editar()`, que diz se a pessoa pode mexer na perícia. Vem fechado (`false`) até você ligar.
   Coloque `autos-config.php` no `.gitignore`.
4. **Página da perícia:** inclua o botão, a área de status e o script:
   ```html
   <button data-pf-autos data-caso="<?= $pericia['id'] ?>"
           data-numero="<?= htmlspecialchars($pericia['numero_processo']) ?>"
           data-codigo="<?= htmlspecialchars($pericia['codigo_acesso']) ?>">Baixar autos do PROJUDI</button>
   <div data-pf-autos-status="<?= $pericia['id'] ?>"></div>
   <script src="/js/pj-receptor.js"></script>
   <script>
     PericiaFlowAutos.configurar({
       api: "/api/autos-projudi.php",
       aoTerminar: () => location.reload()   // ou recarregue só a lista de documentos
     });
   </script>
   ```
   Para listar e abrir os arquivos: `GET /api/autos-projudi.php?acao=listar&caso_id=ID` e
   `?acao=abrir&id=N`. As duas chamadas exigem o cabeçalho `X-PF-Autos: 1`.
5. **Envios feitos no PROJUDI** ("Enviar ao PeríciaFlow"): passe também `casos()`, que lista as perícias
   do usuário, e, se quiser, `criarCaso(pedido)`. Sem isso, o perito usa o botão dentro da perícia.

## Segurança

- A senha e o certificado do PROJUDI nunca passam pelo PeríciaFlow: o login é sempre feito no site
  do tribunal, pelo próprio perito.
- A API só aceita chamadas da mesma origem, com o cabeçalho `X-PF-Autos: 1` e sessão ativa. Ela confere
  a permissão na perícia a cada chamada.
- Os arquivos no disco ficam criptografados (AES-256-GCM), com nome aleatório e fora da pasta pública.
  O SHA-256 do original fica no banco, para auditoria.
- Documentos HTML vindos do PROJUDI abrem isolados (CSP `sandbox`) e nunca rodam script no seu domínio.

## Verificado

Teste automático com Chromium, a extensão v1.7, o PROJUDI simulado e esta API (SQLite). Foram 13
verificações aprovadas: importação, PDF tirado do `.p7s`, arquivos criptografados no disco, nada
duplicado, recusa sem o cabeçalho de segurança e o checkout do Mercado Pago.
