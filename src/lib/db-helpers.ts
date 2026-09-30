import "server-only";
import { db } from "@/lib/db";

/** Next human-readable number for a table column like HD-1042 / EXP-1050 (max + 1, safe after deletes). */
export async function nextNumber(table: "helpdesk_tickets" | "expenses", prefix: string, start: number) {
  const rows = await db.$queryRawUnsafe<{ max: number | null }[]>(`SELECT max(substring(number from '[0-9]+')::int) AS max FROM "${table}"`);
  return `${prefix}-${Math.max(start - 1, rows[0]?.max ?? 0) + 1}`;
}
