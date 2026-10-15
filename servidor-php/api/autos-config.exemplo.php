<?php
// Copie para autos-config.php e ajuste. NÃO publique o autos-config.php no GitHub.
return [
  // Banco (o mesmo do Gerenciador de Perícia PHP)
  'dsn'     => 'mysql:host=127.0.0.1;dbname=periciaflow;charset=utf8mb4',
  'usuario' => 'periciaflow',
  'senha'   => '',

  // Pasta onde os PDFs criptografados ficam. Precisa estar FORA da pasta pública do site.
  'pasta'   => __DIR__ . '/../../armazenamento/autos',

  // Chave de criptografia: 32 bytes em base64. Gere uma vez com:
  //   php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
  // e guarde na variável de ambiente PERICIAFLOW_CHAVE_AUTOS (preferível) ou aqui.
  'chave'   => getenv('PERICIAFLOW_CHAVE_AUTOS') ?: '',

  // Tamanho máximo de um arquivo (bytes)
  'max_bytes' => 60 * 1024 * 1024,

  // ---- Ligação com o login do Gerenciador de Perícia PHP: ADAPTE estas duas funções ----
  // Quem está logado (ou null). Padrão: $_SESSION['usuario_id'].
  'usuario_atual' => function () {
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    return $_SESSION['usuario_id'] ?? null;
  },
  // Se esse usuário pode gravar documentos nesta perícia.
  'pode_editar' => function ($usuario, string $casoId, PDO $db): bool {
    // Exemplo: $q = $db->prepare('SELECT 1 FROM pericias WHERE id = ? AND dono_id = ?');
    //          $q->execute([$casoId, $usuario]); return (bool) $q->fetchColumn();
    return false; // fechado até ser configurado
  },
];
