/* Gera o projeto Android (Trusted Web Activity) do Gerenciador de Perícia a partir de twa-manifest.json.
   Roda no GitHub Actions (workflow "App Android"). Uso: node gerar.mjs <pasta-de-saida>
   Variáveis opcionais:
     ICONES_BASE   troca https://gerenciadorpericias.com.br pelos ícones servidos de outro lugar (ex.: a cópia local do repositório)
     VERSAO_CODIGO versionCode do Android (precisa subir a cada envio para a Play Store)
     VERSAO_NOME   versionName mostrado na loja (ex.: 1.0.3)
     PF_KEYSTORE   caminho da chave de upload; com ela, o build release sai assinado */
import fs from 'node:fs';
import path from 'node:path';
import {TwaManifest, TwaGenerator, ConsoleLog} from '@bubblewrap/core';

const saida = path.resolve(process.argv[2] || 'projeto');
const aqui = path.dirname(new URL(import.meta.url).pathname);
const json = JSON.parse(fs.readFileSync(path.join(aqui, 'twa-manifest.json'), 'utf8'));
if(process.env.ICONES_BASE){
  for(const k of ['iconUrl', 'maskableIconUrl']) json[k] = json[k].replace('https://gerenciadorpericias.com.br', process.env.ICONES_BASE);
}
if(process.env.VERSAO_CODIGO) json.appVersionCode = Number(process.env.VERSAO_CODIGO);
if(process.env.VERSAO_NOME) json.appVersionName = process.env.VERSAO_NOME;

const manifesto = new TwaManifest(json);
const erro = manifesto.validate ? manifesto.validate() : null;
if(erro) throw new Error('twa-manifest.json: ' + erro);
fs.rmSync(saida, {recursive: true, force: true});
fs.mkdirSync(saida, {recursive: true});
await new TwaGenerator().createTwaProject(saida, manifesto, new ConsoleLog('gerar'));

/* jcenter() está desativado: usa o Maven Central */
for(const f of ['build.gradle', 'app/build.gradle']){
  const p = path.join(saida, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/jcenter\(\)/g, 'mavenCentral()'));
}
/* assinatura do release com a chave de upload (os segredos ficam só no GitHub) */
if(process.env.PF_KEYSTORE){
  fs.appendFileSync(path.join(saida, 'app/build.gradle'), `
android {
    signingConfigs {
        upload {
            storeFile file(System.getenv('PF_KEYSTORE'))
            storePassword System.getenv('PF_SENHA')
            keyAlias 'upload'
            keyPassword System.getenv('PF_SENHA')
        }
    }
    buildTypes { release { signingConfig signingConfigs.upload } }
}
`);
}
fs.chmodSync(path.join(saida, 'gradlew'), 0o755);
console.log('Projeto Android gerado em', saida, '· versão', json.appVersionName, '(' + json.appVersionCode + ')');
