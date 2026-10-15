// Testes das regras do Firestore e do Storage do Gerenciador de Perícia.
// Rodam no emulador: `npm test` dentro de firebase/testes (ou no GitHub Actions).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const DONO = 'dona@exemplo.com', EDITOR = 'editor@exemplo.com', LEITOR = 'leitor@exemplo.com', ESTRANHO = 'estranho@exemplo.com';
const ANTIGA = 'jonatasmiranda2405@gmail.com';
let env;

const conta = (uid, email, verificado = true) => env.authenticatedContext(uid, { email, email_verified: verificado });
const db = (uid, email, v) => conta(uid, email, v).firestore();
const st = (uid, email, v) => conta(uid, email, v).storage();

const caso = (extra = {}) => ({
  nome: 'Revisional', codigo: 'PER-1', dono: DONO,
  emails: [DONO, EDITOR, LEITOR], editores: [DONO, EDITOR],
  compartilhamentos: [{ email: EDITOR, nivel: 'editar' }, { email: LEITOR, nivel: 'leitura' }],
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-periciaflow',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8180 },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, 'casos/c1'), caso());
    await setDoc(doc(f, 'casos/c1/documentos/d1'), { nome: 'peticao.pdf' });
    await setDoc(doc(f, 'casos/antigo'), { nome: 'Perícia antiga sem acessos' });
    await setDoc(doc(f, 'usuarios/u-dona'), { email: DONO, ia: { chave: 'segredo' } });
    await setDoc(doc(f, 'config/peritos'), { x: 1 });
    await uploadBytes(ref(ctx.storage(), 'casos/c1/documentos/d1/peticao.pdf'), new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' });
  });
});

// ---------------- Firestore: perícias ----------------
test('visitante sem login não lê nenhuma perícia', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'casos/c1')));
});
test('conta com e-mail não confirmado não lê', async () => {
  await assertFails(getDoc(doc(db('u-dona', DONO, false), 'casos/c1')));
});
test('membros leem a perícia; estranho não', async () => {
  await assertSucceeds(getDoc(doc(db('u-dona', DONO), 'casos/c1')));
  await assertSucceeds(getDoc(doc(db('u-leitor', LEITOR), 'casos/c1')));
  await assertFails(getDoc(doc(db('u-x', ESTRANHO), 'casos/c1')));
});
test('a consulta por e-mail passa; a coleção inteira não', async () => {
  await assertSucceeds(getDocs(query(collection(db('u-leitor', LEITOR), 'casos'), where('emails', 'array-contains', LEITOR))));
  await assertFails(getDocs(collection(db('u-leitor', LEITOR), 'casos')));
  await assertFails(getDocs(query(collection(db('u-x', ESTRANHO), 'casos'), where('emails', 'array-contains', DONO))));
});
test('criar perícia: só como dono, com acessos coerentes e id seguro', async () => {
  const f = db('u-x', ESTRANHO);
  await assertSucceeds(setDoc(doc(f, 'casos/c2'), { nome: 'Nova', dono: ESTRANHO, emails: [ESTRANHO], editores: [ESTRANHO], compartilhamentos: [] }));
  await assertFails(setDoc(doc(f, 'casos/c3'), { nome: 'Nova', dono: DONO, emails: [DONO, ESTRANHO], editores: [DONO, ESTRANHO] }));
  await assertFails(setDoc(doc(f, 'casos/c4'), { nome: 'Nova', dono: ESTRANHO, emails: [ESTRANHO], editores: [ESTRANHO, DONO] }));
  await assertFails(setDoc(doc(f, "casos/x');alert(1)"), { nome: 'Nova', dono: ESTRANHO, emails: [ESTRANHO], editores: [ESTRANHO] }));
  await assertFails(setDoc(doc(f, 'casos/c5'), { nome: 'Sem acessos' }));
});
test('editor altera e compartilha, mas não troca o dono nem o remove', async () => {
  const f = db('u-editor', EDITOR);
  await assertSucceeds(updateDoc(doc(f, 'casos/c1'), { nome: 'Novo nome' }));
  await assertSucceeds(updateDoc(doc(f, 'casos/c1'), { emails: [DONO, EDITOR, LEITOR, 'novo@exemplo.com'] }));
  await assertFails(updateDoc(doc(f, 'casos/c1'), { dono: EDITOR }));
  await assertFails(updateDoc(doc(f, 'casos/c1'), { emails: [EDITOR, LEITOR], editores: [EDITOR] }));
  await assertFails(updateDoc(doc(f, 'casos/c1'), { editores: [DONO, EDITOR, ESTRANHO] }));
});
test('editor não tira nem rebaixa ninguém; o dono pode', async () => {
  const f = db('u-editor', EDITOR);
  await assertFails(updateDoc(doc(f, 'casos/c1'), { emails: [DONO, EDITOR], editores: [DONO, EDITOR] }));
  await assertSucceeds(updateDoc(doc(f, 'casos/c1'), { editores: [DONO, EDITOR, LEITOR] }));
  const d = db('u-dona', DONO);
  await assertSucceeds(updateDoc(doc(d, 'casos/c1'), { emails: [DONO, LEITOR], editores: [DONO] }));
  await assertFails(updateDoc(doc(d, 'casos/c1'), { dono: LEITOR }));
});
test('quem só lê não vira editor sozinho', async () => {
  await assertFails(updateDoc(doc(db('u-leitor', LEITOR), 'casos/c1'), { editores: [DONO, EDITOR, LEITOR] }));
});
test('leitor e estranho não alteram', async () => {
  await assertFails(updateDoc(doc(db('u-leitor', LEITOR), 'casos/c1'), { nome: 'x' }));
  await assertFails(updateDoc(doc(db('u-leitor', LEITOR), 'casos/c1'), { editores: [DONO, EDITOR, LEITOR] }));
  await assertFails(updateDoc(doc(db('u-x', ESTRANHO), 'casos/c1'), { nome: 'x' }));
});
test('só o dono apaga a perícia', async () => {
  await assertFails(deleteDoc(doc(db('u-editor', EDITOR), 'casos/c1')));
  await assertSucceeds(deleteDoc(doc(db('u-dona', DONO), 'casos/c1')));
});

