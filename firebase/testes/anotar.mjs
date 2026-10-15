// Repórter do node:test que vira anotação do GitHub Actions (aparece no resumo da execução).
export default async function* anotar(fonte) {
  let ok = 0, falhas = 0;
  for await (const ev of fonte) {
    if (ev.type === 'test:pass' && ev.data.details?.type !== 'suite') { ok++; yield `ok  ${ev.data.name}\n`; }
    if (ev.type === 'test:fail') {
      falhas++;
      const e = ev.data.details?.error;
      const msg = String((e && (e.cause?.message || e.message)) || e || 'falhou').replace(/\r?\n/g, ' ').slice(0, 900);
      yield `FALHOU  ${ev.data.name}: ${msg}\n`;
      yield `::error title=${ev.data.name.replace(/[,:]/g, ' ')}::${msg}\n`;
    }
  }
  yield `\n${ok} passaram, ${falhas} falharam\n`;
  yield `::notice title=Regras do Firebase::${ok} passaram, ${falhas} falharam\n`;
}
