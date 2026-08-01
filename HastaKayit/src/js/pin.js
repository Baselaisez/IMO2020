const subtle = globalThis.crypto.subtle;

export function genSaltHex() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// NOT: iterasyon sayısı hash ile birlikte saklanmıyor — varsayılanı değiştirmek
// mevcut kurulumları migrasyonsuz bozar.
export async function hashPin(pin, saltHex, iterations = 100000) {
  if (!/^[0-9a-fA-F]+$/.test(saltHex) || saltHex.length % 2 !== 0) throw new Error('Geçersiz salt.');
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin, saltHex, expectedHash) {
  if (!saltHex || !expectedHash) return false;
  return (await hashPin(pin, saltHex)) === expectedHash;
}

export function lockoutMs(failCount) {
  return failCount >= 5 ? 30000 : 0;
}
