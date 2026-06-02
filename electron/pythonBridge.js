const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class PythonBridge extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.isReady = false;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.bootPromise = null;
  }

  async boot() {
    if (this.bootPromise) return this.bootPromise;

    this.bootPromise = new Promise((resolve, reject) => {
      console.log('AI Engine: Igniting Persistent Python Bridge...');
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = path.join(__dirname, '../python/bridge_server.py');

      this.process = spawn(pythonCmd, [scriptPath]);

      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (output.includes('BRIDGE_READY')) {
          console.log('AI Engine: Python Bridge Online & Synchronized.');
          this.isReady = true;
          resolve();
        }

        // Handle JSON responses
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const response = JSON.parse(line);
              if (this.pendingRequests.has(response.id)) {
                const { resolve, reject } = this.pendingRequests.get(response.id);
                if (response.error) reject(new Error(response.error));
                else resolve(response.result);
                this.pendingRequests.delete(response.id);
              }
            } catch (e) {
              // Not a full JSON or invalid
            }
          }
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error('Python Bridge Error:', data.toString());
      });

      this.process.on('close', (code) => {
        console.log(`Python Bridge Process closed with code ${code}`);
        this.isReady = false;
        this.bootPromise = null;
      });
    });

    return this.bootPromise;
  }

  async request(cmd, payload = {}) {
    if (!this.isReady) await this.boot();

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      
      const message = JSON.stringify({ id, cmd, payload }) + '\n';
      this.process.stdin.write(message);

      // Timeout safety
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Python Bridge Timeout for cmd: ${cmd}`));
        }
      }, 30000); // 30s timeout
    });
  }
}

// Singleton instances
const bridge = new PythonBridge();
module.exports = bridge;
