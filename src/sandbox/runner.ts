import { writeFileSync } from 'fs';
import { join } from 'path';

const twoMinutes = 2 * 60 * 1000;

const executionTimeout = process.env.EXECUTION_TIMEOUT ? parseInt(process.env.EXECUTION_TIMEOUT) : twoMinutes;

interface RunScriptFunction {
    (): Promise<any> | any;
}

interface UserScript {
    runScript: RunScriptFunction;
}

async function executeUserScript(): Promise<void> {
    const startTime = Date.now();

    try {
        const userScriptPath = join('/app/scripts/user_script.ts');
        const userModule = (await import(userScriptPath)) as UserScript;

        if (typeof userModule.runScript !== 'function') {
            throw new Error('User script must export a runScript function');
        }

        const result = await Promise.race([
            Promise.resolve(userModule.runScript()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timeout')), executionTimeout))
        ]);

        const executionTime = Date.now() - startTime;

        const output = {
            success: true,
            result,
            executionTime,
            timestamp: new Date().toISOString()
        };

        writeFileSync('/app/output/result.json', JSON.stringify(output, null, 4));
    } catch (err) {
        const executionTime = Date.now() - startTime;
        const output = {
            success: false,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            executionTime,
            timestamp: new Date().toISOString()
        };

        writeFileSync('/app/output/result.json', JSON.stringify(output, null, 4));

        process.exit(1);
    }
}
