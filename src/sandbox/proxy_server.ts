import http from 'http';
import https from 'https';
import net from 'net';
import { URL } from 'url';
import { getErrorMetadata } from '../utils/errors';
import { logDebug } from '../utils/logging';

interface ProxyConfig {
    port: number;
    allowedDomains: string[];
}

export class FilteringProxy {
    private server: http.Server | null = null;
    private allowedDomains: Set<string>;
    private port: number;

    constructor(config: ProxyConfig) {
        this.port = config.port;
        this.allowedDomains = new Set(config.allowedDomains.map((d) => d.toLowerCase()));
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('connect', (req, clientSocket, head) => {
                this.handleConnect(req, clientSocket, head);
            });

            this.server.setMaxListeners(100);

            this.server.listen(this.port, '0.0.0.0', () => {
                logDebug(`Filtering proxy listening on port ${this.port}`);
                logDebug(`Allowed domains: ${Array.from(this.allowedDomains).join(', ')}`);
                resolve();
            });

            this.server.on('error', reject);
        });
    }

    private isAllowed(hostname: string): boolean {
        const lowerHostname = hostname.toLowerCase();

        if (this.allowedDomains.has(lowerHostname)) {
            return true;
        }

        for (const allowed of this.allowedDomains) {
            if (lowerHostname.endsWith('.' + allowed)) {
                return true;
            }
        }

        return false;
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const urlStr = req.url || '';

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(urlStr);
        } catch {
            const host = req.headers.host || '';
            parsedUrl = new URL(`http://${host}${urlStr}`);
        }

        logDebug(`[Proxy] HTTP ${req.method} ${parsedUrl.hostname}${parsedUrl.pathname}`);

        if (!this.isAllowed(parsedUrl.hostname)) {
            logDebug(`[Proxy] Blocked: ${parsedUrl.hostname}`);

            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end(`Access denied: ${parsedUrl.hostname} is not in the allowed domains list`);

            return;
        }

        logDebug(`[Proxy] Allowed: ${parsedUrl.hostname}`);

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: { ...req.headers }
        };

        delete options.headers['proxy-connection'];
        delete options.headers['proxy-authorization'];

        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const proxyReq = protocol.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            logDebug('[Proxy] Error', getErrorMetadata(err));

            res.writeHead(502);
            res.end('Bad Gateway');
        });

        req.pipe(proxyReq);
    }

    private handleConnect(req: http.IncomingMessage, clientSocket: any, head: Buffer) {
        const [hostname, port] = (req.url || '').split(':');

        logDebug(`[Proxy] CONNECT ${hostname}:${port}`);

        if (!this.isAllowed(hostname)) {
            logDebug(`[Proxy] Blocked: ${hostname}`);

            clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            clientSocket.end();
            return;
        }

        logDebug(`[Proxy] Allowed: ${hostname}`);

        const serverSocket = net.connect(parseInt(port) || 443, hostname, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

            if (head && head.length > 0) {
                serverSocket.write(head);
            }

            serverSocket.pipe(clientSocket);
            clientSocket.pipe(serverSocket);
        });

        serverSocket.on('error', (err: any) => {
            logDebug('[Proxy] Connect error', getErrorMetadata(err));

            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.end();
        });

        clientSocket.on('error', (err: any) => {
            logDebug('[Proxy] Client socket error', getErrorMetadata(err));
            serverSocket.end();
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logDebug('Proxy server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    updateAllowedDomains(domains: string[]) {
        this.allowedDomains = new Set(domains.map((d) => d.toLowerCase()));
        logDebug('Updated allowed domains', { domains: Array.from(this.allowedDomains) });
    }
}
