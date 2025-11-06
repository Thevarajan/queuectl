const JobQueue = require('../lib/jobQueue');

async function testBasicFunctionality() {
    console.log('🧪 Testing QueueCTL Basic Functionality...\n');
    
    const jobQueue = new JobQueue();
    await jobQueue.initialize();
    
    try {
        // Test 1: Enqueue jobs
        console.log('1️⃣ Testing job enqueue...');
        const job1 = await jobQueue.enqueue({
            id: 'test-job-1',
            command: 'echo "Hello World"'
        });
        console.log(`✅ Enqueued job: ${job1.id}`);
        
        const job2 = await jobQueue.enqueue({
            id: 'test-job-2',
            command: 'sleep 2'
        });
        console.log(`✅ Enqueued job: ${job2.id}`);
        
        // Test 2: List jobs
        console.log('\n2️⃣ Testing job listing...');
        const pendingJobs = await jobQueue.listJobs('pending');
        console.log(`✅ Found ${pendingJobs.length} pending jobs`);
        
        // Test 3: Job stats
        console.log('\n3️⃣ Testing job statistics...');
        const stats = await jobQueue.getJobStats();
        console.log(`✅ Job stats: ${JSON.stringify(stats, null, 2)}`);
        
        // Test 4: Dequeue and process job
        console.log('\n4️⃣ Testing job dequeue...');
        const job = await jobQueue.dequeue();
        if (job) {
            console.log(`✅ Dequeued job: ${job.id} - ${job.command}`);
            
            // Complete the job
            await jobQueue.completeJob(job.id);
            console.log(`✅ Completed job: ${job.id}`);
        } else {
            console.log('❌ No job available for dequeue');
        }
        
        // Test 5: Test failing job and retry logic
        console.log('\n5️⃣ Testing job failure and retry...');
        const failJob = await jobQueue.enqueue({
            id: 'test-fail-job',
            command: 'invalid-command-that-fails',
            max_retries: 2
        });
        console.log(`✅ Created job that will fail: ${failJob.id}`);
        
        // Simulate job failure
        await jobQueue.failJob(failJob.id, 'Command not found');
        console.log(`✅ Job failed and marked for retry`);
        
        // Test 6: Configuration
        console.log('\n6️⃣ Testing configuration...');
        await jobQueue.setConfig('test_key', 'test_value');
        const configValue = await jobQueue.getConfig('test_key');
        console.log(`✅ Configuration test_key = ${configValue}`);
        
        console.log('\n🎉 All basic tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await jobQueue.close();
    }
}

// Run tests
testBasicFunctionality().catch(console.error);