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
    this._queue = [];       // pending { resolve, reject } in FIFO order
    this._booted = false;
    this._booting = false;
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

      const rl = readline.createInterface({ input: this._proc.stdout });
      rl.on('line', line => {
        if (!line.trim()) return;
        const pending = this._queue.shift();
        if (!pending) return;
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
        this._booted = false;
        this._booting = false;
        reject(err);
      });

      this._proc.on('exit', (code) => {
        console.warn(`[pythonBridge] Python exited with code ${code}`);
        this._booted = false;
        this._booting = false;
        // Reject any queued requests
        while (this._queue.length) {
          this._queue.shift().reject(new Error('Python bridge exited unexpectedly'));
        }
      });

      // Ready signal: Python prints {"ready":true} on startup
      const readyRl = readline.createInterface({ input: this._proc.stdout });
      readyRl.once('line', line => {
        try {
          const msg = JSON.parse(line);
          if (msg.ready) {
            this._booted = true;
            this._booting = false;
            this.emit('booted');
            resolve();
          }
        } catch (_) {
          resolve(); // Best-effort: treat first line as ready signal
        }
      });

      // Fallback: assume ready after 5 s
      setTimeout(() => {
        if (!this._booted) {
          this._booted = true;
          this._booting = false;
          this.emit('booted');
          resolve();
        }
      }, 5000);
    });
  }

  // ── Core request dispatcher ────────────────────────────────────────────────

  /**
   * Send a request to the Python bridge and await its response.
   *
   * Supported modes and their payloads:
   *
   *   'semantic'   { text: string }
   *     → Python runs analyze_semantic(text) which auto-creates or reuses a cluster.
   *     → Returns: string cluster_name  (e.g. "Photosynthesis_Cell")  or "NONE"
   *
   *   'cluster_id' { cluster_name: string }
   *     → Python looks up study_clusters.id by cluster_name.
   *     → Returns: { cluster_id: number | null }
   *
   *   'embedding'  { text: string }
   *     → Returns: Float32 array (vector)
   *
   *   'layout'     { image_path: string }
   *     → Returns: { layout: string, confidence: number }
   *
   *   'visual'     { image_path: string }
   *     → Returns: Array<{ label, confidence }>
   */
  request(mode, payload) {
    return new Promise((resolve, reject) => {
      if (!this._booted) {
        reject(new Error('PythonBridge not booted — call bridge.boot() first'));
        return;
      }

      this._queue.push({ resolve, reject });

      const msg = JSON.stringify({ mode, ...payload }) + '\n';
      this._proc.stdin.write(msg, err => {
        if (err) {
          this._queue.pop();
          reject(err);
        }
      });
    });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  destroy() {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
      this._booted = false;
    }
  }
}

// Export singleton
module.exports = new PythonBridge();