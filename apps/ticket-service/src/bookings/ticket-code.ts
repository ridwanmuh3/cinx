import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Generate a ticket code like TKT-XXXXXX (unambiguous alphabet, no 0/O/1/I). */
export function generateTicketCode(): string {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `TKT-${suffix}`;
}
