import { runCLI } from './commands/cli';

function main() {
    runCLI().catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
}

main();