// ---------------- Firestore: documentos ----------------
test('documentos seguem o acesso da perícia', async () => {
  await assertSucceeds(getDoc(doc(db('u-leitor', LEITOR), 'casos/c1/documentos/d1')));
  await assertFails(getDoc(doc(db('u-x', ESTRANHO), 'casos/c1/documentos/d1')));
  await assertSucceeds(setDoc(doc(db('u-editor', EDITOR), 'casos/c1/documentos/d2'), { nome: 'laudo.pdf' }));
  await assertFails(setDoc(doc(db('u-leitor', LEITOR), 'casos/c1/documentos/d3'), { nome: 'x.pdf' }));
  await assertFails(setDoc(doc(db('u-editor', EDITOR), "casos/c1/documentos/a'b"), { nome: 'x.pdf' }));
  await assertFails(deleteDoc(doc(db('u-leitor', LEITOR), 'casos/c1/documentos/d1')));
  await assertSucceeds(deleteDoc(doc(db('u-editor', EDITOR), 'casos/c1/documentos/d1')));
});

// ---------------- Firestore: perfil, legado e resto ----------------
test('perfil (com a chave da IA) só pelo próprio usuário', async () => {
  await assertSucceeds(getDoc(doc(db('u-dona', DONO), 'usuarios/u-dona')));
  await assertFails(getDoc(doc(db('u-x', ESTRANHO), 'usuarios/u-dona')));
  await assertFails(setDoc(doc(db('u-x', ESTRANHO), 'usuarios/u-dona'), { nome: 'invasor' }));
  await assertSucceeds(setDoc(doc(db('u-x', ESTRANHO), 'usuarios/u-x'), { email: ESTRANHO, nome: 'Eu' }));
  await assertFails(setDoc(doc(db('u-y', ESTRANHO), 'usuarios/u-y'), { email: DONO }));
});
test('perícia antiga sem acessos: só as contas antigas leem e migram', async () => {
  await assertFails(getDoc(doc(db('u-x', ESTRANHO), 'casos/antigo')));
  await assertSucceeds(getDoc(doc(db('u-antiga', ANTIGA), 'casos/antigo')));
  await assertFails(updateDoc(doc(db('u-x', ESTRANHO), 'casos/antigo'), { dono: ESTRANHO, emails: [ESTRANHO], editores: [ESTRANHO] }));
  await assertSucceeds(updateDoc(doc(db('u-antiga', ANTIGA), 'casos/antigo'), { dono: ANTIGA, emails: [ANTIGA], editores: [ANTIGA], compartilhamentos: [] }));
});
test('config: leitura só das contas antigas; ninguém grava', async () => {
  await assertSucceeds(getDoc(doc(db('u-antiga', ANTIGA), 'config/peritos')));
  await assertFails(getDoc(doc(db('u-x', ESTRANHO), 'config/peritos')));
  await assertFails(setDoc(doc(db('u-antiga', ANTIGA), 'config/peritos'), { x: 2 }));
});
const erro = (email, extra = {}) => ({ tipo: 'erro', msg: 'x is not a function', origem: 'index.html:1:2', pilha: 'at f', secao: 'visao', navegador: 'Chrome', versao: '2026.10.15', email, quando: serverTimestamp(), chave: 'r1', ...extra });
const ADM = 'rodrigodosantosmiranda@gmail.com';
const google = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();
const senha = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
test('erros: cada conta registra o próprio, com id e horário do servidor', async () => {
  const f = db('u-x', ESTRANHO);
  await assertSucceeds(setDoc(doc(f, 'erros/u-x_r1'), erro(ESTRANHO)));
  await assertFails(setDoc(doc(f, 'erros/u-x_r1'), erro(ESTRANHO, { msg: 'de novo' })));
  await assertFails(setDoc(doc(f, 'erros/u-x_r2'), erro(DONO, { chave: 'r2' })));
  await assertFails(setDoc(doc(f, 'erros/outro_r3'), erro(ESTRANHO, { chave: 'r3' })));
  await assertFails(setDoc(doc(f, 'erros/u-x___proto__'), erro(ESTRANHO, { chave: '__proto__' })));
  await assertFails(setDoc(doc(f, 'erros/u-x_r4'), erro(ESTRANHO, { chave: 'r4', quando: '9999-01-01' })));
  await assertFails(setDoc(doc(f, 'erros/u-x_r5'), erro(ESTRANHO, { chave: 'r5', msg: 'x'.repeat(600) })));
  await assertFails(setDoc(doc(f, 'erros/u-x_r6'), erro(ESTRANHO, { chave: 'r6', extra: 1 })));
  await assertFails(setDoc(doc(f, 'erros/u-x_r7'), erro(ESTRANHO, { chave: 'r7', tipo: 'outro' })));
  await assertFails(setDoc(doc(db('u-y', 'naoconfirmado@exemplo.com', false), 'erros/u-y_r1'), erro('naoconfirmado@exemplo.com')));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'erros/x_r1'), erro('')));
});
test('erros: só administradores pelo Google leem e apagam', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'erros/u-x_r9'), { msg: 'x', chave: 'r9' }); });
  await assertFails(getDocs(collection(db('u-x', ESTRANHO), 'erros')));
  await assertFails(deleteDoc(doc(db('u-x', ESTRANHO), 'erros/u-x_r9')));
  await assertFails(getDocs(collection(db('u-p', 'periciamiranda@gmail.com'), 'erros')));
  await assertFails(getDocs(collection(senha('u-adm', ADM), 'erros')));
  await assertSucceeds(getDocs(collection(google('u-adm', ADM), 'erros')));
  await assertSucceeds(getDocs(collection(google('u-j', ANTIGA), 'erros')));
  await assertSucceeds(deleteDoc(doc(google('u-adm', ADM), 'erros/u-x_r9')));
});
const contato = (extra = {}) => ({ email: 'maria@exemplo.com', nome: 'Maria', cidade: 'Goiânia', origem: 'lista', status: 'novo', convite: 'abc123', criadoEm: '2026-10-15T10:00:00Z', notas: '', ...extra });
test('comercial: só administradores pelo Google leem e gravam contatos', async () => {
  const adm = google('u-adm', ADM);
  await assertSucceeds(setDoc(doc(adm, 'comercial/r1abc'), contato()));
  await assertSucceeds(getDocs(collection(adm, 'comercial')));
  await assertSucceeds(updateDoc(doc(adm, 'comercial/r1abc'), { status: 'convidado', enviadoEm: '2026-10-15T11:00:00Z' }));
  await assertFails(setDoc(doc(adm, 'comercial/r2abc'), contato({ status: 'vip' })));
  await assertFails(setDoc(doc(adm, 'comercial/r3abc'), contato({ convite: 'A/B' })));
  await assertFails(setDoc(doc(adm, 'comercial/r4abc'), contato({ extra: 1 })));
  await assertFails(setDoc(doc(adm, 'comercial/__proto__'), contato()));
  await assertFails(getDocs(collection(senha('u-adm', ADM), 'comercial')));
  await assertFails(getDocs(collection(db('u-x', ESTRANHO), 'comercial')));
  await assertFails(setDoc(doc(db('u-x', ESTRANHO), 'comercial/r5abc'), contato()));
  await assertSucceeds(deleteDoc(doc(adm, 'comercial/r1abc')));
});
test('conversoes: a própria conta registra uma vez; só administradores leem', async () => {
  const f = db('u-x', ESTRANHO);
  const conv = (extra = {}) => ({ convite: 'abc123', email: ESTRANHO, quando: serverTimestamp(), ...extra });
  await assertFails(setDoc(doc(f, 'conversoes/outro'), conv()));
  await assertFails(setDoc(doc(f, 'conversoes/u-x'), conv({ email: DONO })));
  await assertFails(setDoc(doc(f, 'conversoes/u-x'), conv({ quando: '2020-01-01' })));
  await assertFails(setDoc(doc(f, 'conversoes/u-x'), conv({ convite: '<b>' })));
  await assertFails(setDoc(doc(db('u-y', 'naoconfirmado@exemplo.com', false), 'conversoes/u-y'), conv({ email: 'naoconfirmado@exemplo.com' })));
  await assertSucceeds(setDoc(doc(f, 'conversoes/u-x'), conv()));
  await assertFails(setDoc(doc(f, 'conversoes/u-x'), conv({ convite: 'outro12' })));
  await assertFails(getDoc(doc(f, 'conversoes/u-x')));
  await assertSucceeds(getDocs(collection(google('u-adm', ADM), 'conversoes')));
});
test('coleções não previstas ficam fechadas', async () => {
  await assertFails(setDoc(doc(db('u-x', ESTRANHO), 'qualquer/coisa'), { a: 1 }));
  await assertFails(getDoc(doc(db('u-dona', DONO), 'qualquer/coisa')));
});

