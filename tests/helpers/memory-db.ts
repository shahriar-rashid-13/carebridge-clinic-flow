import type { Query, Result } from "./supabase";

export type Row = Record<string, unknown>;

const matches = (row: Row, query: Query) =>
  query.filters.every(({ method, args }) => {
    const [column, value] = args as [string, unknown];
    if (method === "eq") return row[column] === value;
    if (method === "neq") return row[column] !== value;
    if (method === "in") return (value as unknown[]).includes(row[column]);
    if (method === "gte") return String(row[column]) >= String(value);
    if (method === "lte") return String(row[column]) <= String(value);
    if (method === "is") return row[column] === value;
    return true;
  });

/**
 * Tiny in-memory table store that answers fake Supabase queries.
 * Supports eq/neq/in/gte/lte/is filters; other filters are ignored.
 */
export function memoryDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = structuredClone(initial);
  let nextId = 1;

  const handler = (query: Query): Result => {
    const rows = (tables[query.table] ??= []);
    let data: Row[];

    if (query.op === "insert" || query.op === "upsert") {
      const items = (Array.isArray(query.payload) ? query.payload : [query.payload]) as Row[];
      data = items.map((item) => ({
        id: `${query.table}-${nextId++}`,
        created_at: "2026-09-29T10:00:00.000Z",
        ...item,
      }));
      rows.push(...data);
    } else if (query.op === "update") {
      data = rows.filter((row) => matches(row, query));
      for (const row of data) Object.assign(row, query.payload);
    } else if (query.op === "delete") {
      data = rows.filter((row) => matches(row, query));
      tables[query.table] = rows.filter((row) => !data.includes(row));
    } else {
      data = rows.filter((row) => matches(row, query));
    }

    data = data.map((row) => ({ ...row }));

    if (query.single || query.maybeSingle) {
      const first = data[0] ?? null;
      if (!first && query.single) {
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
          },
        };
      }
      return { data: first };
    }
    return { data, count: data.length };
  };

  return { tables, handler };
}
