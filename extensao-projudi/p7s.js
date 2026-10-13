// Extrai o PDF de dentro de um arquivo .p7s (assinatura CMS/PKCS#7 "attached").
// O PDF fica no eContent da assinatura, como OCTET STRING — às vezes partida em pedaços
// (codificação BER indefinida). Percorre a estrutura ASN.1 e junta os pedaços.
// Devolve Uint8Array do PDF, ou null se não achar.
function pdfDeP7s(bytes) {
  const ehPdf = (u) => u.length > 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
  if (ehPdf(bytes)) return bytes;

  // Lê um elemento ASN.1 em pos; devolve { tag, construido, ini, fim, prox, indef }
  function ler(pos, limite) {
    if (pos + 2 > limite) return null;
    const tag = bytes[pos];
    const construido = (tag & 0x20) !== 0;
    let p = pos + 1;
    if ((tag & 0x1f) === 0x1f) { while (p < limite && bytes[p] & 0x80) p++; p++; } // tag longa
    let len = bytes[p++];
    let indef = false;
    if (len === 0x80) { indef = true; len = -1; }
    else if (len & 0x80) {
      const n = len & 0x7f; if (n > 4) return null;
      len = 0; for (let i = 0; i < n; i++) len = len * 256 + bytes[p++];
    }
    const ini = p;
    if (indef) return { tag, construido, ini, fim: -1, indef: true };
    const fim = ini + len;
    if (fim > limite) return null;
    return { tag, construido, ini, fim, prox: fim, indef: false };
  }

  // Conteúdo de uma OCTET STRING (primitiva ou construída) como lista de pedaços.
  function octetos(el, limite, saida) {
    if (!el.construido) { saida.push(bytes.subarray(el.ini, el.fim)); return el.fim; }
    let p = el.ini;
    const fimMax = el.indef ? limite : el.fim;
    while (p < fimMax) {
      if (el.indef && bytes[p] === 0 && bytes[p + 1] === 0) return p + 2;
      const f = ler(p, fimMax); if (!f) return fimMax;
      p = octetos(f, fimMax, saida);
    }
    return p;
  }

  let achado = null;
  // Percorre a árvore procurando a primeira OCTET STRING (tag 0x04 / 0x24) que comece com %PDF.
  function andar(p, limite, prof) {
    while (p < limite && !achado && prof < 40) {
      if (bytes[p] === 0 && bytes[p + 1] === 0) return p + 2; // fim de conteúdo indefinido
      const el = ler(p, limite); if (!el) return limite;
      if ((el.tag & 0x1f) === 0x04) {
        const pedacos = [];
        const fim = octetos(el, limite, pedacos);
        const total = pedacos.reduce((s, x) => s + x.length, 0);
        if (total > 4 && ehPdf(pedacos[0].length >= 4 ? pedacos[0] : juntar(pedacos))) { achado = juntar(pedacos); return fim; }
        p = fim; continue;
      }
      if (el.construido) {
        const fim = andar(el.ini, el.indef ? limite : el.fim, prof + 1);
        p = el.indef ? fim : el.fim;
      } else {
        p = el.fim;
      }
    }
    return p;
  }
  function juntar(lista) {
    const out = new Uint8Array(lista.reduce((s, x) => s + x.length, 0));
    let o = 0; for (const x of lista) { out.set(x, o); o += x.length; }
    return out;
  }

  try { andar(0, bytes.length, 0); } catch (_) {}
  if (achado) return achado;

  // Último recurso: o PDF costuma estar inteiro (não partido) — recorta de %PDF até o último %%EOF.
  const txt = new TextDecoder("latin1").decode(bytes);
  const a = txt.indexOf("%PDF-");
  const b = txt.lastIndexOf("%%EOF");
  if (a >= 0 && b > a) return bytes.slice(a, b + 5);
  return null;
}
if (typeof module !== "undefined") module.exports = { pdfDeP7s };
