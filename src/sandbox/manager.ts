import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import Docker, { Container } from 'dockerode';
import fs, { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { copy } from 'fs-extra';
import { dirname, join } from 'path';
import * as tar from 'tar-fs';
import { PnLResult } from '../trading/types';
import { delays } from '../utils/delays';
import { getErrorMetadata } from '../utils/errors';
import { logDebug, logError, logInfo } from '../utils/logging';
import { FilteringProxy } from './proxy_server';

export interface SandboxConfig {
    script: string;
    workspaceFolder?: string;
    timeoutMs?: number;
    maxCpus?: number;
    maxMemoryMb?: number;
    maxStorageMb?: number;
    allowedEndpoints?: string[];
    injectedFunctions?: Record<string, (...args: any[]) => any>;
    files?: Record<string, string>;
    folders?: Record<string, string>;
}

export interface SandboxResult {
    success: boolean;
    executionTime: number;
    containerId: string;
    result?: PnLResult;
    error?: string;
}

export class SandboxManager {
    private docker: Docker;
    private imageName = 'trading-sandbox:latest';
    private runningContainers = new Map<string, Container>();
    private proxy: FilteringProxy | null = null;
    private proxyPort = 8888;
    private cleanOnEnd: boolean;

    constructor(dockerSocketPath: string, cleanOnEnd: boolean = true) {
        this.proxy = new FilteringProxy({
            port: this.proxyPort,
            allowedDomains: []
        });

        this.docker = new Docker({ socketPath: dockerSocketPath });
        this.cleanOnEnd = cleanOnEnd;
    }

    async initialize(): Promise<void> {
        if (this.proxy) {
            await this.proxy.start();
        }
    }

    async buildImage(): Promise<void> {
        console.log('Building Docker image...');

        const context = tar.pack(__dirname, {
            entries: ['Dockerfile', ...fs.readdirSync(__dirname)]
        });

        return new Promise((resolve, reject) => {
            this.docker.buildImage(
                context,
                {
                    t: this.imageName,
                    dockerfile: 'Dockerfile'
                },
                (err, stream) => {
                    if (err) return reject(err);
                    if (!stream) return reject(new Error('No build stream returned'));

                    // Print ALL events
                    this.docker.modem.followProgress(
                        stream,
                        (err) => {
                            if (err) return reject(err);
                            console.log('Image built successfully');
                            resolve();
                        },
                        (event) => {
                            if (event.stream && event.stream.startsWith('Step')) {
                                console.log(event.stream);
                            }

                            if (event.error) {
                                console.error(event.error);
                            }

                            if (event.status) {
                                console.log(event.status);
                            }

                            if (event.progress) {
                                console.log(event.progress);
                            }
                        }
                    );
                }
            );
        });
    }

    async executeScript(sandboxConfig: SandboxConfig): Promise<SandboxResult> {
        const containerId = `sandbox-${randomUUID()}`;

        let workDir = join(join(process.cwd(), 'temp'), containerId);
        if (sandboxConfig.workspaceFolder) {
            workDir = join('/sandbox-data', containerId);
        }

        const scriptsDir = join(workDir, 'scripts');
        const outputDir = join(workDir, 'output');

        try {
            // Create temporary directories
            mkdirSync(scriptsDir, { recursive: true });
            mkdirSync(outputDir, { recursive: true });

            if (sandboxConfig.workspaceFolder) {
                execSync(`chown -R 1000:1000 ${outputDir}`);
            }

            // Write user script to file
            writeFileSync(join(scriptsDir, 'user_script.ts'), sandboxConfig.script);

            // Write additional files
            if (sandboxConfig.files) {
                for (const [filename, content] of Object.entries(sandboxConfig.files)) {
                    mkdirSync(dirname(join(scriptsDir, filename)), { recursive: true });
                    writeFileSync(join(scriptsDir, filename), content);
                }
            }

            // Write additional folders
            if (sandboxConfig.folders) {
                for (const [sourceFolder, destinationFolder] of Object.entries(sandboxConfig.folders)) {
                    const destPath = join(scriptsDir, destinationFolder);
                    mkdirSync(destPath, { recursive: true });

                    await copy(sourceFolder, destPath);
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

            const scriptsSourceFolder = sandboxConfig.workspaceFolder ? join(sandboxConfig.workspaceFolder, containerId, 'scripts') : scriptsDir;
            const outputSourceFolder = sandboxConfig.workspaceFolder ? join(sandboxConfig.workspaceFolder, containerId, 'output') : outputDir;

            const hostConfig: Docker.HostConfig = {
                AutoRemove: true,
                ReadonlyRootfs: true,
                CpuCount: 1,
                NanoCpus: Math.floor((sandboxConfig.maxCpus || 0.5) * 1e9),
                Memory: (sandboxConfig.maxMemoryMb || 256) * 1024 * 1024,

                Tmpfs: {
                    '/tmp': 'rw,noexec,nosuid,size=10m'
                },

                CapDrop: ['ALL'],
                SecurityOpt: ['no-new-privileges'],

                Binds: [
                    `${scriptsSourceFolder}:/app/scripts:ro`,
                    `${outputSourceFolder}:/app/output:rw` //
                ]
            };

            let env: string[] = [];

            if (sandboxConfig.allowedEndpoints?.length) {
                hostConfig.NetworkMode = 'bridge';

                env.push(
                    `HTTP_PROXY=${proxyUrl}`,
                    `HTTPS_PROXY=${proxyUrl}`,
                    `http_proxy=${proxyUrl}`,
                    `https_proxy=${proxyUrl}`,
                    `NO_PROXY=localhost,127.0.0.1,::1`,
                    `no_proxy=localhost,127.0.0.1,::1`
                );
            } else {
                hostConfig.NetworkMode = 'none';
            }

            const container = await this.docker.createContainer({
                name: containerId,
                Image: this.imageName,
                Env: env,
                HostConfig: hostConfig
            });

            await this.runContainer(containerId, container, sandboxConfig.timeoutMs || delays.fiveMinutes);

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
            if (this.cleanOnEnd) {
                try {
                    rmSync(workDir, { recursive: true, force: true });
                    if (!sandboxConfig.workspaceFolder) {
                        rmSync(join(process.cwd(), 'temp'), { recursive: true, force: true });
                    }
                } catch (err) {
                    logError('Cleanup error', getErrorMetadata(err as Error));
                }

                await this.cleanup();
            }
        }
    }

    private async runContainer(containerId: string, container: Container, timeoutMs: number): Promise<void> {
        return new Promise(async (resolve, reject) => {
            this.runningContainers.set(containerId, container);

            let stderr = '';

            await container.start();

            const logStream = await container.logs({
                follow: true,
                stdout: true,
                stderr: true
            });

            logStream.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                if (text.includes('stderr')) {
                    stderr += text;
                    console.error('[Container Error]', text);
                } else {
                    console.log('[Container]', text);
                }
            });

            const timeout = setTimeout(async () => {
                logDebug(`Container ${containerId} timeout, stopping ...`);

                try {
                    await this.stopContainer(containerId);
                } catch {}

                reject(new Error('Container execution timeout'));
            }, timeoutMs);

            // Wait for the container to exit
            try {
                const result = await container.wait();

                clearTimeout(timeout);
                this.runningContainers.delete(containerId);

                if (result.StatusCode === 0) {
                    resolve();
                } else {
                    reject(new Error(`Container exited with code ${result.StatusCode}\n${stderr}`));
                }
            } catch (err) {
                clearTimeout(timeout);
                this.runningContainers.delete(containerId);

                reject(err);
            }
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
        const container = this.docker.getContainer(containerId);

        try {
            await container.kill({ signal: 'SIGTERM' });
        } catch (err: any) {
            if (err.statusCode !== 409 && err.statusCode !== 404) {
                throw err;
            }
        }

        try {
            await container.stop({ t: 2 });
        } catch (err: any) {
            if (err.statusCode !== 304 && err.statusCode !== 404) {
                throw err;
            }
        }

        this.runningContainers.delete(containerId);
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
