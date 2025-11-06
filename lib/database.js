const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(process.cwd(), 'queue.db');
        this.db = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Connected to SQLite database at ${this.dbPath}`);
                    resolve();
                }
            });
        });
    }

    async initialize() {
        const createJobsTable = `
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                command TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                priority INTEGER DEFAULT 0,
                timeout_seconds INTEGER DEFAULT 300,
                run_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                completed_at DATETIME,
                error_message TEXT,
                next_retry_at DATETIME,
                output TEXT,
                execution_time_ms INTEGER
            )
        `;

        const createDeadLetterQueueTable = `
            CREATE TABLE IF NOT EXISTS dead_letter_queue (
                id TEXT PRIMARY KEY,
                command TEXT NOT NULL,
                attempts INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT
            )
        `;

        const createConfigTable = `
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.run(createJobsTable);
        await this.run(createDeadLetterQueueTable);
        await this.run(createConfigTable);

        // Add migration for new columns if they don't exist
        await this.addColumnIfNotExists('jobs', 'priority', 'INTEGER DEFAULT 0');
        await this.addColumnIfNotExists('jobs', 'timeout_seconds', 'INTEGER DEFAULT 300');
        await this.addColumnIfNotExists('jobs', 'run_at', 'DATETIME');
        await this.addColumnIfNotExists('jobs', 'output', 'TEXT');
        await this.addColumnIfNotExists('jobs', 'execution_time_ms', 'INTEGER');

        // Insert default configuration
        const defaultConfig = [
            ['max_retries', '3'],
            ['backoff_base', '2'],
            ['worker_timeout', '300']
        ];

        for (const [key, value] of defaultConfig) {
            await this.run(
                'INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)',
                [key, value]
            );
        }
    }

    async addColumnIfNotExists(table, column, definition) {
        try {
            // Check if column exists
            const result = await this.get(`PRAGMA table_info(${table})`);
            const columns = await this.all(`PRAGMA table_info(${table})`);
            const columnExists = columns.some(col => col.name === column);
            
            if (!columnExists) {
                console.log(`Adding column ${column} to ${table} table`);
                await this.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            }
        } catch (error) {
            console.log(`Column ${column} might already exist or error: ${error.message}`);
        }
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Database connection closed.');
                    resolve();
                }
            });
        });
    }
}

module.exports = Database;