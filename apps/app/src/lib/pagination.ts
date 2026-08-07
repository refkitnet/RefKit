import { and, desc, eq, lt, or, SQL } from "drizzle-orm";
import { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";

export const DEFAULT_LIST_LIMIT = 25;
export const MAX_LIST_LIMIT = 100;

export type ListParams = {
  limit?: number;
  startingAfter?: string;
};

export type ListResult<T> = {
  data: T[];
  hasMore: boolean;
};

export function parseListParams(
  searchParams: URLSearchParams
): ListParams {
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : DEFAULT_LIST_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new AppError(
      "invalid_request",
      "invalid_limit",
      `Limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`,
      400
    );
  }

  const startingAfter = searchParams.get("starting_after") ?? undefined;

  return {
    limit,
    startingAfter,
  };
}

type CursorColumns = {
  id: PgColumn;
  createdAt: PgColumn;
};

export async function listWithCursor<T>({
  table,
  columns,
  where,
  limit,
  startingAfter,
}: {
  table: PgTable;
  columns: CursorColumns;
  where?: SQL;
  limit: number;
  startingAfter?: string;
}): Promise<ListResult<T>> {
  const db = getDb();
  const conditions: SQL[] = [];

  if (where) {
    conditions.push(where);
  }

  if (startingAfter) {
    const [cursor] = await db
      .select({
        id: columns.id,
        createdAt: columns.createdAt,
      })
      .from(table)
      .where(
        where
          ? and(where, eq(columns.id, startingAfter))
          : eq(columns.id, startingAfter)
      )
      .limit(1);

    if (!cursor) {
      throw new AppError(
        "invalid_request",
        "invalid_starting_after",
        "Invalid starting_after cursor.",
        400
      );
    }

    conditions.push(
      or(
        lt(columns.createdAt, cursor.createdAt),
        and(
          eq(columns.createdAt, cursor.createdAt),
          lt(columns.id, cursor.id)
        )
      )!
    );
  }

  const rows = (await db
    .select()
    .from(table)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(columns.createdAt), desc(columns.id))
    .limit(limit + 1)) as T[];

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  return {
    data,
    hasMore,
  };
}
