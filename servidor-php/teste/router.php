<?php
// Servidor de teste: php -S localhost:8080 teste/router.php
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($p === '/' || $p === '/pericia') { require __DIR__ . '/pagina.php'; return true; }
if ($p === '/api/autos-projudi.php') { require __DIR__ . '/../api/autos-projudi.php'; return true; }
if ($p === '/js/pj-receptor.js') { header('Content-Type: application/javascript'); readfile(__DIR__ . '/../js/pj-receptor.js'); return true; }
http_response_code(404); echo '404';
