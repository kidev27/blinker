import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Db = Database.Database

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

/** Opens the database and applies pending migrations/NNNN_*.sql in order, tracked by PRAGMA user_version. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const applied = db.pragma('user_version', { simple: true }) as number
  files.slice(applied).forEach((f, i) =>
    db.transaction(() => {
      db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
      db.pragma(`user_version = ${applied + i + 1}`)
    })(),
  )
  return db
}
