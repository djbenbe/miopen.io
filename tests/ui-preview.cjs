const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../extras/web_interface_data');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function createPreviewServer() {
    const devices = [
        { id: '123456', protocol: '1W', name: 'Demo woonkamer', position: 65, travel_time: 20, paired: true },
        { id: '654321', protocol: '2W', name: '654321', state: 'SAVED' }
    ];
    let pairingStarted = 0;
    let saved = false;
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        res.setHeader('Cache-Control', 'no-store');
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname === '/api/2w/status') {
                const active = pairingStarted && Date.now() - pairingStarted < 6000;
                if (pairingStarted && !active && !saved) {
                    devices.push({ id: 'abcdef', protocol: '2W', name: 'abcdef', state: 'SAVED' });
                    saved = true;
                }
                return json({ pairingActive: !!active, pairingRemainingMs: active ? 90000 - (Date.now() - pairingStarted) : 0,
                    lastTxCommand: pairingStarted ? 'pair2W' : '', lastTxResult: !pairingStarted ? '' : active
                        ? '2W pairing started; waiting for device' : '2W pairing completed and saved: abcdef' });
            }
            if (url.pathname === '/api/devices') return json(devices);
            if (url.pathname === '/api/remotes' || url.pathname === '/api/logs') return json([]);
            if (url.pathname === '/api/info') return json({ version: 'UI preview (simulatie)', branch: 'dev' });
            if (url.pathname === '/api/command') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const { command } = JSON.parse(body);
                        if (command === 'pair2W') { pairingStarted = Date.now(); saved = false; }
                        if (command.startsWith('new1W ')) devices.push({ id: '111111', protocol: '1W', name: command.slice(6), position: 0 });
                        json({ success: true, message: 'Demo command accepted' });
                    } catch { res.statusCode = 400; json({ success: false }); }
                });
                return;
            }
            return json({});
        }
        let name;
        try { name = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
        const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(file, (error, data) => {
            if (error) { res.writeHead(404).end(); return; }
            res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
            res.end(data);
        });
    });
}

module.exports = { createPreviewServer };
if (require.main === module) {
    const port = Number(process.argv[2] || 8790);
    createPreviewServer().listen(port, '127.0.0.1', () => console.log(`UI preview with simulated devices: http://127.0.0.1:${port}`));
}
