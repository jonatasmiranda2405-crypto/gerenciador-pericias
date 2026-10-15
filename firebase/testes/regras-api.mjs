// Publica e confere as regras do Firestore e do Storage pela API oficial do Firebase (firebaserules.googleapis.com).
// Usado pelo GitHub Actions com o segredo FIREBASE_SA (chave JSON de uma conta de serviço que só tem o papel
// "Administrador de regras do Firebase"). Sem o segredo, não faz nada e só avisa.
//
//   node regras-api.mjs conferir   → compara as regras publicadas com as do repositório (sai 1 se diferentes)
//   node regras-api.mjs publicar   → publica as regras do repositório e confere em seguida
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const PROJETO = 'gerenciador-pericias-app';
const BUCKET = 'gerenciador-pericias-app.firebasestorage.app';
const API = `https://firebaserules.googleapis.com/v1/projects/${PROJETO}`;
const ALVOS = [
  { nome: 'Firestore', release: 'cloud.firestore', arquivo: new URL('../firestore.rules', import.meta.url) },
  { nome: 'Storage', release: `firebase.storage/${BUCKET}`, arquivo: new URL('../storage.rules', import.meta.url) },
];
const normal = (t) => String(t).replace(/\r\n/g, '\n').trim();

export async function cliente() {
  const bruto = process.env.FIREBASE_SA;
  if (!bruto) return null;
  const auth = new GoogleAuth({ credentials: JSON.parse(bruto), scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'] });
  return auth.getClient();
}
async function chamar(c, metodo, url, corpo) {
  const r = await c.request({ method: metodo, url, data: corpo, validateStatus: () => true });
  if (r.status >= 300) throw new Error(`${metodo} ${url.replace(API, '')} → ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
}
export async function conferir(c) {
  const out = [];
  for (const a of ALVOS) {
    const rel = await chamar(c, 'GET', `${API}/releases/${a.release}`);
    const rs = await chamar(c, 'GET', `https://firebaserules.googleapis.com/v1/${rel.rulesetName}`);
    const publicado = normal(((rs.source || {}).files || []).map((f) => f.content).join('\n'));
    const repo = normal(readFileSync(a.arquivo, 'utf8'));
    out.push({ nome: a.nome, igual: publicado === repo, quando: rel.updateTime });
  }
  return out;
}
async function publicar(c) {
  for (const a of ALVOS) {
    const conteudo = readFileSync(a.arquivo, 'utf8');
    const nomeArq = a.nome === 'Firestore' ? 'firestore.rules' : 'storage.rules';
    const rs = await chamar(c, 'POST', `${API}/rulesets`, { source: { files: [{ name: nomeArq, content: conteudo }] } });
    await chamar(c, 'PATCH', `${API}/releases/${a.release}`, { release: { name: `projects/${PROJETO}/releases/${a.release}`, rulesetName: rs.name } });
    console.log(`Publicado: ${a.nome} (${rs.name})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const acao = process.argv[2] || 'conferir';
  const c = await cliente();
  if (!c) {
    console.log('::warning title=Regras do Firebase::O segredo FIREBASE_SA não está configurado no GitHub; nada foi publicado nem conferido.');
    process.exit(0);
  }
  try {
    if (acao === 'publicar') await publicar(c);
    const r = await conferir(c);
    for (const x of r) console.log(`${x.igual ? 'OK' : 'DIFERENTE'}: ${x.nome} (publicado em ${x.quando})`);
    const dif = r.filter((x) => !x.igual);
    if (dif.length) { console.log(`::error title=Regras do Firebase::As regras publicadas de ${dif.map((x) => x.nome).join(' e ')} não são as do repositório.`); process.exit(1); }
    console.log('::notice title=Regras do Firebase::As regras publicadas são iguais às do repositório.');
  } catch (e) {
    console.log(`::error title=Regras do Firebase::${String(e.message).replace(/[\r\n]+/g, ' ')}`);
    process.exit(1);
  }
}
