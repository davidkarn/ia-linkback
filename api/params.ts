import { BadRequestException } from '@nestjs/common';

// Parse an optional integer query parameter, enforcing the bounds declared in api.yaml.
export const int_param = (name: string, raw: unknown, fallback: number, min: number, max: number): number => {
  if (raw === undefined || raw === '') {return fallback;}
  const n = typeof raw === 'string' && /^-?\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(`${ name } must be an integer between ${ min } and ${ max }`);
  }
  return n;
};

// Parse an optional integer query parameter: undefined when it is not given
export const optional_int_param = (
  name: string, raw: unknown, min: number, max: number
): number | undefined => (
  raw === undefined || raw === '' ? undefined : int_param(name, raw, min, min, max)
);

// Parse a bigserial id path parameter, kept as a string (as the pg driver returns int8)
export const id_param = (name: string, raw: string): string => {
  if (!/^[1-9]\d{0,17}$/.test(raw)) {
    throw new BadRequestException(`${ name } must be a positive integer id`);
  }
  else {
    return raw;
  }
};

export const string_param = (name: string, raw: unknown): string | undefined => {
  if (raw === undefined) {return undefined;}
  if (typeof raw !== 'string') {throw new BadRequestException(`${ name } must be a single string`);}
  return raw;
};

// offset / length, with the defaults and bounds declared in api.yaml (shared by the paged endpoints).
export const paging_params = (offset: unknown, length: unknown) => ({
  offset: int_param('offset', offset, 0, 0, 10000),
  length: int_param('length', length, 20, 1, 100),
});
