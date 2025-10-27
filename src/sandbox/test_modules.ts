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

        const userScript = `
            import axios from 'axios';

            export async function runScript() {
                const response = await axios.get('https://api.github.com/repos/microsoft/typescript');
                return {
                    name: response.data.name,
                    stars: response.data.stargazers_count
                };
            }
        `;

        const result = await manager.executeScript({
            script: userScript,
            timeoutMs: 30000,
            maxCpus: 1,
            maxMemoryMb: 256,
            allowedEndpoints: ['api.github.com']
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
