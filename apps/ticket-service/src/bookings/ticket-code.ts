import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 8 chars over a 32-symbol alphabet ≈ 2^40 (1.1e12) combinations. The
// /tickets/:code lookup is public (door-scan), so the code is the bearer
// secret: 6 chars (2^30) is brute-forceable at scale; 8 is not.
const CODE_LENGTH = 8;

/** Generate a ticket code like TKT-XXXXXX (unambiguous alphabet, no 0/O/1/I). */
export function generateTicketCode(): string {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `TKT-${suffix}`;
}
