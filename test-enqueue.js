const JobQueue = require('./lib/jobQueue');

async function testEnqueue() {
    const jobQueue = new JobQueue();
    await jobQueue.initialize();

    const jobData = {
        id: 'job2',
        command: 'nonexistentcommand'
    };

    try {
        const job = await jobQueue.enqueue(jobData);
        console.log('Job enqueued:', job.id);
    } catch (error) {
        console.error('Failed to enqueue job:', error);
    }

    await jobQueue.close();
}

testEnqueue();