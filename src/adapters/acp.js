const readline = require('readline');

class ACPAdapter {
  constructor(agentLoop, config) {
    this._agentLoop = agentLoop;
    this._config = config;
    this._sessions = new Map();
    this._chunkCb = null;
    this._acpWrite = null;
  }

  start() {
    this._acpWrite = process.stdout.write.bind(process.stdout);

    // Override process.stdout.write
    process.stdout.write = (chunk, encoding, callback) => {
      // Write to stderr (debug copy)
      process.stderr.write(chunk, encoding);

      if (this._chunkCb) {
        const text = chunk.toString();
        const stripped = text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\r/g, '');
        if (stripped.trim()) {
          this._chunkCb(stripped);
        }
      }
      if (typeof callback === 'function') callback();
      return true;
    };

    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false
    });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        this._dispatch(msg).catch(err => {
          if (msg.id !== undefined) {
            this._sendError(msg.id, -32603, err.message);
          }
        });
      } catch (e) {
        // Not a JSON or other parse error
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }

  async _dispatch(msg) {
    const { id, method, params } = msg;

    try {
      switch (method) {
        case 'initialize':
          this._sendResult(id, {
            agentCapabilities: {
              loadSession: false,
              promptCapabilities: {}
            }
          });
          break;
        default:
          if (id !== undefined) {
            this._sendError(id, -32601, `Method not found: ${method}`);
          }
          break;
      }
    } catch (e) {
      if (id !== undefined) {
        this._sendError(id, -32603, e.message);
      }
    }
  }

  _sendResult(id, result) {
    const msg = JSON.stringify({
      jsonrpc: "2.0",
      id,
      result
    }) + '\n';
    this._acpWrite(msg);
  }

  _sendError(id, code, message) {
    const msg = JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message }
    }) + '\n';
    this._acpWrite(msg);
  }

  _sendNotification(method, params) {
    const msg = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params
    }) + '\n';
    this._acpWrite(msg);
  }
}

module.exports = { ACPAdapter };
