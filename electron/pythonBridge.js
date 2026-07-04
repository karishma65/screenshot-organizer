// pythonBridge.js — node.js side (Dynamic Clustering support)
//communication layer between Node.js and Python AI services. 
// efficiently without repeatedly starting Python."

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const EventEmitter = require('events');

const PYTHON_SCRIPT = path.join(__dirname, '..', 'python', 'analyzer.py');

class PythonBridge extends EventEmitter {
  constructor() {
    super();
    this._proc = null;
    this._queue = [];       // pending { resolve, reject, timeout }
    this._rl = null;
    this._booted = false;
    this._booting = false;
    this._TIMEOUT_MS = 120000;
  }

  // ── Boot / keep-alive ──────────────────────────────────────────────────────

  async boot() {
    if (this._booted) return;
    if (this._booting) return new Promise(r => this.once('booted', r));
    this._booting = true;

    return new Promise((resolve, reject) => {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      this._proc = spawn(pythonCmd, [PYTHON_SCRIPT, '--bridge'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this._rl = readline.createInterface({ input: this._proc.stdout });

      let initialResponse = true;
      this._rl.on('line', line => {
        if (!line.trim()) return;

        // Ready signal logic
        if (initialResponse) {
          try {
            const msg = JSON.parse(line);
            if (msg.ready) {
              this._booted = true;
              this._booting = false;
              initialResponse = false;
              this.emit('booted');
              resolve();
              return;
            }
          } catch (e) { }
        }

        const pending = this._queue.shift();
        if (!pending) return;

        if (pending.timeout) clearTimeout(pending.timeout);

        try {
          pending.resolve(JSON.parse(line));
        } catch (e) {
          pending.reject(new Error(`Bridge JSON parse error: ${line}`));
        }
      });

      this._proc.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg) console.error('[pythonBridge stderr]', msg);
      });

      this._proc.on('error', err => {
        this._cleanupQueue(`Bridge process error: ${err.message}`);
        this._booted = false;
        this._booting = false;
        reject(err);
      });

      this._proc.on('exit', (code) => {
        const msg = `Python bridge exited unexpectedly with code ${code}`;
        console.warn(`[pythonBridge] ${msg}`);
        this._cleanupQueue(msg);
        this._booted = false;
        this._booting = false;
      });

      // Fallback: assume ready after 10s if no signal
      setTimeout(() => {
        if (this._booting) {
          this._booted = true;
          this._booting = false;
          initialResponse = false;
          this.emit('booted');
          resolve();
        }
      }, 10000);
    });
  }

  _cleanupQueue(errorMsg) {
    while (this._queue.length) {
      const pending = this._queue.shift();
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(new Error(errorMsg));
    }
  }

  request(mode, payload) {
    return new Promise((resolve, reject) => {
      if (!this._booted) {
        return reject(new Error('PythonBridge not booted — call bridge.boot() first'));
      }

      const timeout = setTimeout(() => {
        const idx = this._queue.findIndex(p => p.reject === reject);
        if (idx !== -1) {
          this._queue.splice(idx, 1);
          reject(new Error(`PythonBridge request timeout [${mode}] after ${this._TIMEOUT_MS}ms`));
        }
      }, this._TIMEOUT_MS);

      this._queue.push({ resolve, reject, timeout });

      const msg = JSON.stringify({ mode, ...payload }) + '\n';
      this._proc.stdin.write(msg, err => {
        if (err) {
          const idx = this._queue.findIndex(p => p.reject === reject);
          if (idx !== -1) {
            this._queue.splice(idx, 1);
            clearTimeout(timeout);
            reject(err);
          }
        }
      });
    });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  destroy() {
    if (this._rl) {
      this._rl.close();
      this._rl = null;
    }
    if (this._proc) {
      try {
        this._proc.stdin.end();
        this._proc.kill();
      } catch (e) { }
      this._proc = null;
      this._booted = false;
      this._booting = false;
    }
  }
}

// Export singleton
module.exports = new PythonBridge();