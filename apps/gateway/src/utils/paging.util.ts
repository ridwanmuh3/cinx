import { BadRequestException } from '@nestjs/common';

export function toPositiveInt(
  value: unknown,
  min: number,
  max: number,
): number {
  const n =
    typeof value === 'string'
      ? Number(value)
      : Array.isArray(value)
        ? NaN
        : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new BadRequestException(`Expected integer between ${min} and ${max}`);
  }
  return n;
}
