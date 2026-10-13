<?php
/**
 * API de upload dos autos do PROJUDI — PeríciaFlow (versão PHP/MySQL)
 *
 * Recebe UM arquivo por vez da página da perícia (pj-receptor.js), que por sua vez recebe da
 * extensão "PROJUDI PDFs". Não duplica: (caso_id, projudi_id) é chave única.
 * Guarda os arquivos criptografados (AES-256-GCM) fora da pasta pública.
 *
 *   GET  ?acao=ja-tenho&caso_id=X         → { ok, ids: [projudi_id...] }
 *   POST acao=enviar (multipart)          → { ok, id, duplicado }
 *        caso_id, projudi_id, nome, fase, movimentacao, data (AAAA-MM-DD), arquivo
 *   GET  ?acao=listar&caso_id=X           → { ok, arquivos: [...] }
 *   GET  ?acao=abrir&id=N                 → o PDF (descriptografado), para ver no navegador
 *
 * Só aceita chamadas da própria origem com o cabeçalho X-PF-Autos: 1 (bloqueia CSRF simples).
 */
declare(strict_types=1);

$CFG = require (getenv('PF_AUTOS_CONFIG') ?: __DIR__ . '/autos-config.php');

function responder(int $codigo, array $dados): void {
  http_response_code($codigo);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($dados, JSON_UNESCAPED_UNICODE);
  exit;
}
function erro(int $codigo, string $msg): void { responder($codigo, ['ok' => false, 'erro' => $msg]); }

function chave(array $cfg): string {
  $k = base64_decode((string) $cfg['chave'], true);
  if ($k === false || strlen($k) !== 32) erro(500, 'Chave de criptografia não configurada (PERICIAFLOW_CHAVE_AUTOS).');
  return $k;
}
// Formato do arquivo: "PFA1" + iv(12) + tag(16) + dados cifrados
function cifrar(string $dados, string $k): string {
  $iv = random_bytes(12);
  $tag = '';
  $c = openssl_encrypt($dados, 'aes-256-gcm', $k, OPENSSL_RAW_DATA, $iv, $tag, 'PFA1', 16);
  if ($c === false) erro(500, 'Falha ao criptografar o arquivo.');
  return 'PFA1' . $iv . $tag . $c;
}
function decifrar(string $bloco, string $k): string {
  if (substr($bloco, 0, 4) !== 'PFA1') erro(500, 'Arquivo armazenado em formato desconhecido.');
  $iv = substr($bloco, 4, 12); $tag = substr($bloco, 16, 16);
  $d = openssl_decrypt(substr($bloco, 32), 'aes-256-gcm', $k, OPENSSL_RAW_DATA, $iv, $tag, 'PFA1');
  if ($d === false) erro(500, 'Arquivo armazenado corrompido ou chave trocada.');
  return $d;
}
function campo(string $nome, int $max): string {
  $v = trim((string) ($_POST[$nome] ?? $_GET[$nome] ?? ''));
  return mb_substr($v, 0, $max);
}

// ---------- segurança da chamada ----------
if (($_SERVER['HTTP_X_PF_AUTOS'] ?? '') !== '1') erro(400, 'Chamada inválida.');
$origem = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origem !== '') {
  $host = parse_url($origem, PHP_URL_HOST) . (parse_url($origem, PHP_URL_PORT) ? ':' . parse_url($origem, PHP_URL_PORT) : '');
  if ($host !== ($_SERVER['HTTP_HOST'] ?? '')) erro(403, 'Origem não permitida.');
}

