# App Android (Play Store)

O app é uma **Trusted Web Activity**: abre o próprio site (https://gerenciadorpericias.com.br/?origem=android)
em tela cheia, pelo Chrome do celular. Atualizar o site atualiza o app; só é preciso mandar uma versão nova
para a Play Store quando mudar o ícone, o nome ou esta pasta.

- Pacote: `br.com.gerenciadorpericias.app`
- Gerado por `gerar.mjs` (Bubblewrap) a partir de `twa-manifest.json`, no workflow **App Android**
  (`.github/workflows/android.yml`). Roda sozinho quando esta pasta muda, ou em Actions > App Android > Run workflow.
- O resultado fica em Actions > (a execução) > Artifacts > `app-android-N`: `gerenciador-pericia.aab` (Play Store)
  e o `.apk` (instalar direto no celular para testar).

## Segredos do GitHub (Settings > Secrets and variables > Actions)

| Nome | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | o texto do arquivo `upload.jks.b64.txt` (a chave de upload em base64) |
| `ANDROID_KEYSTORE_SENHA` | a senha da chave |

Sem eles, o workflow gera só um APK de teste (debug). **Guarde a chave e a senha fora do GitHub também**:
sem elas não dá para mandar atualizações (dá para pedir a troca da chave de upload ao Google, mas demora).

## Verificação do domínio (assetlinks)

`.well-known/assetlinks.json` diz ao Android que o app e o site são do mesmo dono (sem isso, aparece a barra de
endereço do Chrome no topo do app). Ele precisa ter **duas** impressões digitais SHA-256:

1. a da chave de upload (já está lá);
2. a da **chave de assinatura do Google Play**: Play Console > o app > Testar e lançar > Configuração >
   Integridade do app > Assinatura de apps > "Certificado da chave de assinatura do app" > SHA-256.
   Copie e acrescente na lista `sha256_cert_fingerprints`.

O `_config.yml` na raiz faz o GitHub Pages publicar a pasta `.well-known`.

## Pagamento dentro do app

Pela política de pagamentos do Google Play, o app é **só de consumo**: com `?origem=android`, o site esconde
os planos, os preços, o botão de assinar e o Mercado Pago (`APP_ANDROID` no index.html). A pessoa assina pelo
site e entra no app com o mesmo e-mail. Para vender dentro do app seria preciso o Google Play Billing (ou um
programa de faturamento alternativo, se o Brasil for incluído).

## Versão

`versionCode` = número da execução do workflow (sobe sozinho). `versionName` vem do campo "versao" ao rodar
o workflow à mão (padrão 1.0.0).
