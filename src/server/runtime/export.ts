import { DateTime, Effect, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { SqlClient } from "effect/sql";

/** Format of the export, raised when its shape changes (J1.16 imports it, J1.17 stores it). */
const exportVersion = 1;

// SQLite values as JSON: TEXT a string, INTEGER and REAL a number, NULL null, and a BLOB, which the
// SQLite client reads as `Uint8Array`, `{ "base64": "…" }` (RFC 4648 §4).
const toJson = (value: unknown) =>
  value instanceof Uint8Array ? { base64: Base64.encode(value) } : value;

// SQLite identifier quoting: double quotes, an inner one doubled.
const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * The household's whole database as JSON text (technique-v2 §12.4), read in one transaction so
 * that a concurrent write is in it entirely or not at all. Every table of `sqlite_master` is
 * exported, by name, with its columns and its rows sorted by every column, except: names starting
 * with `_` (the platform's: `_cf_KV` in workerd, `__cf_kv` in Cloudflare's docs; the application's
 * tables never start with `_`), SQLite's own `sqlite_*`, and `effect_sql_migrations`, whose ids
 * and names go in the envelope (their application time differs from one object to another).
 */
export const exportHousehold = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const exportedAt = DateTime.formatIso(yield* DateTime.now);
      const migrations = yield* sql<{
        readonly id: number;
        readonly name: string;
      }>`SELECT migration_id AS id, name FROM effect_sql_migrations ORDER BY migration_id`;
      const names = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND substr(name, 1, 1) <> '_'
          AND substr(name, 1, 7) <> 'sqlite_'
          AND name <> 'effect_sql_migrations'
        ORDER BY name`;
      const tables = [];
      for (const { name } of names) {
        const columns = (yield* sql<{ readonly name: string }>`
          SELECT name FROM pragma_table_info(${name}) ORDER BY cid`).map(
          (column) => column.name,
        );
        const rows = yield* sql.unsafe(
          `SELECT ${columns.map(quoted).join(", ")} FROM ${quoted(name)} ORDER BY ${columns.map((_, index) => index + 1).join(", ")}`,
        ).values;
        tables.push({
          name,
          columns,
          rows: rows.map((row) => row.map(toJson)),
        });
      }
      return JSON.stringify({
        version: exportVersion,
        exportedAt,
        migrations,
        tables,
      });
    }),
  );
});

/**
 * The household export's route (technique-v2 §12.4): outside `/api/v1`, since it is not part of the
 * PWA's contract. GitHub Actions calls it with `Authorization: Bearer <EXPORT_SECRET>`.
 */
export const exportPath = "/api/export";

// RFC 9110 §11.1: the scheme is case-insensitive; RFC 6750 §2.1: `Bearer`, then a non-empty token.
const bearer = /^bearer +(\S.*)$/i;

const encoder = new TextEncoder();

/**
 * Whether `authorization` carries `Bearer <secret>`. The token is compared in constant time with
 * `crypto.subtle.timingSafeEqual`, which throws on buffers of different lengths: then the token is
 * compared with itself and the result negated (Cloudflare's recipe, "Using timingSafeEqual"): the
 * time depends on the token's length, never on the secret's characters. An absent or empty token
 * is always refused.
 */
export const presentsExportSecret = (
  authorization: string | null,
  secret: Redacted.Redacted,
): boolean => {
  const token =
    authorization === null ? undefined : bearer.exec(authorization)?.[1];
  if (token === undefined) return false;
  const presented = encoder.encode(token);
  const expected = encoder.encode(Redacted.value(secret));
  return presented.byteLength === expected.byteLength
    ? crypto.subtle.timingSafeEqual(presented, expected)
    : !crypto.subtle.timingSafeEqual(presented, presented);
};

// RFC 9110 §15.5.2 and RFC 6750 §3: a 401 names the scheme. RFC 9457 problem with `about:blank`, as
// for a refused `Origin` (origin.ts): §6.2 lists no type for it, and the title is the status phrase.
const unauthorizedProblem = JSON.stringify({
  type: "about:blank",
  title: "Unauthorized",
  status: 401,
});

/** The answer to an export request without the right secret; it never says what was wrong. */
export const refuseExport = (): Response =>
  new Response(unauthorizedProblem, {
    status: 401,
    headers: {
      "Content-Type": "application/problem+json",
      "WWW-Authenticate": "Bearer",
    },
  });
