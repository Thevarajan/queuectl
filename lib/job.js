const crypto = require('crypto');

class Job {
    constructor(data) {
        this.id = data.id || this.generateId();
        this.command = data.command;
        this.state = data.state || 'pending';
        this.attempts = data.attempts || 0;
        this.max_retries = data.max_retries || 3;
        this.priority = data.priority || 0;
        this.timeout_seconds = data.timeout_seconds || 300;
        this.run_at = data.run_at || null;
        this.created_at = data.created_at || new Date().toISOString();
        this.updated_at = data.updated_at || new Date().toISOString();
        this.started_at = data.started_at || null;
        this.completed_at = data.completed_at || null;
        this.error_message = data.error_message || null;
        this.next_retry_at = data.next_retry_at || null;
        this.output = data.output || null;
        this.execution_time_ms = data.execution_time_ms || null;
    }

    generateId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    toJSON() {
        return {
            id: this.id,
            command: this.command,
            state: this.state,
            attempts: this.attempts,
            max_retries: this.max_retries,
            priority: this.priority,
            timeout_seconds: this.timeout_seconds,
            run_at: this.run_at,
            created_at: this.created_at,
            updated_at: this.updated_at,
            started_at: this.started_at,
            completed_at: this.completed_at,
            error_message: this.error_message,
            next_retry_at: this.next_retry_at,
            output: this.output,
            execution_time_ms: this.execution_time_ms
        };
    }

    static fromJSON(data) {
        return new Job(data);
    }

    canRetry() {
        return this.attempts < this.max_retries;
    }

    getRetryDelay(backoffBase = 2) {
        return Math.pow(backoffBase, this.attempts);
    }

    markAsProcessing() {
        this.state = 'processing';
        this.started_at = new Date().toISOString();
        this.updated_at = new Date().toISOString();
    }

    markAsCompletedWithMetrics(output, executionTimeMs) {
        this.state = 'completed';
        this.completed_at = new Date().toISOString();
        this.updated_at = new Date().toISOString();
        this.error_message = null;
        this.next_retry_at = null;
        this.output = output;
        this.execution_time_ms = executionTimeMs;
    }

    markAsCompleted() {
        this.state = 'completed';
        this.completed_at = new Date().toISOString();
        this.updated_at = new Date().toISOString();
        this.error_message = null;
        this.next_retry_at = null;
    }

    markAsFailed(errorMessage) {
        this.state = 'failed';
        this.attempts += 1;
        this.error_message = errorMessage;
        this.updated_at = new Date().toISOString();
    }

    markAsDead() {
        this.state = 'dead';
        this.updated_at = new Date().toISOString();
    }

    scheduleRetry(delaySeconds) {
        const retryTime = new Date();
        retryTime.setSeconds(retryTime.getSeconds() + delaySeconds);
        this.next_retry_at = retryTime.toISOString();
        this.state = 'pending';
    }
}

module.exports = Job;