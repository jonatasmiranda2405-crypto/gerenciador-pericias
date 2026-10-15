// Vigia diário do Gerenciador de Perícia (roda no GitHub Actions: .github/workflows/vigia.yml).
// Cada verificação tenta o que um invasor tentaria, ou confere algo que costuma quebrar sem ninguém ver.
// Saída: resumo da execução no GitHub, anotações de erro e código de saída 1 quando algo falha
// (o GitHub manda e-mail para o dono do repositório).
import { readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const RAIZ = new URL('..', import.meta.url).pathname;
const SITE = process.env.VIGIA_SITE || 'https://jonatasmiranda2405-crypto.github.io/gerenciador-pericias/';
const COMPARAR_SITE = process.env.VIGIA_COMPARAR_SITE !== '0';
const PROJETO = 'gerenciador-pericias-app';
const BUCKET = 'gerenciador-pericias-app.firebasestorage.app';
const CHAVE_PUBLICA_FIREBASE = 'AIzaSyA0UQuXuFI85MFjdfNn2YAYv2VNbZEUKmk'; // chave web do Firebase: pública por natureza

const resultados = [];
const ok = (grupo, titulo, detalhe = '') => resultados.push({ grupo, titulo, ok: true, detalhe });
const falha = (grupo, titulo, detalhe = '') => resultados.push({ grupo, titulo, ok: false, detalhe });
const aviso = (grupo, titulo, detalhe = '') => resultados.push({ grupo, titulo, ok: null, detalhe });
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function status(url) {
  try { const r = await fetch(url, { redirect: 'manual' }); return r.status; } catch (e) { return 0; }
}

// 1) Banco e arquivos fechados para quem não entrou
async function bancoFechado() {
  const s1 = await status(`https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/casos?pageSize=1`);
  (s1 === 401 || s1 === 403 ? ok : falha)('Firebase', 'Banco fechado para quem não entrou', `Firestore respondeu ${s1}`);
  const s2 = await status(`https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/usuarios?pageSize=1`);
  (s2 === 401 || s2 === 403 ? ok : falha)('Firebase', 'Perfis fechados para quem não entrou', `Firestore respondeu ${s2}`);
  const s3 = await status(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?maxResults=1`);
  (s3 === 401 || s3 === 403 ? ok : falha)('Firebase', 'Arquivos fechados para quem não entrou', `Storage respondeu ${s3}`);
}

// 2) Bibliotecas servidas pelo site sem falhas conhecidas
function versoesVendor() {
  const nomes = readdirSync(join(RAIZ, 'vendor'));
  const pega = (re) => { for (const n of nomes) { const m = n.match(re); if (m) return m[1]; } return null; };
  return {
    firebase: pega(/^firebase-(\d+\.\d+\.\d+)$/),
    'pdfjs-dist': pega(/^pdfjs-(\d+\.\d+\.\d+)$/),
    jszip: pega(/^jszip-(\d+\.\d+\.\d+)\.min\.js$/),
    jspdf: pega(/^jspdf-(\d+\.\d+\.\d+)\.umd\.min\.js$/),
  };
}
// Alertas que existem no pacote npm, mas em partes que só rodam em servidor Node (não vão para o navegador).
const SO_SERVIDOR = new Set(['undici', '@grpc/grpc-js', 'protobufjs']);
function bibliotecas() {
  const v = versoesVendor();
  const falta = Object.entries(v).filter(([, x]) => !x).map(([n]) => n);
  if (falta.length) { falha('Bibliotecas', 'Versões da pasta vendor', 'não identificadas: ' + falta.join(', ')); return; }
  const dir = mkdtempSync(join(tmpdir(), 'vigia-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'vigia', version: '1.0.0', private: true, dependencies: v }));
  try {
    execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { cwd: dir, stdio: 'ignore' });
    let saida = '';
    try { saida = execSync('npm audit --json', { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { saida = e.stdout || ''; }
    const vulns = (JSON.parse(saida || '{}').vulnerabilities) || {};
    // de onde vem cada alerta: segue a cadeia até o pacote que tem a falha de fato
    const raizes = (nome, vistos = new Set()) => {
      if (vistos.has(nome) || !vulns[nome]) return new Set();
      vistos.add(nome);
      const out = new Set();
      for (const x of vulns[nome].via || []) {
        if (typeof x === 'object') out.add(nome);
        else for (const r of raizes(x, vistos)) out.add(r);
      }
      return out;
    };
    const relevantes = [];
    for (const [nome, info] of Object.entries(vulns)) {
      if (!info.isDirect || !['high', 'critical'].includes(info.severity)) continue;
      const fontes = [...raizes(nome)].filter((r) => !SO_SERVIDOR.has(r));
      if (!fontes.length) continue;
      const titulos = fontes.flatMap((f) => (vulns[f].via || []).filter((x) => typeof x === 'object').map((x) => x.title));
      relevantes.push(`${nome} (${info.severity}): ${titulos.slice(0, 3).join('; ')}`);
    }
    const lista = Object.entries(v).map(([n, x]) => `${n} ${x}`).join(', ');
    (relevantes.length ? falha : ok)('Bibliotecas', 'Sem falhas conhecidas (alta ou crítica)', relevantes.length ? relevantes.join(' | ') : lista);
  } catch (e) {
    aviso('Bibliotecas', 'Consulta de falhas conhecidas', 'não foi possível consultar agora: ' + e.message);
  }
}

// 3) Site publicado igual ao repositório, com as proteções no lugar
async function sitePublicado() {
  let html = '';
  try { const r = await fetch(SITE + 'index.html', { cache: 'no-store' }); html = await r.text(); if (!r.ok) throw new Error('status ' + r.status); }
  catch (e) { falha('Site', 'Site no ar', e.message); return; }
  ok('Site', 'Site no ar', SITE);
  /object-src 'none'/.test(html) && /http-equiv="Content-Security-Policy"/.test(html)
    ? ok('Site', 'Política de segurança (CSP) presente') : falha('Site', 'Política de segurança (CSP) presente', 'a meta CSP sumiu do index.html publicado');
  /window\.top !== window\.self/.test(html) ? ok('Site', 'Proteção contra clickjacking') : falha('Site', 'Proteção contra clickjacking');
  const externos = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]);
  externos.length ? falha('Site', 'Código só do próprio site', externos.join(', ')) : ok('Site', 'Código só do próprio site');
  if (!COMPARAR_SITE) { aviso('Site', 'Comparação com o repositório', 'pulada nesta execução'); return; }
  const arquivos = ['index.html', ...listar(join(RAIZ, 'vendor')).map((f) => relative(RAIZ, f))].filter((f) => !/LICENSE|\.md$|\.txt$/.test(f));
  const diferentes = [];
  for (const f of arquivos) {
    try {
      const r = await fetch(SITE + f, { cache: 'no-store' });
      const remoto = Buffer.from(await r.arrayBuffer());
      if (sha(remoto) !== sha(readFileSync(join(RAIZ, f)))) diferentes.push(f);
    } catch (e) { diferentes.push(f + ' (não baixou)'); }
  }
  diferentes.length ? falha('Site', 'Site publicado igual ao repositório', 'diferentes: ' + diferentes.join(', '))
    : ok('Site', 'Site publicado igual ao repositório', `${arquivos.length} arquivos conferidos`);
}

// 4) Segredos esquecidos no código
function listar(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (['.git', 'node_modules', '.saida'].includes(n)) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listar(p));
    else if (st.size < 5 * 1024 * 1024) out.push(p);
  }
  return out;
}
function segredos() {
  const padroes = [
    [/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, 'chave privada'],
    [/"type"\s*:\s*"service_account"/, 'conta de serviço do Google'],
    [/AIza[0-9A-Za-z_-]{35}/g, 'chave de API do Google'],
    [/APP_USR-\d{6,}-\d{6}-[0-9a-f]{20,}/, 'token do Mercado Pago'],
    [/sk_live_[0-9a-zA-Z]{20,}/, 'chave secreta de pagamento'],
    [/ghp_[0-9A-Za-z]{36}/, 'token do GitHub'],
  ];
  const achados = [];
  for (const f of listar(RAIZ)) {
    if (/\.(png|webp|ico|jpg|pdf|zip|woff2?)$/i.test(f) || f.includes('/vendor/')) continue;
    const txt = readFileSync(f, 'utf8');
    for (const [re, nome] of padroes) {
      const ms = txt.match(re);
      if (!ms) continue;
      const lista = re.global ? ms : [ms[0]];
      if (nome === 'chave de API do Google' && lista.every((k) => k === CHAVE_PUBLICA_FIREBASE)) continue;
      achados.push(`${relative(RAIZ, f)}: ${nome}`);
    }
  }
  try { statSync(join(RAIZ, 'servidor-php/api/autos-config.php')); achados.push('servidor-php/api/autos-config.php (configuração com senha) está no repositório'); } catch (e) {}
  achados.length ? falha('Código', 'Nenhuma senha ou chave secreta no repositório', achados.join(' | ')) : ok('Código', 'Nenhuma senha ou chave secreta no repositório');
}

await bancoFechado();
bibliotecas();
await sitePublicado();
segredos();

const falhas = resultados.filter((r) => r.ok === false);
const linhas = ['## Vigia do Gerenciador de Perícia', '', `${resultados.length - falhas.length} de ${resultados.length} verificações ok`, '', '| | Verificação | Detalhe |', '|---|---|---|',
  ...resultados.map((r) => `| ${r.ok === true ? '✅' : r.ok === false ? '❌' : '⚠️'} | ${r.grupo}: ${r.titulo} | ${String(r.detalhe).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').replace(/::/g, ': :')} |`)];
console.log(linhas.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join('\n') + '\n');
for (const f of falhas) console.log(`::error title=${f.grupo}: ${f.titulo}::${String(f.detalhe).replace(/\r?\n/g, ' ').slice(0, 900)}`);
console.log(`::notice title=Vigia::${resultados.length - falhas.length} de ${resultados.length} verificações ok`);
process.exit(falhas.length ? 1 : 0);
