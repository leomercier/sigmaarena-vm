import { getErrorMetadata } from '../utils/errors';
import { logError, logInfo } from '../utils/logging';
import { SandboxManager } from './manager';
import { FilteringProxy } from './proxy_server';

function testProxy() {
    const proxy = new FilteringProxy({
        port: 8888,
        allowedDomains: ['api.github.com', 'github.com', 'www.googleapis.com']
    });

    proxy.start().catch(console.error);

    process.on('SIGINT', async () => {
        await proxy.stop();
        process.exit(0);
    });
}

async function testManager() {
    const manager = new SandboxManager();

    try {
        await manager.initialize();

        await manager.buildImage();

        // Define functions to inject into the sandbox
        const injectedFunctions = {
            logInfo: (message: string) => {
                console.log('[INFO]', message);
            },

            getCurrentTime: () => {
                return new Date().toISOString();
            },

            multiply: (a: number, b: number) => {
                return a * b;
            },

            fetchData: async (key: string) => {
                return { key, value: 'some data', timestamp: Date.now() };
            }
        };

        const userScript = `
            import axios from 'axios';

            // TypeScript declarations for injected functions
            declare global {
                function logInfo(message: string): void;
                function getCurrentTime(): string;
                function multiply(a: number, b: number): number;
                function fetchData(key: string): Promise<{ key: string; value: string; timestamp: number }>;
            }

            export async function runScript() {
                // Use injected functions
                logInfo('Script started');
                
                const startTime = getCurrentTime();
                logInfo('Start time: ' + startTime);
                
                const product = multiply(6, 7);
                logInfo('6 * 7 = ' + product);
                
                // Use async injected function
                const data = await fetchData('myKey');
                logInfo('Fetched data: ' + JSON.stringify(data));
                
                // Regular axios call
                const response = await axios.get('https://api.github.com/repos/microsoft/typescript');
                
                return {
                    name: response.data.name,
                    stars: response.data.stargazers_count,
                    calculation: product,
                    customData: data
                };
            }
        `;

        const result = await manager.executeScript({
            script: userScript,
            timeoutMs: 30000,
            maxCpus: 1,
            maxMemoryMb: 256,
            allowedEndpoints: ['api.github.com'],
            injectedFunctions: injectedFunctions
        });

        logInfo('Execution result', result);
    } catch (err) {
        logError('Execution failed', getErrorMetadata(err as Error));
    } finally {
        await manager.cleanup();
    }
}

// testProxy();
// testManager();