// ---------------- Storage ----------------
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49]);
test('arquivos: membro lê, estranho não', async () => {
  await assertSucceeds(getBytes(ref(st('u-leitor', LEITOR), 'casos/c1/documentos/d1/peticao.pdf')));
  await assertFails(getBytes(ref(st('u-x', ESTRANHO), 'casos/c1/documentos/d1/peticao.pdf')));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'casos/c1/documentos/d1/peticao.pdf')));
});
test('arquivos: editor envia PDF; leitor e estranho não', async () => {
  await assertSucceeds(uploadBytes(ref(st('u-editor', EDITOR), 'casos/c1/documentos/d2/laudo.pdf'), PDF, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(st('u-leitor', LEITOR), 'casos/c1/documentos/d2/laudo.pdf'), PDF, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(st('u-x', ESTRANHO), 'casos/c1/documentos/d2/laudo.pdf'), PDF, { contentType: 'application/pdf' }));
});
test('arquivos: HTML e SVG são recusados', async () => {
  const f = st('u-editor', EDITOR);
  await assertFails(uploadBytes(ref(f, 'casos/c1/documentos/d2/pagina.html'), new Uint8Array([60]), { contentType: 'text/html' }));
  await assertFails(uploadBytes(ref(f, 'casos/c1/documentos/d2/img.svg'), new Uint8Array([60]), { contentType: 'image/svg+xml' }));
});
test('arquivos: só o editor apaga; fora de casos/ é fechado', async () => {
  await assertFails(deleteObject(ref(st('u-leitor', LEITOR), 'casos/c1/documentos/d1/peticao.pdf')));
  await assertSucceeds(deleteObject(ref(st('u-editor', EDITOR), 'casos/c1/documentos/d1/peticao.pdf')));
  await assertFails(uploadBytes(ref(st('u-dona', DONO), 'publico/x.pdf'), PDF, { contentType: 'application/pdf' }));
});
