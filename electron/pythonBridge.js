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
    this._pending = new Map(); // requestId -> { resolve, reject, timeout, mode }
    this._rl = null;
    this._booted = false;
    this._booting = false;
    this._TIMEOUT_MS = 300000;
    this._reqCounter = 0;
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

        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (e) {
          console.error(`[bridge] Fatal JSON parse error from Python: ${line}`);
          return;
        }

        // 1. Ready signal logic
        if (initialResponse && parsed.ready) {
          this._booted = true;
          this._booting = false;
          initialResponse = false;
          this.emit('booted');
          resolve();
          return;
        }

        // 2. ID-based Matching
        const requestId = parsed.request_id;
        if (requestId === undefined || requestId === null) {
          // Check if this is the "ready" signal arriving late
          if (!parsed.ready) {
            console.warn("[bridge] Response missing request_id (ignoring):", parsed);
          }
          return;
        }

        const pending = this._pending.get(requestId);
        if (!pending) {
          // This is likely a late response for a request that already timed out
          console.warn(`[bridge] Received late response for ID: ${requestId} (${parsed.mode}). Discarding.`);
          return;
        }

        // Cleanup and Resolve/Reject order: 1. Timer, 2. Map, 3. Callback
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        this._pending.delete(requestId);

        if (parsed.error) {
          pending.reject(new Error(`Python Error [${pending.mode}]: ${parsed.error}`));
        } else {
          pending.resolve(parsed);
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
    for (const [id, pending] of this._pending) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(new Error(errorMsg));
    }
    this._pending.clear();
  }

  request(mode, payload) {
    const requestId = ++this._reqCounter;

    return new Promise((resolve, reject) => {
      if (!this._booted) {
        return reject(new Error('PythonBridge not booted — call bridge.boot() first'));
      }

      const timeout = setTimeout(() => {
        if (this._pending.has(requestId)) {
          this._pending.delete(requestId);
          reject(new Error(`PythonBridge request timeout [${mode}][id:${requestId}] after ${this._TIMEOUT_MS}ms`));
        }
      }, this._TIMEOUT_MS);

      this._pending.set(requestId, { resolve, reject, timeout, mode });

      const msg = JSON.stringify({ request_id: requestId, mode, ...payload }) + '\n';
      this._proc.stdin.write(msg, err => {
        if (err) {
          if (this._pending.has(requestId)) {
            this._pending.delete(requestId);
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
    this._pending.clear();
  }
}

// Export singleton
module.exports = new PythonBridge();