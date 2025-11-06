const { spawn } = require('child_process');
const JobQueue = require('./jobQueue');
const chalk = require('chalk');

class WorkerManager {
    constructor(dbPath = null) {
        this.jobQueue = new JobQueue(dbPath);
        this.workers = new Map();
        this.isShuttingDown = false;
        this.activeJobs = new Map();
    }

    async initialize() {
        await this.jobQueue.initialize();
    }

    async startWorkers(count = 1) {
        console.log(chalk.blue(`Starting ${count} worker(s)...`));

        for (let i = 0; i < count; i++) {
            const workerId = `worker_${Date.now()}_${i}`;
            this.startWorker(workerId);
        }

        console.log(chalk.green(`✓ Started ${count} worker(s)`));
    }

    startWorker(workerId) {
        const worker = {
            id: workerId,
            isProcessing: false,
            currentJob: null,
            startTime: new Date()
        };

        this.workers.set(workerId, worker);
        this.processJobs(workerId);
    }

    async processJobs(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker || this.isShuttingDown) return;

        try {
            // Get next job from queue
            const job = await this.jobQueue.dequeue();

            if (!job) {
                // No jobs available, wait and try again
                setTimeout(() => this.processJobs(workerId), 1000);
                return;
            }

            // Execute the job
            worker.isProcessing = true;
            worker.currentJob = job.id;
            this.activeJobs.set(job.id, workerId);

            console.log(chalk.yellow(`[${workerId}] Processing job ${job.id}: ${job.command}`));

            const startTime = Date.now();
            const result = await this.executeCommand(job.command, job.timeout_seconds);
            const executionTime = Date.now() - startTime;

            if (result.success) {
                await this.jobQueue.completeJob(job.id, result.output, executionTime);
                console.log(chalk.green(`[${workerId}] ✓ Completed job ${job.id} in ${executionTime}ms`));
                if (result.output) {
                    console.log(chalk.gray(`[${workerId}] Output: ${result.output.trim()}`));
                }
            } else {
                await this.jobQueue.failJob(job.id, result.error);
                console.log(chalk.red(`[${workerId}] ✗ Failed job ${job.id}: ${result.error}`));
            }

        } catch (error) {
            console.error(chalk.red(`[${workerId}] Error processing job: ${error.message}`));
            if (worker.currentJob) {
                await this.jobQueue.failJob(worker.currentJob, error.message);
            }
        } finally {
            // Reset worker state
            worker.isProcessing = false;
            worker.currentJob = null;
            this.activeJobs.delete(workerId);

            // Continue processing if not shutting down
            if (!this.isShuttingDown) {
                setTimeout(() => this.processJobs(workerId), 100);
            }
        }
    }

    executeCommand(command, timeoutSeconds = 300) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            // Split command into parts for spawn
            const parts = command.split(' ');
            const cmd = parts[0];
            const args = parts.slice(1);

            const child = spawn(cmd, args, {
                shell: true, // Use shell for better command parsing
                stdio: 'pipe'
            });

            let output = '';
            let error = '';
            let isTimedOut = false;

            // Set up timeout
            const timeout = setTimeout(() => {
                isTimedOut = true;
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 5000);
            }, timeoutSeconds * 1000);

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                error += data.toString();
            });

            child.on('close', (code) => {
                clearTimeout(timeout);
                const executionTime = Date.now() - startTime;
                
                if (isTimedOut) {
                    resolve({ success: false, error: `Job timed out after ${timeoutSeconds} seconds`, executionTime });
                } else if (code === 0) {
                    resolve({ success: true, output, executionTime });
                } else {
                    resolve({ success: false, error: error.trim() || `Command failed with exit code ${code}`, executionTime });
                }
            });

            child.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ success: false, error: err.message, executionTime: Date.now() - startTime });
            });
        });
    }

    async stopWorkers() {
        console.log(chalk.yellow('Stopping workers gracefully...'));
        this.isShuttingDown = true;

        const activeCount = this.getActiveWorkerCount();
        if (activeCount > 0) {
            console.log(chalk.blue(`Waiting for ${activeCount} active job(s) to complete...`));
            
            // Wait for active jobs to complete
            await this.waitForActiveJobs();
        }

        this.workers.clear();
        this.activeJobs.clear();
        console.log(chalk.green('✓ All workers stopped'));
    }

    getActiveWorkerCount() {
        let count = 0;
        for (const worker of this.workers.values()) {
            if (worker.isProcessing) {
                count++;
            }
        }
        return count;
    }

    async waitForActiveJobs() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const activeCount = this.getActiveWorkerCount();
                if (activeCount === 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);
        });
    }

    getWorkerStatus() {
        const status = {
            total: this.workers.size,
            active: this.getActiveWorkerCount(),
            idle: this.workers.size - this.getActiveWorkerCount(),
            workers: []
        };

        for (const [id, worker] of this.workers) {
            status.workers.push({
                id,
                isProcessing: worker.isProcessing,
                currentJob: worker.currentJob,
                startTime: worker.startTime,
                uptime: Date.now() - worker.startTime.getTime()
            });
        }

        return status;
    }

    async close() {
        await this.stopWorkers();
        await this.jobQueue.close();
    }
}

module.exports = WorkerManager;