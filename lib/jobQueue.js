const Database = require('./database');
const Job = require('./job');

class JobQueue {
    constructor(dbPath = null) {
        this.db = new Database(dbPath);
    }

    async initialize() {
        await this.db.connect();
        await this.db.initialize();
    }

    async enqueue(jobData) {
        const job = new Job(jobData);
        
        await this.db.run(
            `INSERT INTO jobs (id, command, state, attempts, max_retries, priority, timeout_seconds, run_at, created_at, updated_at, next_retry_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [job.id, job.command, job.state, job.attempts, job.max_retries, job.priority, job.timeout_seconds, job.run_at, job.created_at, job.updated_at, job.next_retry_at]
        );

        return job;
    }

    async dequeue() {
        const now = new Date().toISOString();
        
        // Get next available job (pending and ready for retry, scheduled jobs)
        const jobRow = await this.db.get(
            `SELECT * FROM jobs 
             WHERE state = 'pending' 
             AND (next_retry_at IS NULL OR next_retry_at <= ?)
             AND (run_at IS NULL OR run_at <= ?)
             ORDER BY priority DESC, created_at ASC
             LIMIT 1`,
            [now, now]
        );

        if (!jobRow) {
            return null;
        }

        // Lock the job by marking it as processing
        await this.db.run(
            `UPDATE jobs 
             SET state = 'processing', started_at = ?, updated_at = ?
             WHERE id = ? AND state = 'pending'`,
            [new Date().toISOString(), new Date().toISOString(), jobRow.id]
        );

        // Verify the job was locked
        const lockedJob = await this.db.get('SELECT * FROM jobs WHERE id = ?', [jobRow.id]);
        
        if (lockedJob && lockedJob.state === 'processing') {
            return new Job(lockedJob);
        }

        return null;
    }

    async completeJob(jobId, output = null, executionTimeMs = null) {
        const updates = [];
        const params = [];
        
        if (output !== null) {
            updates.push('output = ?');
            params.push(output);
        }
        
        if (executionTimeMs !== null) {
            updates.push('execution_time_ms = ?');
            params.push(executionTimeMs);
        }
        
        updates.push('state = ?, completed_at = ?, updated_at = ?');
        params.push('completed', new Date().toISOString(), new Date().toISOString());
        params.push(jobId);
        
        await this.db.run(
            `UPDATE jobs 
             SET ${updates.join(', ')}
             WHERE id = ?`,
            params
        );
    }

    async failJob(jobId, errorMessage) {
        const job = await this.getJob(jobId);
        if (!job) return;

        job.markAsFailed(errorMessage);

        if (job.canRetry()) {
            // Get retry configuration
            const backoffBase = parseInt(await this.getConfig('backoff_base') || '2');
            const delay = job.getRetryDelay(backoffBase);
            job.scheduleRetry(delay);

            await this.db.run(
                `UPDATE jobs 
                 SET state = ?, attempts = ?, error_message = ?, updated_at = ?, next_retry_at = ?
                 WHERE id = ?`,
                [job.state, job.attempts, job.error_message, job.updated_at, job.next_retry_at, jobId]
            );
        } else {
            // Move to dead letter queue
            await this.moveToDeadLetterQueue(job);
        }
    }

    async moveToDeadLetterQueue(job) {
        // Add to dead letter queue
        await this.db.run(
            `INSERT INTO dead_letter_queue (id, command, attempts, max_retries, created_at, failed_at, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [job.id, job.command, job.attempts, job.max_retries, job.created_at, new Date().toISOString(), job.error_message]
        );

        // Remove from main jobs table
        await this.db.run('DELETE FROM jobs WHERE id = ?', [job.id]);
    }

    async getJob(jobId) {
        const jobRow = await this.db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
        return jobRow ? new Job(jobRow) : null;
    }

    async listJobs(state = null, limit = 100) {
        let query = 'SELECT * FROM jobs';
        const params = [];

        if (state) {
            query += ' WHERE state = ?';
            params.push(state);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const rows = await this.db.all(query, params);
        return rows.map(row => new Job(row));
    }

    async getJobStats() {
        const stats = await this.db.all(`
            SELECT state, COUNT(*) as count
            FROM jobs
            GROUP BY state
        `);

        const result = {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            dead: 0
        };

        stats.forEach(stat => {
            result[stat.state] = stat.count;
        });

        return result;
    }

    async getDeadLetterQueue(limit = 100) {
        const rows = await this.db.all(
            'SELECT * FROM dead_letter_queue ORDER BY failed_at DESC LIMIT ?',
            [limit]
        );
        return rows;
    }

    async retryDeadJob(jobId) {
        const deadJob = await this.db.get('SELECT * FROM dead_letter_queue WHERE id = ?', [jobId]);
        if (!deadJob) {
            throw new Error(`Job ${jobId} not found in dead letter queue`);
        }

        // Move back to main queue
        const jobData = {
            id: deadJob.id,
            command: deadJob.command,
            state: 'pending',
            attempts: 0,
            max_retries: deadJob.max_retries,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await this.enqueue(jobData);
        await this.db.run('DELETE FROM dead_letter_queue WHERE id = ?', [jobId]);

        return new Job(jobData);
    }

    async setConfig(key, value) {
        await this.db.run(
            'INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)',
            [key, value, new Date().toISOString()]
        );
    }

    async getConfig(key) {
        const config = await this.db.get('SELECT value FROM config WHERE key = ?', [key]);
        return config ? config.value : null;
    }

    async getAllConfig() {
        return await this.db.all('SELECT key, value FROM config ORDER BY key');
    }

    async close() {
        await this.db.close();
    }
}

module.exports = JobQueue;