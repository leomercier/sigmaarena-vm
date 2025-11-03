import { simulateTrade } from './simulate-trade/simulate_trade';

type CommandHandler = (args: string[]) => void | Promise<void>;

const commands: Record<string, CommandHandler> = {
    'simulate-trade': simulateTrade
};

export async function runCLI() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        printUsage();
    }

    const [commandName, ...commandArgs] = args;
    const command = commands[commandName];

    if (!command) {
        console.error(`Unknown command: "${commandName}"`);
        printUsage();
    }

    await command(commandArgs);
}

function printUsage() {
    console.log('Usage:');
    console.log('  npm run <command> [args...]');
    console.log('\nAvailable commands:');

    for (const name of Object.keys(commands)) {
        console.log(`  - ${name}`);
    }

    process.exit(1);
}
