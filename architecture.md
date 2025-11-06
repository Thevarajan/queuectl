# Architecture and Design

This document provides a detailed overview of the architecture and design of the QueueCtl system.

## Core Components

The system is composed of several core components that work together to provide a robust and reliable job queue:

- **`Job`**: A class representing a single job, containing all its state and metadata.
- **`JobQueue`**: Manages the persistence and retrieval of jobs from the database.
- **`WorkerManager`**: Responsible for managing a pool of worker processes that execute jobs.
- **`Database`**: An abstraction layer for the SQLite database, handling all database operations.
- **`WebDashboard`**: A web-based interface for monitoring the job queue.
- **`CLI`**: The command-line interface for interacting with the system.

## Job Lifecycle

| **State** | **Description** |
| --- | --- |
| `pending` | Waiting to be picked up by a worker |
| `processing` | Currently being executed |
| `completed` | Successfully executed |
| `failed` | Failed, but retryable |
| `dead` | Permanently failed (moved to DLQ) |

## Database Schema

The database schema is designed to be simple and efficient, with three main tables:

-   **`jobs`**: Stores all the jobs and their current state.
-   **`dead_letter_queue`**: Stores jobs that have failed and exhausted all their retry attempts.
-   **`config`**: Stores system-wide configuration settings.

## Worker Management

The `WorkerManager` is responsible for managing a pool of worker processes. It can start and stop workers, and it monitors their health. If a worker dies, the `WorkerManager` will automatically restart it.

## Error Handling

The system is designed to be resilient to errors. It includes a comprehensive error handling strategy that includes:

-   **Automatic retries**: Jobs that fail are automatically retried with an exponential backoff strategy.
-   **Dead letter queue**: Jobs that exhaust all their retry attempts are moved to a dead letter queue for manual inspection.
-   **Graceful shutdown**: Workers are gracefully shut down, ensuring that they complete their current job before exiting.