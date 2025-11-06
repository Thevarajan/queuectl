const JobQueue = require('./lib/jobQueue');

async function testPersistence() {
    console.log('🧪 Testing job persistence after restart...');
    
    // Step 1: Create a job
    const jobQueue = new JobQueue();
    await jobQueue.initialize();
    
    const job = await jobQueue.enqueue({
        command: 'echo "test persistence"',
        metadata: { test: 'persistence' }
    });
    
    console.log(`✅ Created job: ${job.id}`);
    
    // Check job exists
    const foundJob = await jobQueue.getJob(job.id);
    console.log(`✅ Job found before restart: ${foundJob ? 'YES' : 'NO'}`);
    
    await jobQueue.close();
    
    // Step 2: Create new instance (simulating restart)
    console.log('\n🔄 Simulating application restart...');
    
    const jobQueue2 = new JobQueue();
    await jobQueue2.initialize();
    
    // Step 3: Check if job still exists
    const foundJobAfterRestart = await jobQueue2.getJob(job.id);
    console.log(`✅ Job found after restart: ${foundJobAfterRestart ? 'YES' : 'NO'}`);
    
    if (foundJobAfterRestart) {
        console.log(`✅ Job details preserved:`);
        console.log(`   - Command: ${foundJobAfterRestart.command}`);
        console.log(`   - State: ${foundJobAfterRestart.state}`);
        console.log(`   - Attempts: ${foundJobAfterRestart.attempts}`);
        console.log(`   - Max retries: ${foundJobAfterRestart.max_retries}`);
        console.log(`   - Metadata: ${JSON.stringify(foundJobAfterRestart.metadata)}`);
    }
    
    await jobQueue2.close();
    
    console.log('\n🎯 Persistence test result:', foundJobAfterRestart ? 'PASSED ✅' : 'FAILED ❌');
}

testPersistence().catch(console.error);