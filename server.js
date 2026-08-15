// =========================================================
// ShareMax — Node.js Zero-Dependency Local File Server
// (Optional Node backend using 100% built-in HTTP & FS)
// =========================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;
const SHARED_FILES_DIR = path.join(ROOT_DIR, 'shared_files');
const TEXT_FILE = path.join(ROOT_DIR, 'shared_text.json');

if (!fs.existsSync(SHARED_FILES_DIR)) {
    fs.mkdirSync(SHARED_FILES_DIR, { recursive: true });
}
if (!fs.existsSync(TEXT_FILE)) {
    fs.writeFileSync(TEXT_FILE, '[]', 'utf8');
}

// Get Local IPv4 Address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const localIP = getLocalIP();
const baseURL = `http://${localIP}:${PORT}`;

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-File-Size');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const decodedPath = decodeURIComponent(req.url.split('?')[0]);

    // API: Server Info
    if (decodedPath === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const fileCount = fs.readdirSync(SHARED_FILES_DIR).length;
        return res.end(JSON.stringify({ ip: localIP, port: PORT, url: baseURL, fileCount, status: 'online' }));
    }

    // API: List Files
    if (decodedPath === '/api/files' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        try {
            const files = fs.readdirSync(SHARED_FILES_DIR).map(name => {
                const filePath = path.join(SHARED_FILES_DIR, name);
                const stat = fs.statSync(filePath);
                return {
                    name: name,
                    size: stat.size,
                    modified: stat.mtime.toISOString().replace('T', ' ').substring(0, 19),
                    url: `/files/${encodeURIComponent(name)}`,
                    extension: path.extname(name).toLowerCase()
                };
            });
            return res.end(JSON.stringify(files));
        } catch (e) {
            return res.end(JSON.stringify([]));
        }
    }

    // API: Upload File (Stream)
    if (decodedPath === '/upload' && req.method === 'POST') {
        let fileName = req.headers['x-file-name'];
        if (!fileName) fileName = `Upload_${Date.now()}.bin`;
        fileName = path.basename(decodeURIComponent(fileName));

        const targetPath = path.join(SHARED_FILES_DIR, fileName);
        const writeStream = fs.createWriteStream(targetPath);

        req.pipe(writeStream);

        writeStream.on('finish', () => {
            console.log(`[+] Node Received File: ${fileName}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, filename: fileName }));
        });

        writeStream.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        });
        return;
    }

    // API: Text Sharing
    if (decodedPath === '/api/text') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                let list = [];
                try { list = JSON.parse(fs.readFileSync(TEXT_FILE, 'utf8')); } catch (e) {}
                list.unshift({ id: Date.now().toString(), text: body, time: new Date().toLocaleTimeString() });
                if (list.length > 50) list = list.slice(0, 50);
                fs.writeFileSync(TEXT_FILE, JSON.stringify(list, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
            return;
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            try {
                const data = fs.readFileSync(TEXT_FILE, 'utf8');
                return res.end(data);
            } catch (e) {
                return res.end('[]');
            }
        }
    }

    // Serve Shared Files (/files/...)
    if (decodedPath.startsWith('/files/')) {
        const fileName = path.basename(decodedPath.substring(7));
        const filePath = path.join(SHARED_FILES_DIR, fileName);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mime = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            return fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            return res.end('File Not Found');
        }
    }

    // Serve Static Frontend Files
    let relPath = decodedPath.substring(1);
    if (!relPath) relPath = 'index.html';
    const filePath = path.join(ROOT_DIR, relPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        return fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404);
        return res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log('============================================================');
    console.log('            ShareMax Node.js Hotspot Server                ');
    console.log('============================================================');
    console.log(` Access on any device at: ${baseURL}`);
    console.log(` Localhost: http://localhost:${PORT}`);
    console.log('============================================================');

    const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${startCmd} http://localhost:${PORT}`);
});
