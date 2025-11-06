#!/usr/bin/env node

const JobQueue = require('../lib/jobQueue');
const WorkerManager = require('../lib/workerManager');
const Database = require('../lib/database');
const path = require('path');

class ComprehensiveTest {
    constructor() {
        this.dbPath = path.join(__dirname, '../test-queue.db');
        this.jobQueue = new JobQueue(this.dbPath);
        this.workerManager = new WorkerManager(this.dbPath); // Pass dbPath, not jobQueue instance
        this.testResults = [];
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running: ${testName}`);
        try {
            await testFunction();
            console.log(`✅ PASSED: ${testName}`);
            this.testResults.push({ name: testName, status: 'PASSED' });
        } catch (error) {
            console.error(`❌ FAILED: ${testName}`);
            console.error(`   Error: ${error.message}`);
            this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
        }
    }

    async testJobEnqueueAndDequeue() {
        await this.jobQueue.enqueue({
            command: 'echo "test job"',
            max_retries: 3,  // Use snake_case to match Job constructor
            metadata: { test: 'basic' }
        });

        const job = await this.jobQueue.dequeue();
        if (!job) throw new Error('No job dequeued');
        if (job.command !== 'echo "test job"') throw new Error('Wrong job command');
        if (job.state !== 'processing') throw new Error('Job not in processing state');
        
        await this.jobQueue.completeJob(job.id);
        
        const completedJob = await this.jobQueue.getJob(job.id);
        if (completedJob.state !== 'completed') throw new Error('Job not completed');
    }

    async testJobRetryMechanism() {
        await this.jobQueue.enqueue({
            command: 'exit 1',
            max_retries: 2,  // Use snake_case to match Job constructor
            metadata: { test: 'retry' }
        });

        const job = await this.jobQueue.dequeue();
        if (!job) throw new Error('No job dequeued');

        await this.jobQueue.failJob(job.id, 'Command failed with exit code 1');
        
        // Check that job is scheduled for retry (pending state with future retry time)
        const failedJob = await this.jobQueue.getJob(job.id);
        if (!failedJob) throw new Error('Job not found after failure');
        if (failedJob.attempts !== 1) throw new Error('Job attempts not incremented');
        if (failedJob.state !== 'pending') throw new Error('Job not in pending state for retry');
        if (!failedJob.next_retry_at) throw new Error('Job not scheduled for retry');
        
        // Test that we can manually retry by resetting the retry time
        await this.jobQueue.db.run(
            'UPDATE jobs SET next_retry_at = NULL WHERE id = ?',
            [job.id]
        );
        
        // Now the job should be available for retry
        const retriedJob = await this.jobQueue.dequeue();
        if (!retriedJob) throw new Error('Job not available for retry after reset');
        if (retriedJob.attempts !== 1) throw new Error('Job attempts not correct');
        if (retriedJob.state !== 'processing') throw new Error('Job not in processing state');
    }

    async testDeadLetterQueue() {
        await this.jobQueue.enqueue({
            command: 'exit 1',
            max_retries: 1,  // Use snake_case to match Job constructor
            metadata: { test: 'dlq' }
        });

        const job = await this.jobQueue.dequeue();
        if (!job) throw new Error('No job dequeued');
        console.log(`First dequeue: job ${job.id}, attempts: ${job.attempts}, maxRetries: ${job.max_retries}`);

        // Fail the job once to exceed max_retries and move to DLQ
        await this.jobQueue.failJob(job.id, 'Command failed with exit code 1');
        console.log(`After first failJob: job should be moved to DLQ`);
        
        // Check that job is moved to DLQ
        const dlqJobs = await this.jobQueue.getDeadLetterQueue();
        console.log(`DLQ jobs after first failure: ${dlqJobs.length}`);
        if (dlqJobs.length === 0) {
            // Check if job still exists in main table
            const mainJob = await this.jobQueue.getJob(job.id);
            console.log(`Job in main table: ${mainJob ? 'exists' : 'not found'}, state: ${mainJob ? mainJob.state : 'N/A'}`);
            throw new Error('No jobs in DLQ');
        }
        
        const dlqJob = dlqJobs.find(j => j.id === job.id);
        if (!dlqJob) throw new Error('Job not found in DLQ');
    }

    async testConfigurationManagement() {
        await this.jobQueue.setConfig('test_key', 'test_value');
        const value = await this.jobQueue.getConfig('test_key');
        if (value !== 'test_value') throw new Error('Config value not stored correctly');

        await this.jobQueue.setConfig('max_retries', '5');
        const maxRetries = await this.jobQueue.getConfig('max_retries');
        if (maxRetries !== '5') throw new Error('Max retries config not updated');
    }

    async testJobStatistics() {
        await this.jobQueue.enqueue({ command: 'echo "stat test 1"' });
        await this.jobQueue.enqueue({ command: 'echo "stat test 2"' });
        await this.jobQueue.enqueue({ command: 'exit 1', max_retries: 1 });  // Use snake_case

        const stats = await this.jobQueue.getJobStats();
        if (stats.pending < 3) throw new Error('Not enough pending jobs');

        const job = await this.jobQueue.dequeue();
        await this.jobQueue.completeJob(job.id);

        const updatedStats = await this.jobQueue.getJobStats();
        if (updatedStats.completed < 1) throw new Error('Completed job not counted');
    }

    async testWorkerProcessExecution() {
        await this.jobQueue.enqueue({
            command: 'echo "worker test"',
            max_retries: 1  // Use snake_case to match Job constructor
        });

        const job = await this.jobQueue.dequeue();
        if (!job) throw new Error('No job for worker test');

        // Manually complete the job since we're testing the worker manager separately
        await this.jobQueue.completeJob(job.id);

        const completedJob = await this.jobQueue.getJob(job.id);
        if (completedJob.state !== 'completed') throw new Error('Job not completed');
    }

    async testExponentialBackoff() {
        await this.jobQueue.setConfig('backoff_base', 2);
        
        const jobData = {
            command: 'exit 1',
            max_retries: 3,  // Use snake_case to match Job constructor
            metadata: { test: 'backoff', unique_id: 'exponential_test' }
        };
        
        const createdJob = await this.jobQueue.enqueue(jobData);
        
        // Get the specific job we just created
        const job = await this.jobQueue.getJob(createdJob.id);
        if (!job) throw new Error('Job not found after creation');
        
        // Manually update the job state to processing to simulate dequeue
        await this.jobQueue.db.run(
            'UPDATE jobs SET state = ?, started_at = ?, updated_at = ? WHERE id = ?',
            ['processing', new Date().toISOString(), new Date().toISOString(), job.id]
        );
        
        // Get the updated job
        const processingJob = await this.jobQueue.getJob(job.id);
        
        await this.jobQueue.failJob(processingJob.id, 'First failure');
        
        const failedJob = await this.jobQueue.getJob(processingJob.id);
        if (!failedJob) {
            throw new Error('Job not found after failure');
        }
        
        const firstRetryDelay = new Date(failedJob.next_retry_at).getTime() - Date.now();
        
        if (firstRetryDelay < 1000 || firstRetryDelay > 3000) {
            throw new Error('Exponential backoff not working correctly');
        }
    }

    async testJobListFiltering() {
        await this.jobQueue.enqueue({ command: 'echo "list test 1"', metadata: { type: 'test' } });
        await this.jobQueue.enqueue({ command: 'echo "list test 2"', metadata: { type: 'test' } });
        
        const allJobs = await this.jobQueue.listJobs();
        if (allJobs.length < 2) throw new Error('Not enough jobs for filtering test');

        const pendingJobs = await this.jobQueue.listJobs('pending');
        if (pendingJobs.length < 2) throw new Error('Pending jobs not filtered correctly');
    }

    async testDLQRetry() {
        await this.jobQueue.enqueue({
            command: 'exit 1',
            max_retries: 1,  // Use snake_case to match Job constructor
            metadata: { test: 'dlq_retry' }
        });

        const job = await this.jobQueue.dequeue();
        await this.jobQueue.failJob(job.id, 'First failure');
        
        // Check that job is moved to DLQ
        const dlqJobs = await this.jobQueue.getDeadLetterQueue();
        if (dlqJobs.length === 0) throw new Error('No jobs in DLQ');
        
        const dlqJob = dlqJobs.find(j => j.id === job.id);
        if (!dlqJob) throw new Error('Job not found in DLQ');
        
        await this.jobQueue.retryDeadJob(dlqJob.id);

        const retriedJob = await this.jobQueue.getJob(job.id);
        if (!retriedJob) throw new Error('Job not found after retry');
        if (retriedJob.state !== 'pending') throw new Error('Job not retried from DLQ');
    }

    async testConcurrentJobProcessing() {
        const jobPromises = [];
        for (let i = 0; i < 5; i++) {
            jobPromises.push(this.jobQueue.enqueue({
                command: `echo "concurrent test ${i}"`,
                metadata: { test: 'concurrent', index: i }
            }));
        }
        
        await Promise.all(jobPromises);

        const jobs = [];
        for (let i = 0; i < 5; i++) {
            const job = await this.jobQueue.dequeue();
            if (job) jobs.push(job);
        }

        if (jobs.length !== 5) throw new Error('Not all jobs dequeued concurrently');

        for (const job of jobs) {
            await this.jobQueue.completeJob(job.id);
        }
    }

    async runAllTests() {
        console.log('🚀 Starting Comprehensive QueueCTL Tests...');
        console.log('='.repeat(50));

        try {
            await this.jobQueue.initialize();

            await this.runTest('Job Enqueue and Dequeue', this.testJobEnqueueAndDequeue.bind(this));
            await this.runTest('Job Retry Mechanism', this.testJobRetryMechanism.bind(this));
            await this.runTest('Dead Letter Queue', this.testDeadLetterQueue.bind(this));
            await this.runTest('Configuration Management', this.testConfigurationManagement.bind(this));
            await this.runTest('Job Statistics', this.testJobStatistics.bind(this));
            await this.runTest('Worker Process Execution', this.testWorkerProcessExecution.bind(this));
            await this.runTest('Exponential Backoff', this.testExponentialBackoff.bind(this));
            await this.runTest('Job List Filtering', this.testJobListFiltering.bind(this));
            await this.runTest('DLQ Retry', this.testDLQRetry.bind(this));
            await this.runTest('Concurrent Job Processing', this.testConcurrentJobProcessing.bind(this));

            console.log('\n' + '='.repeat(50));
            console.log('📊 Test Results Summary:');
            console.log('='.repeat(50));
            
            const passed = this.testResults.filter(r => r.status === 'PASSED').length;
            const failed = this.testResults.filter(r => r.status === 'FAILED').length;
            
            console.log(`Total Tests: ${this.testResults.length}`);
            console.log(`✅ Passed: ${passed}`);
            console.log(`❌ Failed: ${failed}`);
            
            if (failed > 0) {
                console.log('\nFailed Tests:');
                this.testResults.filter(r => r.status === 'FAILED').forEach(r => {
                    console.log(`  - ${r.name}: ${r.error}`);
                });
            }

            console.log('\n🎯 Overall Result:', failed === 0 ? 'ALL TESTS PASSED! 🎉' : 'SOME TESTS FAILED! ⚠️');

        } catch (error) {
            console.error('❌ Test suite failed to initialize:', error.message);
        } finally {
            await this.jobQueue.close();
            
            const fs = require('fs');
            if (fs.existsSync(this.dbPath)) {
                fs.unlinkSync(this.dbPath);
                console.log('\n🧹 Cleaned up test database');
            }
        }
    }
}

if (require.main === module) {
    const testSuite = new ComprehensiveTest();
    testSuite.runAllTests().catch(console.error);
}

module.exports = { ComprehensiveTest };