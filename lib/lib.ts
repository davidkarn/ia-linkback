import util from 'util';

export function assertCond(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? "Assertion Failed");
  }
};

export const arrayToMapOfRecords = <T, KeyType extends keyof T>(
  arr: T[], keyField: KeyType
): Map<T[KeyType], T[]> => {
  const result = new Map<T[KeyType], T[]>();

  arr.forEach((obj: T) => {
    const existing = result.get(obj[keyField]) ?? [];
    result.set(obj[keyField], existing.concat(obj));
  });

  return result;
};

export const log = (...items: unknown[]) => console.log(util.inspect(items, { depth: null }));

export const unique = <T>(arr: T[]) => [...new Set(arr)];
