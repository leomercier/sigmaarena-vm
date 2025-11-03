import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { delays } from '../utils/delays';
import { getErrorMetadata } from '../utils/errors';
import { logDebug, logError, logInfo } from '../utils/logging';
import { FilteringProxy } from './proxy_server';

export interface SandboxConfig {
    script: string;
    timeoutMs?: number;
    maxCpus?: number;
    maxMemoryMb?: number;
    maxStorageMb?: number;
    allowedEndpoints?: string[];
    injectedFunctions?: Record<string, (...args: any[]) => any>;
    files?: Record<string, string>;
}

export interface SandboxResult {
    success: boolean;
    result?: any;
    error?: string;
    executionTime: number;
    containerId: string;
}

export class SandboxManager {
    private imageName = 'trading-sandbox:latest';
    private runningContainers = new Map<string, ChildProcess>();
    private proxy: FilteringProxy | null = null;
    private proxyPort = 8888;

    constructor() {
        this.proxy = new FilteringProxy({
            port: this.proxyPort,
            allowedDomains: []
        });
    }

    async initialize(): Promise<void> {
        if (this.proxy) {
            await this.proxy.start();
        }
    }

    async buildImage(): Promise<void> {
        return new Promise((resolve, reject) => {
            logDebug('Building Docker image ...');

            const build = spawn('docker', ['build', '-f', 'dist/sandbox/Dockerfile', '-t', this.imageName, '.']);

            build.stdout?.on('data', (data) => console.log(data.toString()));
            build.stderr?.on('data', (data) => console.error(data.toString()));

            build.on('close', (code) => {
                if (code === 0) {
                    logDebug('Image built successfully');
                    resolve();
                } else {
                    reject(new Error(`Build failed with code ${code}`));
                }
            });
        });
    }

