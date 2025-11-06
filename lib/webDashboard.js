const http = require('http');
const url = require('url');
const JobQueue = require('./jobQueue');
const chalk = require('chalk');

class WebDashboard {
    constructor(dbPath = null, port = 8080) {
        this.jobQueue = new JobQueue(dbPath);
        this.port = port;
        this.server = null;
    }

    async initialize() {
        await this.jobQueue.initialize();
    }

    async start() {
        this.server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const path = parsedUrl.pathname;

            try {
                if (path === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(await this.generateDashboard());
                } else if (path === '/api/stats') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(await this.getStats()));
                } else if (path === '/api/jobs') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    const state = parsedUrl.query.state || 'pending';
                    const limit = parseInt(parsedUrl.query.limit) || 20;
                    const jobs = await this.jobQueue.listJobs(state, limit);
                    res.end(JSON.stringify(jobs));
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                }
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Error: ${error.message}`);
            }
        });

        this.server.listen(this.port, () => {
            console.log(chalk.green(`🌐 Web dashboard running at http://localhost:${this.port}`));
        });
    }

    async getStats() {
        const stats = await this.jobQueue.getJobStats();
        const completedJobs = await this.jobQueue.listJobs('completed', 100);
        
        const totalCompleted = completedJobs.length;
        const avgExecutionTime = totalCompleted > 0 
            ? Math.round(completedJobs.reduce((sum, job) => sum + (job.execution_time_ms || 0), 0) / totalCompleted)
            : 0;
        
        return {
            ...stats,
            totalCompleted,
            avgExecutionTime,
            successRate: totalCompleted > 0 ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100) : 0
        };
    }

    async generateDashboard() {
        const stats = await this.getStats();
        const recentJobs = await this.jobQueue.listJobs('pending', 10);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QueueCtl Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
        }
        .pending { color: #f39c12; }
        .processing { color: #3498db; }
        .completed { color: #27ae60; }
        .failed { color: #e74c3c; }
        .dead { color: #95a5a6; }
        .jobs-table {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .refresh-btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 20px;
        }
        .refresh-btn:hover {
            background: #2980b9;
        }
        .timestamp {
            text-align: center;
            color: #666;
            margin-top: 20px;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 QueueCtl Dashboard</h1>
        
        <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number pending">${stats.pending}</div>
                <div class="stat-label">Pending Jobs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number processing">${stats.processing}</div>
                <div class="stat-label">Processing Jobs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number completed">${stats.completed}</div>
                <div class="stat-label">Completed Jobs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number failed">${stats.failed}</div>
                <div class="stat-label">Failed Jobs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.successRate}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.avgExecutionTime}ms</div>
                <div class="stat-label">Avg Execution Time</div>
            </div>
        </div>
        
        <div class="jobs-table">
            <table>
                <thead>
                    <tr>
                        <th>Job ID</th>
                        <th>Command</th>
                        <th>Priority</th>
                        <th>Attempts</th>
                        <th>Created</th>
                        <th>Scheduled</th>
                    </tr>
                </thead>
                <tbody>
                    ${recentJobs.map(job => `
                        <tr>
                            <td>${job.id.substring(0, 8)}...</td>
                            <td>${job.command}</td>
                            <td>${job.priority}</td>
                            <td>${job.attempts}/${job.max_retries}</td>
                            <td>${new Date(job.created_at).toLocaleString()}</td>
                            <td>${job.run_at ? new Date(job.run_at).toLocaleString() : 'Immediate'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="timestamp">
            Last updated: ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>
        `;
    }

    async stop() {
        if (this.server) {
            this.server.close();
            console.log(chalk.yellow('🌐 Web dashboard stopped'));
        }
        await this.jobQueue.close();
    }
}

module.exports = WebDashboard;