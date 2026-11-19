/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic Prisma test boundary only. */
// Simula apenas a fronteira Prisma; execução/claim/retries são os serviços reais.
export function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, v]: [string, any]) => {
    if (key === "OR") return v.some((w: any) => matches(row, w));
    if (key === "AND") return v.every((w: any) => matches(row, w));
    const actual = row[key] ?? null;
    if (v && typeof v === "object" && !(v instanceof Date)) {
      return Object.entries(v).every(([op, expected]: [string, any]) => {
        if (op === "in") return expected.includes(actual);
        if (op === "lt") return actual !== null && actual < expected;
        if (op === "lte") return actual !== null && actual <= expected;
        if (op === "gt") return actual !== null && actual > expected;
        if (op === "gte") return actual !== null && actual >= expected;
        throw new Error(`Mock não suporta operador ${op}`);
      });
    }
    return actual === v;
  });
}
export function apply(row: any, data: any) {
  for (const [key, value] of Object.entries(data) as any) {
    row[key] = value?.increment !== undefined ? (row[key] ?? 0) + value.increment : value;
  }
}