try {
  $db = new PDO($CFG['dsn'], $CFG['usuario'] ?? null, $CFG['senha'] ?? null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (Throwable $e) { erro(500, 'Banco de dados indisponível.'); }

$usuario = ($CFG['usuario_atual'])();
if ($usuario === null || $usuario === '') erro(401, 'Entre no PeríciaFlow para importar os autos.');

$acao = campo('acao', 20);
$casoId = campo('caso_id', 64);
$exigeCaso = in_array($acao, ['ja-tenho', 'enviar', 'listar'], true);
if ($exigeCaso) {
  if ($casoId === '' || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $casoId)) erro(400, 'Perícia inválida.');
  if (!($CFG['pode_editar'])($usuario, $casoId, $db)) erro(403, 'Você não pode alterar esta perícia.');
}

switch ($acao) {
  case 'ja-tenho': {
    $q = $db->prepare('SELECT projudi_id FROM autos_projudi WHERE caso_id = ?');
    $q->execute([$casoId]);
    responder(200, ['ok' => true, 'ids' => array_map('strval', $q->fetchAll(PDO::FETCH_COLUMN))]);
  }

  case 'listar': {
    $q = $db->prepare('SELECT id, projudi_id, nome, fase, movimentacao, data_mov, mime, tamanho, criado_em FROM autos_projudi WHERE caso_id = ? ORDER BY movimentacao + 0, id');
    $q->execute([$casoId]);
    responder(200, ['ok' => true, 'arquivos' => $q->fetchAll()]);
  }

  case 'enviar': {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') erro(405, 'Use POST.');
    $projudiId = campo('projudi_id', 128);
    if ($projudiId === '' || !preg_match('/^[A-Za-z0-9._-]{1,128}$/', $projudiId)) erro(400, 'Identificador do arquivo inválido.');
    $arq = $_FILES['arquivo'] ?? null;
    if (!$arq || ($arq['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) erro(400, 'Arquivo não recebido.');
    if ($arq['size'] > $CFG['max_bytes']) erro(413, 'Arquivo grande demais.');

    // já existe? (antes de ler e criptografar)
    $q = $db->prepare('SELECT id FROM autos_projudi WHERE caso_id = ? AND projudi_id = ?');
    $q->execute([$casoId, $projudiId]);
    if ($id = $q->fetchColumn()) responder(200, ['ok' => true, 'id' => (int) $id, 'duplicado' => true]);

    $dados = file_get_contents($arq['tmp_name']);
    $ehPdf = strncmp($dados, '%PDF', 4) === 0;
    $ehHtml = !$ehPdf && preg_match('/^\s*<(!doctype|html|body|div|p|table)/i', substr($dados, 0, 200));
    if (!$ehPdf && !$ehHtml) erro(415, 'Só são aceitos PDF e documentos HTML do PROJUDI.');

    $nome = preg_replace('/[\\\\\/:*?"<>|\x00-\x1f]+/u', '_', campo('nome', 200)) ?: ($projudiId . ($ehPdf ? '.pdf' : '.html'));
    $data = campo('data', 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) $data = null;
    $sha = hash('sha256', $dados);

    $pasta = rtrim($CFG['pasta'], '/') . '/' . $casoId;
    if (!is_dir($pasta) && !mkdir($pasta, 0700, true)) erro(500, 'Não foi possível criar a pasta de armazenamento.');
    $caminho = $pasta . '/' . bin2hex(random_bytes(16)) . '.pfa';
    if (file_put_contents($caminho, cifrar($dados, chave($CFG)), LOCK_EX) === false) erro(500, 'Não foi possível gravar o arquivo.');

    try {
      $ins = $db->prepare('INSERT INTO autos_projudi (caso_id, projudi_id, nome, fase, movimentacao, data_mov, mime, tamanho, sha256, caminho, enviado_por)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      $ins->execute([$casoId, $projudiId, $nome, campo('fase', 255), campo('movimentacao', 16), $data,
        $ehPdf ? 'application/pdf' : 'text/html', strlen($dados), $sha, $caminho, (string) $usuario]);
      responder(201, ['ok' => true, 'id' => (int) $db->lastInsertId(), 'duplicado' => false]);
    } catch (PDOException $e) {
      @unlink($caminho);
      // corrida: outro envio gravou o mesmo arquivo entre a checagem e o INSERT
      if ($e->getCode() === '23000') responder(200, ['ok' => true, 'duplicado' => true]);
      erro(500, 'Falha ao registrar o arquivo.');
    }
  }

  case 'abrir': {
    $id = (int) campo('id', 12);
    $q = $db->prepare('SELECT * FROM autos_projudi WHERE id = ?');
    $q->execute([$id]);
    $r = $q->fetch();
    if (!$r || !($CFG['pode_editar'])($usuario, $r['caso_id'], $db)) erro(404, 'Arquivo não encontrado.');
    $dados = decifrar((string) file_get_contents($r['caminho']), chave($CFG));
    header('Content-Type: ' . $r['mime']);
    header('Content-Disposition: inline; filename="' . rawurlencode($r['nome']) . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    // HTML vindo do PROJUDI nunca roda script no domínio do PeríciaFlow
    // (só no HTML: o leitor de PDF do Chrome não abre arquivo com "sandbox")
    if ($r['mime'] === 'text/html') header("Content-Security-Policy: sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    echo $dados;
    exit;
  }

  default:
    erro(400, 'Ação desconhecida.');
}
