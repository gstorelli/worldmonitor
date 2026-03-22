import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function initSQLite(dataDir: string) {
  if (db) return db;

  const dbPath = path.join(dataDir, 'risk_sentinel.db');
  const dbExists = fs.existsSync(dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  if (!dbExists) {
    createSchema(db);
  }

  return db;
}

export function getDb() {
  if (!db) throw new Error('SQLite not initialized. Call initSQLite first.');
  return db;
}

function createSchema(database: Database.Database) {
  // Knowledge Graph Core Entities
  database.exec(`
    CREATE TABLE IF NOT EXISTS EventoGeopolitico (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      source_url TEXT,
      severity_score REAL,
      confidence_score REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      embedding_id TEXT
    );

    CREATE TABLE IF NOT EXISTS Paese (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      iso_code TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS NodoLogistico (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT, -- 'Port', 'Airport', 'Terminal'
      country_iso TEXT
    );

    CREATE TABLE IF NOT EXISTS RottaCommerciale (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      criticality_score REAL
    );

    CREATE TABLE IF NOT EXISTS CommoditySensibile (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sensitivity_score REAL
    );

    -- AI Act Compliance Audit Table
    CREATE TABLE IF NOT EXISTS ai_decision_logs (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      system_prompt TEXT,
      user_prompt TEXT,
      raw_llm_response TEXT,
      token_usage INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES EventoGeopolitico(id)
    );

    -- Junction Tables for N:M relations
    CREATE TABLE IF NOT EXISTS Evento_Paese (
      evento_id TEXT,
      paese_iso TEXT,
      PRIMARY KEY (evento_id, paese_iso),
      FOREIGN KEY(evento_id) REFERENCES EventoGeopolitico(id),
      FOREIGN KEY(paese_iso) REFERENCES Paese(iso_code)
    );

    CREATE TABLE IF NOT EXISTS Evento_Rotta (
      evento_id TEXT,
      rotta_id TEXT,
      PRIMARY KEY (evento_id, rotta_id),
      FOREIGN KEY(evento_id) REFERENCES EventoGeopolitico(id),
      FOREIGN KEY(rotta_id) REFERENCES RottaCommerciale(id)
    );

    CREATE TABLE IF NOT EXISTS Evento_Commodity (
      evento_id TEXT,
      commodity_id TEXT,
      PRIMARY KEY (evento_id, commodity_id),
      FOREIGN KEY(evento_id) REFERENCES EventoGeopolitico(id),
      FOREIGN KEY(commodity_id) REFERENCES CommoditySensibile(id)
    );
  `);
}

export function logAiDecision(
  id: string,
  eventId: string,
  systemPrompt: string,
  userPrompt: string,
  rawLlmResponse: string,
  tokenUsage: number
) {
  const insert = getDb().prepare(`
    INSERT INTO ai_decision_logs (id, event_id, system_prompt, user_prompt, raw_llm_response, token_usage)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run(id, eventId, systemPrompt, userPrompt, rawLlmResponse, tokenUsage);
}

// Example usage of JSON1: If using a JSON column instead of N:M tables
// We can store a metadata JSON column in EventoGeopolitico and use JSON_EXTRACT
