#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const { table } = require('table');
const JobQueue = require('../lib/jobQueue');
const WorkerManager = require('../lib/workerManager');
const Job = require('../lib/job');

const program = new Command();

program
    .name('queuectl')
    .description('CLI-based background job queue system')
    .version('1.0.0');

// Enqueue command
program
    .command('enqueue')
    .description('Add a new job to the queue')
    .argument('<command>', 'Command to execute or JSON job data')
    .option('-p, --priority <number>', 'Job priority (higher = more important)', '0')
    .option('-t, --timeout <seconds>', 'Job timeout in seconds', '300')
    .option('-d, --delay <seconds>', 'Delay job execution by N seconds', '0')
    .action(async (command, options) => {
        const spinner = ora('Enqueuing job...').start();
        
        try {
            let data;
            
            // Try to parse as JSON first, if that fails treat as command
            try {
                data = JSON.parse(command);
            } catch {
                // Treat as command string
                data = {
                    command: command,
                    priority: parseInt(options.priority),
                    timeout_seconds: parseInt(options.timeout)
                };
            }
            
            // Handle delayed execution
            if (parseInt(options.delay) > 0) {
                const runAt = new Date();
                runAt.setSeconds(runAt.getSeconds() + parseInt(options.delay));
                data.run_at = runAt.toISOString();
            }
            
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const job = await jobQueue.enqueue(data);
            spinner.succeed(chalk.green(`Job enqueued: ${job.id}`));
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to enqueue job: ${error.message}`));
            console.error(error); // Add this line for detailed error logging
            process.exit(1);
        }
    });

// Worker commands
const workerCmd = program
    .command('worker')
    .description('Worker management commands');

workerCmd
    .command('start')
    .description('Start one or more workers')
    .option('-c, --count <number>', 'Number of workers to start', '1')
    .option('-d, --db-path <path>', 'Database file path')
    .action(async (options) => {
        const count = parseInt(options.count);
        const workerManager = new WorkerManager(options.dbPath);
        
        try {
            await workerManager.initialize();
            await workerManager.startWorkers(count);
            
            console.log(chalk.blue(`Workers running. Press Ctrl+C to stop.`));
            
            // Handle graceful shutdown
            process.on('SIGINT', async () => {
                console.log(chalk.yellow('\nReceived SIGINT, shutting down gracefully...'));
                await workerManager.close();
                process.exit(0);
            });
            
            // Keep the process running
            process.stdin.resume();
        } catch (error) {
            console.error(chalk.red(`Failed to start workers: ${error.message}`));
            process.exit(1);
        }
    });

workerCmd
    .command('stop')
    .description('Stop running workers (use Ctrl+C instead)')
    .action(() => {
        console.log(chalk.yellow('Use Ctrl+C to stop workers gracefully'));
    });

// Status command
program
    .command('status')
    .description('Show summary of all job states and active workers')
    .action(async () => {
        const spinner = ora('Getting status...').start();
        
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const stats = await jobQueue.getJobStats();
            const config = await jobQueue.getAllConfig();
            
            spinner.stop();
            
            console.log(chalk.bold('\n📊 Job Queue Status'));
            console.log('─'.repeat(40));
            
            const statusTable = [
                ['State', 'Count'],
                ['Pending', stats.pending.toString()],
                ['Processing', stats.processing.toString()],
                ['Completed', stats.completed.toString()],
                ['Failed', stats.failed.toString()],
                ['Dead', stats.dead.toString()]
            ];
            
            console.log(table(statusTable));
            
            console.log(chalk.bold('\n⚙️  Configuration'));
            console.log('─'.repeat(40));
            
            const configTable = [
                ['Key', 'Value'],
                ...config.map(item => [item.key, item.value])
            ];
            
            console.log(table(configTable));
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to get status: ${error.message}`));
            process.exit(1);
        }
    });

