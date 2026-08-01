// Offline PIN recovery ("PİN'imi unuttum"): security questions + a recovery code.
// All crypto reuses pin.js's PBKDF2 (hashPin) so answers/codes are stored ONLY as
// salted hashes — never plaintext. No network; everything lives in the meta table.
import { genSaltHex, hashPin, lockoutMs } from './pin.js';
import { getMeta, setMeta, withTx } from './repo.js';

// --- normalization ----------------------------------------------------------

// Security-answer normalization. Mirrors importer.normKey's Turkish I-family fold
// (dotted İ, dotless I/ı, ascii I → plain 'i' BEFORE lowercasing) so an answer
// typed with any I-variant / casing / stray whitespace still matches. Internal
// whitespace is collapsed to a single space so "  İlk   Okulum " == "ilk okulum".
export function normalizeAnswer(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[İIıi]/g, 'i')
    .toLocaleLowerCase('tr');
}

export function hashAnswer(answer, saltHex) {
  return hashPin(normalizeAnswer(answer), saltHex);
}

// --- recovery code ----------------------------------------------------------

// Unambiguous alphabet: uppercase letters minus I, O, L, digits minus 0, 1 — the
// characters people confuse when transcribing by hand. 31 symbols.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 12; // ~59.5 bits of entropy (12 * log2(31))

// Cryptographically random 12-char code, grouped as XXXX-XXXX-XXXX for legibility.
// Rejection sampling (drop bytes in the biased tail) keeps every symbol equally
// likely even though 256 is not a multiple of 31.
export function genRecoveryCode() {
  const N = CODE_ALPHABET.length;
  const limit = Math.floor(256 / N) * N; // 248 for N=31: bytes >= 248 are rejected
  const pick = () => {
    const b = new Uint8Array(1);
    do { globalThis.crypto.getRandomValues(b); } while (b[0] >= limit);
    return CODE_ALPHABET[b[0] % N];
  };
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += pick();
  }
  return out;
}

// Fold user input to canonical form: uppercase, strip everything but A-Z0-9, so
// "xxxx xxxx xxxx", lowercased, or with/without dashes all compare equal.
export function normalizeCode(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashCode(code, saltHex) {
  return hashPin(normalizeCode(code), saltHex);
}

// --- security questions (repo) ----------------------------------------------

// setSecurityQuestions(x, [{q,a},{q,a}]) — exactly two questions. Each answer gets
// its own salt; only q + salt + hash are stored (answer plaintext never touches disk).
export async function setSecurityQuestions(x, pairs) {
  if (!Array.isArray(pairs) || pairs.length !== 2) throw new Error('İki güvenlik sorusu gerekli.');
  const prepared = pairs.map(({ q, a }) => {
    if (!q || !String(q).trim()) throw new Error('Güvenlik sorusu boş olamaz.');
    if (!a || !String(a).trim()) throw new Error('Güvenlik yanıtı boş olamaz.');
    return { q: String(q).trim(), a, salt: genSaltHex() };
  });
  const hashes = await Promise.all(prepared.map(p => hashAnswer(p.a, p.salt)));
  return withTx(x, async () => {
    for (let i = 0; i < prepared.length; i++) {
      const n = i + 1;
      await setMeta(x, `sq${n}_q`, prepared[i].q);
      await setMeta(x, `sq${n}_salt`, prepared[i].salt);
      await setMeta(x, `sq${n}_hash`, hashes[i]);
    }
  });
}

// True only if BOTH answers match their stored hashes. Any missing config => false.
export async function verifySecurityAnswers(x, answers) {
  if (!Array.isArray(answers) || answers.length !== 2) return false;
  for (let i = 0; i < 2; i++) {
    const n = i + 1;
    const salt = await getMeta(x, `sq${n}_salt`);
    const hash = await getMeta(x, `sq${n}_hash`);
    if (!salt || !hash) return false;
    if ((await hashAnswer(answers[i], salt)) !== hash) return false;
  }
  return true;
}

// --- recovery code (repo) ---------------------------------------------------

// Generates a code, stores rc_salt + rc_hash, and RETURNS the plaintext once so the
// caller can display it. The code itself is never persisted.
export async function setRecoveryCode(x) {
  const code = genRecoveryCode();
  const salt = genSaltHex();
  const hash = await hashCode(code, salt);
  await withTx(x, async () => {
    await setMeta(x, 'rc_salt', salt);
    await setMeta(x, 'rc_hash', hash);
  });
  return code;
}

export async function verifyRecoveryCode(x, code) {
  const salt = await getMeta(x, 'rc_salt');
  const hash = await getMeta(x, 'rc_hash');
  if (!salt || !hash) return false;
  return (await hashCode(code, salt)) === hash;
}

// --- status -----------------------------------------------------------------

export async function getRecoveryStatus(x) {
  const [sq1, sq2, rc] = await Promise.all([
    getMeta(x, 'sq1_hash'), getMeta(x, 'sq2_hash'), getMeta(x, 'rc_hash'),
  ]);
  return { questions: !!(sq1 && sq2), code: !!rc };
}

export async function hasRecoverySetup(x) {
  const s = await getRecoveryStatus(x);
  return s.questions || s.code;
}

// --- rate limiting ----------------------------------------------------------
// Recovery attempts use their OWN counter (recovery_fail / recovery_locked_until)
// so recovery can never reset — nor be reset by — the main PIN lockout. Same
// lockoutMs curve as PIN entry: 5 wrong attempts => 30s lock.

export async function getRecoveryFailState(x) {
  const failCount = Number((await getMeta(x, 'recovery_fail')) || '0');
  const lockedUntil = Number((await getMeta(x, 'recovery_locked_until')) || '0');
  return { failCount, lockedUntil };
}

export async function bumpRecoveryFail(x, now = Date.now()) {
  const { failCount } = await getRecoveryFailState(x);
  const fc = failCount + 1;
  const ms = lockoutMs(fc);
  const lockedUntil = ms ? now + ms : 0;
  await setMeta(x, 'recovery_fail', String(fc));
  await setMeta(x, 'recovery_locked_until', String(lockedUntil));
  return { failCount: fc, lockedUntil, lockMs: ms };
}

export async function clearRecoveryFail(x) {
  await setMeta(x, 'recovery_fail', '0');
  await setMeta(x, 'recovery_locked_until', '0');
}

// --- reset ------------------------------------------------------------------

// Sets a new PIN and clears BOTH the PIN and recovery lockout counters. The caller
// MUST have verified a recovery method first — this function does not itself check
// any recovery answer/code. PIN format matches lock.js (4-6 digits).
export async function resetPinAfterRecovery(x, newPin) {
  if (!/^\d{4,6}$/.test(String(newPin))) throw new Error('PIN 4-6 rakam olmalı.');
  const salt = genSaltHex();
  const hash = await hashPin(newPin, salt);
  return withTx(x, async () => {
    await setMeta(x, 'pin_salt', salt);
    await setMeta(x, 'pin_hash', hash);
    await setMeta(x, 'fail_count', '0');
    await setMeta(x, 'locked_until', '0');
    await setMeta(x, 'recovery_fail', '0');
    await setMeta(x, 'recovery_locked_until', '0');
  });
}
