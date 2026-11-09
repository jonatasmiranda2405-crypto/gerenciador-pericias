// Barra e-mails que não são de verdade antes de falar com o servidor (teste grátis e assinatura).
// As mesmas listas estão no Apps Script (Code.gs), que também confere se o domínio recebe e-mail (MX).
const DOMINIOS_FALSOS = ['example.com', 'example.net', 'example.org', 'exemplo.com', 'exemplo.com.br', 'exemplo.br',
  'teste.com', 'teste.com.br', 'test.com', 'testes.com', 'email.teste', 'dominio.com', 'dominio.com.br', 'seudominio.com',
  'seuemail.com', 'meuemail.com', 'empresa.com', 'fake.com', 'falso.com', 'nada.com', 'xxx.com', 'abc.com', 'asd.com',
  'qwe.com', 'aaa.com', 'a.com', 'b.com', 'x.com.br', 'localhost'];
const SUFIXOS_FALSOS = ['.example', '.test', '.teste', '.invalid', '.localhost', '.local', '.lan', '.internal', '.exemplo'];
const DESCARTAVEIS = ['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net', '10minemail.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'tempr.email', 'tmpmail.org', 'tmpmail.net',
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'trashmail.com', 'trashmail.de', 'trashmail.net',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'mohmal.com',
  'fakeinbox.com', 'throwawaymail.com', 'emailondeck.com', 'getairmail.com', 'mailcatch.com', 'mytemp.email', 'tempinbox.com',
  'burnermail.io', 'inboxkitten.com', 'mail.tm', 'mail.gw', 'emailfake.com', 'fakemail.net', 'luxusmail.org', 'moakt.com',
  'spambox.us', 'spamgourmet.com', 'mailpoof.com', 'discard.email', 'harakirimail.com', 'linshiyouxiang.net', 'byom.de',
  'trbvm.com', 'dropmail.me', '1secmail.com', '1secmail.net', '1secmail.org', 'emltmp.com', 'tmail.ws', 'tempail.com'];
const DIGITACAO = {'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.com.br': 'gmail.com',
  'hotmail.co': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yahoo.con': 'yahoo.com', 'yaho.com.br': 'yahoo.com.br',
  'icloud.con': 'icloud.com'};

// Devolve "" quando o e-mail serve, ou a mensagem para mostrar.
function emailFalso(email) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[a-z0-9._%+'-]{1,64}@([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(email) || email.length > 120) return "Informe um e-mail válido.";
  const dominio = email.split("@")[1];
  if (DIGITACAO[dominio]) return "Confira o e-mail: você quis dizer @" + DIGITACAO[dominio] + "?";
  if (DOMINIOS_FALSOS.includes(dominio) || SUFIXOS_FALSOS.some((s) => dominio.endsWith(s)) || /^(exemplo|example|teste|test|fake|falso)\./.test(dominio))
    return "Use o seu e-mail de verdade (Gmail, Outlook, o do escritório…). E-mails de exemplo ou de teste não são aceitos.";
  if (DESCARTAVEIS.includes(dominio)) return "E-mails temporários ou descartáveis não são aceitos. Use o seu e-mail pessoal ou do escritório.";
  return "";
}