// List jobs command
program
    .command('list')
    .description('List jobs by state')
    .option('-s, --state <state>', 'Filter by job state', 'pending')
    .option('-l, --limit <number>', 'Maximum number of jobs to show', '20')
    .action(async (options) => {
        const spinner = ora('Fetching jobs...').start();
        
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const jobs = await jobQueue.listJobs(options.state, parseInt(options.limit));
            
            spinner.stop();
            
            if (jobs.length === 0) {
                console.log(chalk.yellow(`No jobs found with state: ${options.state}`));
                return;
            }
            
            console.log(chalk.bold(`\n📋 Jobs (${options.state})`));
            console.log('─'.repeat(80));
            
            const jobsTable = [
                ['ID', 'Command', 'Priority', 'Attempts', 'Timeout', 'Created At', 'Scheduled At']
            ];
            
            jobs.forEach(job => {
                const createdAt = new Date(job.created_at).toLocaleString();
                const scheduledAt = job.run_at ? new Date(job.run_at).toLocaleString() : 'Immediate';
                jobsTable.push([
                    job.id.substring(0, 8) + '...',
                    job.command.substring(0, 25),
                    job.priority.toString(),
                    `${job.attempts}/${job.max_retries}`,
                    `${job.timeout_seconds}s`,
                    createdAt,
                    scheduledAt
                ]);
            });
            
            console.log(table(jobsTable));
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to list jobs: ${error.message}`));
            process.exit(1);
        }
    });

// Dead Letter Queue commands
const dlqCmd = program
    .command('dlq')
    .description('Dead Letter Queue management');

dlqCmd
    .command('list')
    .description('List jobs in dead letter queue')
    .option('-l, --limit <number>', 'Maximum number of jobs to show', '20')
    .action(async (options) => {
        const spinner = ora('Fetching dead letter queue...').start();
        
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const deadJobs = await jobQueue.getDeadLetterQueue(parseInt(options.limit));
            
            spinner.stop();
            
            if (deadJobs.length === 0) {
                console.log(chalk.green('Dead letter queue is empty'));
                return;
            }
            
            console.log(chalk.bold(`\n💀 Dead Letter Queue`));
            console.log('─'.repeat(80));
            
            const dlqTable = [
                ['ID', 'Command', 'Attempts', 'Failed At', 'Error']
            ];
            
            deadJobs.forEach(job => {
                const failedAt = new Date(job.failed_at).toLocaleString();
                dlqTable.push([
                    job.id.substring(0, 8) + '...',
                    job.command.substring(0, 25),
                    `${job.attempts}/${job.max_retries}`,
                    failedAt,
                    job.error_message ? job.error_message.substring(0, 30) + '...' : ''
                ]);
            });
            
            console.log(table(dlqTable));
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to list DLQ: ${error.message}`));
            process.exit(1);
        }
    });

dlqCmd
    .command('retry')
    .description('Retry a job from dead letter queue')
    .argument('<job-id>', 'Job ID to retry')
    .action(async (jobId) => {
        const spinner = ora('Retrying job...').start();
        
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const job = await jobQueue.retryDeadJob(jobId);
            spinner.succeed(chalk.green(`Job retried: ${job.id}`));
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to retry job: ${error.message}`));
            process.exit(1);
        }
    });

// Configuration commands
const configCmd = program
    .command('config')
    .description('Configuration management');

configCmd
    .command('set')
    .description('Set configuration value')
    .argument('<key>', 'Configuration key')
    .argument('<value>', 'Configuration value')
    .action(async (key, value) => {
        const spinner = ora('Setting configuration...').start();
        
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            await jobQueue.setConfig(key, value);
            spinner.succeed(chalk.green(`Configuration set: ${key} = ${value}`));
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to set configuration: ${error.message}`));
            process.exit(1);
        }
    });

configCmd
    .command('get')
    .description('Get configuration value')
    .argument('<key>', 'Configuration key')
    .action(async (key) => {
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const value = await jobQueue.getConfig(key);
            
            if (value !== null) {
                console.log(chalk.green(`${key} = ${value}`));
            } else {
                console.log(chalk.yellow(`Configuration key '${key}' not found`));
            }
            
            await jobQueue.close();
        } catch (error) {
            console.error(chalk.red(`Failed to get configuration: ${error.message}`));
            process.exit(1);
        }
    });

