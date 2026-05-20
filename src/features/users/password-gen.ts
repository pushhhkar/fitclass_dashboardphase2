/**
 * Cryptographically strong random password generator.
 *
 * Used by the admin "create user" + "reset password" flows. The plaintext is
 * returned ONCE in the API response so the admin can share it out-of-band;
 * the server stores only the bcrypt hash.
 *
 * Constraints chosen to satisfy reasonable enterprise complexity rules
 * (lower + upper + digit + symbol, length 16). `crypto.getRandomValues` is
 * globally available on both Node 20+ and the Edge runtime — no platform
 * branching needed.
 */
const ALPHABET = {
  lower: 'abcdefghijkmnpqrstuvwxyz',  // omits l, o for readability
  upper: 'ABCDEFGHJKMNPQRSTUVWXYZ',   // omits I, L, O
  digit: '23456789',                  // omits 0, 1
  symbol: '!@#$%^&*?-_',
} as const;

const ALL = ALPHABET.lower + ALPHABET.upper + ALPHABET.digit + ALPHABET.symbol;

function pickFrom(set: string, rand: Uint32Array, index: number): string {
  return set.charAt(rand[index] % set.length);
}

export function generateTemporaryPassword(length = 16): string {
  if (length < 8) throw new Error('Password length too short');
  const rand = new Uint32Array(length);
  crypto.getRandomValues(rand);

  // Guarantee at least one of each category, then fill the rest randomly.
  const required = [
    pickFrom(ALPHABET.lower, rand, 0),
    pickFrom(ALPHABET.upper, rand, 1),
    pickFrom(ALPHABET.digit, rand, 2),
    pickFrom(ALPHABET.symbol, rand, 3),
  ];
  const remainder: string[] = [];
  for (let i = required.length; i < length; i++) {
    remainder.push(pickFrom(ALL, rand, i));
  }

  // Shuffle the required slots into the remainder so the category positions
  // aren't predictable (Fisher–Yates with the existing random pool).
  const chars = [...required, ...remainder];
  const shuffle = new Uint32Array(chars.length);
  crypto.getRandomValues(shuffle);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}
