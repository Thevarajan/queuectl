# QueueCtl - CLI-based Background Job Queue System

A robust, production-ready background job queue system with CLI interface, built with Node.js and SQLite.

## 🚀 Features

### Core Features
- ✅ **Job Queue Management**: Enqueue, dequeue, and manage background jobs
- ✅ **Persistent Storage**: Jobs persist after application restart using SQLite
- ✅ **Dead Letter Queue**: Failed jobs are moved to a separate queue for analysis
- ✅ **Retry Mechanism**: Automatic retry with configurable maximum attempts
- ✅ **Exponential Backoff**: Smart retry delays that increase over time
- ✅ **Worker Management**: Multi-worker support with graceful shutdown
- ✅ **Job States**: Track job lifecycle (pending, processing, completed, failed, dead)

### Bonus Features
- ✅ **CLI Interface**: Full-featured command-line interface with colored output
- ✅ **Configuration Management**: Configurable retry limits and backoff settings
- ✅ **Job Statistics**: Comprehensive job statistics and reporting
- ✅ **Dead Letter Queue Management**: View and retry failed jobs
- ✅ **Worker Monitoring**: Real-time worker status and job processing
- ✅ **Table-based Output**: Clean, formatted table output for better readability
- ✅ **Graceful Shutdown**: Workers complete current jobs before shutting down
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Job Timeout Handling**: Jobs will be terminated if they exceed their specified timeout
- ✅ **Job Output Logging**: The output of each job is captured and stored in the database
- ✅ **Priority Queues**: Jobs can be assigned a priority, and the queue will process higher-priority jobs first
- ✅ **Scheduled/Delayed Jobs**: Jobs can be scheduled to run at a future time
- ✅ **Metrics/Execution Stats**: A `metrics` command provides detailed statistics about job execution
- ✅ **Web Dashboard**: A minimal web dashboard provides a real-time view of the job queue

## 🎥 Demo

A working demo of the CLI can be found here: [link-to-your-demo]

## 📦 Installation

```bash
npm install
```

## 🎯 Quick Start

### 1. Start Workers
```bash
# Start 1 worker
node src/cli.js worker start

# Start multiple workers
node src/cli.js worker start --count 3
```

### 2. Enqueue Jobs
```bash
# Enqueue a simple command
node src/cli.js enqueue '{"command": "echo Hello World"}'

# Enqueue a job with custom max retries
node src/cli.js enqueue '{"command": "node my-script.js", "max_retries": 5}'
```

### 3. Monitor Status
```bash
# View overall status
node src/cli.js status

# List pending jobs
node src/cli.js list --state pending

# List completed jobs
node src/cli.js list --state completed
```

### 4. Manage Failed Jobs
```bash
# View dead letter queue
node src/cli.js dlq list

# Retry a dead job
node src/cli.js dlq retry <job-id>
```

## 📋 CLI Commands

### Job Management
- `enqueue <job-data>` - Add a new job to the queue
- `status` - Show summary of all job states and active workers
- `list [options]` - List jobs by state (pending, processing, completed, failed, dead)

### Worker Management
- `worker start [options]` - Start one or more workers
- `worker stop` - Stop running workers (use Ctrl+C instead)

### Dead Letter Queue
- `dlq list [options]` - List jobs in dead letter queue
- `dlq retry <job-id>` - Retry a specific job from dead letter queue

### Options
- `--count <number>` - Number of workers to start (default: 1)
- `--state <state>` - Filter jobs by state (default: pending)
- `--limit <number>` - Maximum number of jobs to show (default: 20)
- `--db-path <path>` - Database file path (default: queue.db)

## 🔧 Configuration

The system supports configurable settings:

- `max_retries` - Maximum retry attempts (default: 3)
- `backoff_base` - Base for exponential backoff calculation (default: 2)
- `worker_timeout` - Worker timeout in seconds (default: 300)

Configuration is stored in the SQLite database and can be modified through the API.

## 🏗️ Architecture

### Module Structure
```
lib/
├── database.js      # SQLite database management
├── job.js          # Job class definition
├── jobQueue.js     # Job queue operations
└── workerManager.js # Worker management and job execution
```

### Database Schema
- **jobs**: Main job queue table with state tracking
- **dead_letter_queue**: Failed jobs storage
- **config**: System configuration settings

### Job Lifecycle
1. **pending** → Job is queued and waiting for processing
2. **processing** → Worker has picked up the job
3. **completed** → Job finished successfully
4. **failed** → Job failed but can be retried
5. **dead** → Job exhausted all retry attempts and moved to DLQ

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Basic Tests
```bash
node test/test.js
```

### Run Comprehensive Tests
```bash
node test/comprehensive-test.js
```

### Test Persistence
```bash
node test-persistence.js
```

## 🎨 CLI Examples

### Enqueue Multiple Jobs
```bash
# Job that will succeed
node src/cli.js enqueue '{"command": "echo \"Job completed successfully\""}'

# Job that will fail (command doesn't exist)
node src/cli.js enqueue '{"command": "nonexistent-command"}'

# Job with custom retry settings
node src/cli.js enqueue '{"command": "curl -s https://api.example.com", "max_retries": 5}'
```

### Monitor Job Processing
```bash
# Watch status in one terminal
watch -n 1 "node src/cli.js status"

# In another terminal, enqueue jobs and watch them process
node src/cli.js enqueue '{"command": "sleep 2 && echo Done"}'
```

### Handle Failed Jobs
```bash
# View failed jobs
node src/cli.js dlq list

# Retry a specific failed job
node src/cli.js dlq retry job_1234567890_abc123

# Clear dead letter queue (manual cleanup)
```

## 🔒 Error Handling

The system includes comprehensive error handling:

- **Database Errors**: Automatic reconnection and transaction rollback
- **Worker Errors**: Graceful worker restart and job failure handling
- **Command Errors**: Detailed error messages and proper job state management
- **CLI Errors**: User-friendly error messages with suggestions

## 📊 Performance Considerations

- **SQLite**: Lightweight, serverless database perfect for small to medium workloads
- **Worker Pool**: Configurable worker count based on CPU cores
- **Memory Efficient**: Streaming job processing with minimal memory footprint
- **Indexed Queries**: Optimized database indexes for fast job retrieval

## 🛠️ Development

### Project Structure
```
queuectl/
├── lib/              # Core library modules
├── src/              # CLI application
├── test/             # Test suites
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

### Key Classes
- **Job**: Represents a single job with state management
- **JobQueue**: Manages job queue operations
- **WorkerManager**: Handles worker lifecycle and job execution
- **Database**: SQLite database abstraction layer

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**QueueCtl** - Built with ❤️ for reliable background job processing.