    async executeScript(sandboxConfig: SandboxConfig): Promise<SandboxResult> {
        const containerId = `sandbox-${randomUUID()}`;
        const workDir = join(process.cwd(), 'temp', containerId);
        const scriptsDir = join(workDir, 'scripts');
        const outputDir = join(workDir, 'output');

        try {
            // Create temporary directories
            mkdirSync(scriptsDir, { recursive: true });
            mkdirSync(outputDir, { recursive: true });

            // Write user script to file
            writeFileSync(join(scriptsDir, 'user_script.ts'), sandboxConfig.script);

            // Write additional files
            if (sandboxConfig.files) {
                for (const [filename, content] of Object.entries(sandboxConfig.files)) {
                    mkdirSync(dirname(join(scriptsDir, filename)), { recursive: true });
                    writeFileSync(join(scriptsDir, filename), content);
                }
            }

            // Write injected functions if provided
            if (sandboxConfig.injectedFunctions) {
                const functionsCode = this.generateInjectedFunctionsModule(sandboxConfig.injectedFunctions);
                writeFileSync(join(scriptsDir, 'injected_functions.js'), functionsCode);
            }

            // Update proxy with allowed endpoints
            if (this.proxy && sandboxConfig.allowedEndpoints && sandboxConfig.allowedEndpoints.length > 0) {
                this.proxy.updateAllowedDomains(sandboxConfig.allowedEndpoints);
            }

            // Get proxy URL for this platform
            const proxyUrl = await this.getProxyUrl();

            const dockerArgs = [
                'run',
                '--rm', // Re-enable this to auto-cleanup containers
                '--name',
                containerId,
                '--cpus',
                String(sandboxConfig.maxCpus || 0.5),
                '--memory',
                `${sandboxConfig.maxMemoryMb || 256}m`,
                // '--storage-opt',
                // `size=${sandboxConfig.maxStorageMb || 100}m`,
                '--read-only',
                '--tmpfs',
                '/tmp:rw,noexec,nosuid,size=10m',
                '--security-opt',
                'no-new-privileges',
                '--cap-drop',
                'ALL',
                '-v',
                `${scriptsDir}:/app/scripts:ro`,
                '-v',
                `${outputDir}:/app/output:rw`
            ];

            // Configure network based on allowed endpoints
            if (sandboxConfig.allowedEndpoints && sandboxConfig.allowedEndpoints.length > 0) {
                // Use bridge network with proxy
                dockerArgs.push('--network', 'bridge');
                dockerArgs.push('--add-host', 'host.docker.internal:host-gateway');
                dockerArgs.push('-e', `HTTP_PROXY=${proxyUrl}`);
                dockerArgs.push('-e', `HTTPS_PROXY=${proxyUrl}`);
                dockerArgs.push('-e', `http_proxy=${proxyUrl}`);
                dockerArgs.push('-e', `https_proxy=${proxyUrl}`);

                // Prevent proxy from being used for localhost/internal addresses
                dockerArgs.push('-e', `NO_PROXY=localhost,127.0.0.1,::1`);
                dockerArgs.push('-e', `no_proxy=localhost,127.0.0.1,::1`);

                logDebug(`Using proxy: ${proxyUrl}`);
            } else {
                // No network access
                dockerArgs.push('--network', 'none');
            }

            dockerArgs.push(this.imageName);

            await this.runContainer(containerId, dockerArgs, sandboxConfig.timeoutMs || delays.oneMinute);

            const resultPath = join(outputDir, 'result.json');
            const output = JSON.parse(readFileSync(resultPath, 'utf-8'));

            return {
                ...output,
                containerId
            };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
                executionTime: 0,
                containerId
            };
        } finally {
            this.runningContainers.delete(containerId);
            try {
                rmSync(workDir, { recursive: true, force: true });
                rmSync(join(process.cwd(), 'temp'), { recursive: true });
            } catch (err) {
                logError('Cleanup error', getErrorMetadata(err as Error));
            }

            await this.cleanup();
        }
    }

    private async runContainer(containerId: string, dockerArgs: string[], timeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const container = spawn('docker', dockerArgs);
            this.runningContainers.set(containerId, container);

            let stderr = '';

            container.stdout?.on('data', (data) => {
                console.log('[Container]', data.toString());
            });

            container.stderr?.on('data', (data) => {
                stderr += data.toString();
                console.error('[Container Error]', data.toString());
            });

            // Timeout handler
            const timeout = setTimeout(() => {
                logDebug(`Container ${containerId} timeout, stopping ...`);
                this.stopContainer(containerId);
                reject(new Error('Container execution timeout'));
            }, timeoutMs);

            container.on('close', (code) => {
                clearTimeout(timeout);
                this.runningContainers.delete(containerId);

                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Container exited with code ${code}\n${stderr}`));
                }
            });

            container.on('error', (error) => {
                clearTimeout(timeout);
                this.runningContainers.delete(containerId);
                reject(error);
            });
        });
    }

    private async getProxyUrl(): Promise<string> {
        const platform = process.platform;

        if (platform === 'darwin') {
            // On macOS, Docker Desktop runs in a VM. The easiest solution is to use the host's actual IP on the shared network
            return new Promise((resolve) => {
                const getIp = spawn('ipconfig', ['getifaddr', 'en0']);
                let ip = '';

                getIp.stdout?.on('data', (data) => {
                    ip += data.toString().trim();
                });

                getIp.on('close', (code) => {
                    if (code === 0 && ip) {
                        resolve(`http://${ip}:${this.proxyPort}`);
                    } else {
                        resolve(`http://host.docker.internal:${this.proxyPort}`);
                    }
                });

                getIp.on('error', () => {
                    resolve(`http://host.docker.internal:${this.proxyPort}`);
                });
            });
        } else if (platform === 'win32') {
            return `http://host.docker.internal:${this.proxyPort}`;
        } else {
            const hostIp = await this.getHostIp();
            return `http://${hostIp}:${this.proxyPort}`;
        }
    }

    private async getHostIp(): Promise<string> {
        // On macOS/Windows Docker Desktop, use host.docker.internal
        // On Linux, get the docker0 bridge IP
        const platform = process.platform;

        if (platform === 'darwin' || platform === 'win32') {
            // Docker Desktop provides host.docker.internal
            // But we need to verify the proxy is accessible
            return 'host.docker.internal';
        }

        // Linux: get docker0 bridge IP
        return new Promise((resolve) => {
            const ifconfig = spawn('ip', ['addr', 'show', 'docker0']);
            let output = '';

            ifconfig.stdout?.on('data', (data) => {
                output += data.toString();
            });

            ifconfig.on('close', () => {
                const match = output.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
                resolve(match ? match[1] : '172.17.0.1');
            });

            ifconfig.on('error', () => {
                resolve('172.17.0.1');
            });
        });
    }

    private generateInjectedFunctionsModule(functions: Record<string, (...args: any[]) => any>): string {
        // Serialize functions to a JavaScript module
        const functionExports = Object.entries(functions)
            .map(([name, fn]) => {
                // Convert function to string and export it
                return `export const ${name} = ${fn.toString()};`;
            })
            .join('\n\n');

        return functionExports;
    }

    async stopContainer(containerId: string): Promise<void> {
        const container = this.runningContainers.get(containerId);

        if (container) {
            container.kill('SIGTERM');
        }

        return new Promise((resolve) => {
            const stop = spawn('docker', ['stop', '-t', '2', containerId]);
            stop.on('close', () => {
                this.runningContainers.delete(containerId);
                resolve();
            });
        });
    }

    async listRunningContainers(): Promise<string[]> {
        return Array.from(this.runningContainers.keys());
    }

    async cleanup(): Promise<void> {
        const promises = Array.from(this.runningContainers.keys()).map((id) => this.stopContainer(id));
        await Promise.all(promises);

        if (this.proxy) {
            await this.proxy.stop();
            logInfo('Proxy stopped');
        }
    }
}
