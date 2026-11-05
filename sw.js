/* Service worker do Gerenciador de Perícia.
   Deixa o site instalável como app (Android, Play Store e "Adicionar à tela inicial") e mostra um aviso
   quando não há internet. Não guarda páginas em cache: o site sempre abre na versão mais nova. */
const OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sem internet · Gerenciador de Perícia</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F3F5F4;color:#1A3650;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
@media (prefers-color-scheme:dark){body{background:#101820;color:#E6EDF2}}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;opacity:.8}button{font:inherit;padding:10px 20px;border-radius:10px;border:0;background:#1A3650;color:#fff}</style></head>
<body><main><h1>Sem conexão com a internet</h1><p>O Gerenciador de Perícia precisa de internet para abrir as suas perícias.<br>Confira o Wi-Fi ou os dados móveis.</p>
<button onclick="location.reload()">Tentar de novo</button></main></body></html>`;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if(e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, {headers: {'Content-Type': 'text/html; charset=utf-8'}})));
});
