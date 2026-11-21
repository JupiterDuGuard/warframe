// Ссылка на билд: состояние -> JSON -> deflate (CompressionStream, если есть) -> base64url в «#b=…».
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeBuild(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try { return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { /* старый браузер */ }
  }
  return 'j' + b64url(raw);
}

export async function decodeBuild(code) {
  const kind = code[0], bytes = fromB64url(code.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
