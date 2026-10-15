#!/usr/bin/env bash
# Roda os testes de ponta a ponta da extensão PROJUDI PDFs:
#   1) site do GitHub (index.html)  2) Gerenciador de Perícia PHP (servidor-php)
# Precisa de: node, php (com pdo_sqlite e openssl), openssl e o Playwright com Chromium.
set -euo pipefail
cd "$(dirname "$0")"
SAIDA="$PWD/.saida"; PHPDIR="$SAIDA/php"
rm -rf "$PHPDIR"; mkdir -p "$PHPDIR"

# configuração e banco de teste do PHP (SQLite, chave aleatória)
CHAVE=$(php -r 'echo base64_encode(random_bytes(32));')
cat > "$PHPDIR/autos-config.php" <<PHP
<?php
return [
  'dsn' => 'sqlite:$PHPDIR/teste.db', 'usuario' => null, 'senha' => null,
  'pasta' => '$PHPDIR/armazenamento', 'chave' => '$CHAVE', 'max_bytes' => 60*1024*1024,
  'usuario_atual' => function () { if (session_status() !== PHP_SESSION_ACTIVE) session_start(); return \$_SESSION['usuario_id'] ?? null; },
  'pode_editar' => function (\$u, string \$c, PDO \$db): bool { return \$u === 'perito1'; },
];
PHP
php -r "\$db = new PDO('sqlite:$PHPDIR/teste.db'); \$db->exec(\"CREATE TABLE autos_projudi (id INTEGER PRIMARY KEY AUTOINCREMENT, caso_id TEXT NOT NULL, projudi_id TEXT NOT NULL, nome TEXT NOT NULL, fase TEXT NOT NULL DEFAULT '', movimentacao TEXT NOT NULL DEFAULT '', data_mov TEXT, mime TEXT NOT NULL, tamanho INTEGER NOT NULL, sha256 TEXT NOT NULL, caminho TEXT NOT NULL, enviado_por TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(caso_id, projudi_id))\");"

node server.js > "$SAIDA/servidor.log" 2>&1 & S1=$!
PF_AUTOS_CONFIG="$PHPDIR/autos-config.php" php -S localhost:8080 ../servidor-php/teste/router.php > "$SAIDA/php.log" 2>&1 & S2=$!
trap 'kill $S1 $S2 2>/dev/null || true' EXIT
sleep 1

echo "== Site: fluxo dos autos do PROJUDI"; node teste.js
echo "== Site: telas, barra lateral e paleta"; node teste-telas.js
echo "== Gerenciador de Perícia PHP"; PF_ARMAZ="$PHPDIR/armazenamento" node teste-php.js
