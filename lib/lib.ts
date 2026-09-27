export function assertCond(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? "Assertion Failed");
  }
};

export const arrayToMapOfRecords = <T, KeyType extends keyof ValueType>(
  arr: T[], keyField: string
): Map<T[KeyType], T[]> => {
  const result = new Map<T[KeyType], T[]>();

  arr.forEach((obj) => {
    const existing = result.get(obj[keyField]) ?? [];
    result.set(obj[keyField], existing.concat(obj));
  });

  return result;
};
