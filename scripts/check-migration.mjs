// Apply supabase/migrations/*.sql to an in-memory Postgres (PGlite) and report the first error with context.
// Usage: node scripts/check-migration.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const AUTH_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
`;
const db = new PGlite();
await db.exec(AUTH_STUB);
const dir = 'supabase/migrations';
for (const f of readdirSync(dir)
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  const sql = readFileSync(join(dir, f), 'utf8');
  try {
    await db.exec(sql);
    console.log(`ok  ${f}`);
  } catch (e) {
    const pos = Number(e.position ?? 0);
    const line = sql.slice(0, pos).split('\n').length;
    console.log(`FAIL ${f}:${line}  ${e.message}`);
    console.log(
      sql
        .split('\n')
        .slice(Math.max(0, line - 4), line + 2)
        .map((l, i) => `${line - 3 + i}: ${l}`)
        .join('\n'),
    );
    process.exitCode = 1;
  }
}
const t = await db.query(`select count(*)::int n from pg_tables where schemaname = 'public'`);
const p = await db.query(`select count(*)::int n from pg_policies where schemaname = 'public'`);
const fn = await db.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace`);
console.log(`tables ${t.rows[0].n} · policies ${p.rows[0].n} · functions ${fn.rows[0].n}`);
await db.close();