configCmd
    .command('list')
    .description('List all configuration')
    .action(async () => {
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            const config = await jobQueue.getAllConfig();
            
            if (config.length === 0) {
                console.log(chalk.yellow('No configuration found'));
                return;
            }
            
            console.log(chalk.bold('\n⚙️  Configuration'));
            console.log('─'.repeat(40));
            
            const configTable = [
                ['Key', 'Value'],
                ...config.map(item => [item.key, item.value])
            ];
            
            console.log(table(configTable));
            
            await jobQueue.close();
        } catch (error) {
            console.error(chalk.red(`Failed to list configuration: ${error.message}`));
            process.exit(1);
        }
    });

// Metrics command
program
    .command('metrics')
    .description('Show job execution metrics and statistics')
    .action(async () => {
        const spinner = ora('Fetching metrics...').start();
        
        try {
            const jobQueue = new JobQueue();
            await jobQueue.initialize();
            
            // Get job stats
            const stats = await jobQueue.getJobStats();
            
            // Get completed jobs with metrics
            const completedJobs = await jobQueue.listJobs('completed', 100);
            
            // Calculate metrics
            const totalCompleted = completedJobs.length;
            const avgExecutionTime = totalCompleted > 0 
                ? Math.round(completedJobs.reduce((sum, job) => sum + (job.execution_time_ms || 0), 0) / totalCompleted)
                : 0;
            
            const recentJobs = completedJobs.slice(0, 10);
            const successRate = totalCompleted > 0 
                ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100)
                : 0;
            
            spinner.stop();
            
            console.log(chalk.bold('\n📈 Job Execution Metrics'));
            console.log('─'.repeat(50));
            
            const metricsTable = [
                ['Metric', 'Value'],
                ['Total Jobs Processed', (stats.completed + stats.failed).toString()],
                ['Successful Jobs', stats.completed.toString()],
                ['Failed Jobs', stats.failed.toString()],
                ['Success Rate', `${successRate}%`],
                ['Average Execution Time', `${avgExecutionTime}ms`],
                ['Jobs in Queue', stats.pending.toString()],
                ['Processing Jobs', stats.processing.toString()]
            ];
            
            console.log(table(metricsTable));
            
            if (recentJobs.length > 0) {
                console.log(chalk.bold('\n🕒 Recent Completed Jobs'));
                console.log('─'.repeat(80));
                
                const recentTable = [
                    ['Job ID', 'Command', 'Execution Time', 'Completed At']
                ];
                
                recentJobs.forEach(job => {
                    const completedAt = new Date(job.completed_at).toLocaleString();
                    recentTable.push([
                        job.id.substring(0, 8) + '...',
                        job.command.substring(0, 25),
                        `${job.execution_time_ms || 0}ms`,
                        completedAt
                    ]);
                });
                
                console.log(table(recentTable));
            }
            
            await jobQueue.close();
        } catch (error) {
            spinner.fail(chalk.red(`Failed to get metrics: ${error.message}`));
            process.exit(1);
        }
    });

// Web Dashboard command
program
    .command('dashboard')
    .description('Start web dashboard for monitoring')
    .option('-p, --port <number>', 'Port to run dashboard on', '8080')
    .option('-d, --db-path <path>', 'Database file path')
    .action(async (options) => {
        try {
            const WebDashboard = require('../lib/webDashboard');
            const dashboard = new WebDashboard(options.dbPath, parseInt(options.port));
            
            await dashboard.initialize();
            await dashboard.start();
            
            console.log(chalk.blue('Press Ctrl+C to stop the dashboard'));
            
            // Handle graceful shutdown
            process.on('SIGINT', async () => {
                console.log(chalk.yellow('\nStopping dashboard...'));
                await dashboard.stop();
                process.exit(0);
            });
            
            // Keep the process running
            process.stdin.resume();
        } catch (error) {
            console.error(chalk.red(`Failed to start dashboard: ${error.message}`));
            process.exit(1);
        }
    });

program.parse();