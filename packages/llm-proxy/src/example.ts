import axios, { AxiosInstance } from 'axios';
import z from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import config from './config/config';
import { startServer } from './index';

const BASE_URL = `http://localhost:${config.port}/api`;

const TEST_USER_ID = 'test-user-123';
const TEST_SESSION_ID = 'test-session-456';
const TEST_BUDGET = 0.001; // Low budget to test limits

const client: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    validateStatus: () => true // Don't throw on any status code
});

function printSection(title: string) {
    console.log('\n' + '='.repeat(60));
    console.log(`📋 ${title}`);
    console.log('='.repeat(60));
}

function printSuccess(message: string) {
    console.log(`✅ ${message}`);
}

function printError(message: string) {
    console.log(`❌ ${message}`);
}

function printInfo(message: string) {
    console.log(`ℹ️  ${message}`);
}

async function waitForServer(maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await client.get('/status');
            if (response.status === 200) {
                printSuccess('Server is ready');
                return;
            }
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error('Server failed to start');
}

async function testCreateSession(): Promise<void> {
    printSection('Test 1: Create Session');

    const response = await client.post('/session', {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        budget: TEST_BUDGET
    });

    if (response.status === 201) {
        printSuccess('Session created successfully');

        console.log(`Budget: $${response.data.session.budget}`);
        console.log(`Session ID: ${response.data.session.sessionId}`);
        console.log(`User ID: ${response.data.session.userId}`);
    } else {
        printError(`Failed to create session: ${response.status}`);

        console.log(response.data);
    }
}

async function testSimpleInference(): Promise<void> {
    printSection('Test 2: Simple Text Generation (No Tools)');

    const response = await client.post('/inference', {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        provider: config.languageModelProvider,
        model: config.languageModelModelName,
        mode: 'generateText',
        messages: [
            {
                role: 'user',
                content: 'Say "Hello from LLM Proxy!" and nothing else.'
            }
        ],
        maxTokens: 1000
    });

    if (response.status === 200) {
        printSuccess('Inference completed');

        const usage = response.data.usage;

        console.log(`Response: "${response.data.content}"`);
        console.log(`Tokens: ${usage.totalTokens} (${usage.promptTokens} prompt + ${usage.completionTokens} completion)`);
        console.log(`Cost: $${response.data.cost.toFixed(6)}`);
        console.log(`Remaining Budget: $${response.data.remainingBudget.toFixed(6)}`);
    } else {
        printError(`Inference failed: ${response.status}`);
        console.log(response.data);
    }
}

async function testInferenceWithThinkTool(): Promise<void> {
    printSection('Test 3: Text Generation with Think Tool');

    const response = await client.post('/inference', {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        provider: config.languageModelProvider,
        model: config.languageModelModelName,
        mode: 'generateText',
        messages: [
            {
                role: 'user',
                content: 'What is 2+2? Think about it first, then answer.'
            }
        ],
        tools: ['think'],
        maxTokens: 1000
    });

    if (response.status === 200) {
        printSuccess('Inference with tool completed');

        console.log(`Response: "${response.data.content}"`);
        console.log(`Tool Calls: ${response.data.toolCalls?.length || 0}`);

        if (response.data.toolCalls && response.data.toolCalls.length > 0) {
            response.data.toolCalls.forEach((tc: any, idx: number) => {
                console.log(`  Tool ${idx + 1}: ${tc.name}`);
            });
        }

        console.log(`Tokens: ${response.data.usage.totalTokens}`);
        console.log(`Cost: $${response.data.cost.toFixed(6)}`);
        console.log(`Remaining Budget: $${response.data.remainingBudget.toFixed(6)}`);
    } else {
        printError(`Inference failed: ${response.status}`);

        console.log(response.data);
    }
}

async function testInferenceWithTimeTool(): Promise<void> {
    printSection('Test 4: Text Generation with Time Tool');

    const response = await client.post('/inference', {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        provider: config.languageModelProvider,
        model: config.languageModelModelName,
        mode: 'generateText',
        messages: [
            {
                role: 'user',
                content: 'What is the current time? Use the available tool.'
            }
        ],
        tools: ['get_current_time'],
        maxTokens: 100
    });

    if (response.status === 200) {
        printSuccess('Inference with time tool completed');
        console.log(`Response: "${response.data.content}"`);
        console.log(`Tool Calls: ${response.data.toolCalls?.length || 0}`);
        console.log(`Tokens: ${response.data.usage.totalTokens}`);
        console.log(`Cost: $${response.data.cost.toFixed(6)}`);
        console.log(`Remaining Budget: $${response.data.remainingBudget.toFixed(6)}`);
    } else {
        printError(`Inference failed: ${response.status}`);
        console.log(response.data);
    }
}

async function testGenerateObject(): Promise<void> {
    printSection('Test 5: Generate Structured Object');

    const schema = z.object({
        name: z.string().describe("The person's full name"),
        age: z.number().int().positive().describe('Age in years'),
        occupation: z.string().min(1),
        bio: z.string().max(500).describe('A brief biography')
    });

    const response = await client.post('/inference', {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        provider: config.languageModelProvider,
        model: config.languageModelModelName,
        mode: 'generateObject',
        messages: [
            {
                role: 'user',
                content: 'Generate a fictional person with name, age, occupation, and a short bio.'
            }
        ],
        schema: zodToJsonSchema(schema),
        maxTokens: 2000
    });

    if (response.status === 200) {
        printSuccess('Object generation completed');

        console.log('Generated Object:');
        console.log(JSON.stringify(response.data.content, null, 2));

        console.log(`Tokens: ${response.data.usage.totalTokens}`);
        console.log(`Cost: ${response.data.cost.toFixed(6)}`);
        console.log(`Remaining Budget: ${response.data.remainingBudget.toFixed(6)}`);
    } else {
        printError(`Object generation failed: ${response.status}`);

        console.log(response.data);
    }
}

async function testBudgetExhaustion(): Promise<void> {
    printSection('Test 5: Budget Exhaustion Test');

    let callCount = 0;
    let budgetExhausted = false;

    while (!budgetExhausted && callCount < config.rateLimitPerSessionPerMin) {
        callCount++;
        printInfo(`Attempt ${callCount}...`);

        const response = await client.post('/inference', {
            userId: TEST_USER_ID,
            sessionId: TEST_SESSION_ID,
            provider: config.languageModelProvider,
            model: config.languageModelModelName,
            mode: 'generateText',
            messages: [
                {
                    role: 'user',
                    content: 'Reply with just "OK"'
                }
            ],
            maxTokens: 50
        });

        if (response.status === 402) {
            budgetExhausted = true;

            printSuccess('Budget limit reached (as expected)');

            console.log(`Error: ${response.data.error}`);
            console.log(`Code: ${response.data.code}`);
        } else if (response.status === 200) {
            console.log(`  Cost: $${response.data.cost.toFixed(6)}, Remaining: $${response.data.remainingBudget.toFixed(6)}`);
        } else {
            printError(`Unexpected status: ${response.status}`);
            break;
        }

        // Small delay to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!budgetExhausted) {
        printError(`Budget was not exhausted after ${config.rateLimitPerSessionPerMin} attempts`);
    }
}

async function testSessionUsageReport(): Promise<void> {
    printSection('Test 6: Session Usage Report');

    const response = await client.get(`/usage/session/${TEST_SESSION_ID}`, {
        params: { userId: TEST_USER_ID }
    });

    if (response.status === 200) {
        printSuccess('Usage report retrieved');
        const report = response.data.report;

        console.log(`\nSession Summary:`);
        console.log(`  Total Cost: $${report.totalCost.toFixed(6)}`);
        console.log(`  Remaining Budget: $${report.remainingBudget.toFixed(6)}`);
        console.log(`  Total Requests: ${report.requestCount}`);

        console.log(`\nPer-Model Breakdown:`);
        Object.entries(report.aggregatesByModel).forEach(([model, stats]: [string, any]) => {
            console.log(`  ${model}:`);
            console.log(`    Requests: ${stats.requests}`);
            console.log(`    Tokens: ${stats.tokens}`);
            console.log(`    Cost: $${stats.cost.toFixed(6)}`);
        });

        console.log(`\nRecent Requests (last 3):`);
        const recentRequests = report.requests.slice(-3);
        recentRequests.forEach((req: any, idx: number) => {
            console.log(`  ${idx + 1}. ${req.provider}:${req.model}`);
            console.log(`     Tokens: ${req.tokens.total}, Cost: $${req.cost.toFixed(6)}, Duration: ${req.durationMs}ms`);
        });
    } else {
        printError(`Failed to get usage report: ${response.status}`);

        console.log(response.data);
    }
}

async function testUserUsageReport(): Promise<void> {
    printSection('Test 7: User Usage Report');

    const response = await client.get(`/usage/user/${TEST_USER_ID}`);

    if (response.status === 200) {
        printSuccess('User usage report retrieved');

        const report = response.data.report;

        console.log(`User ID: ${report.userId}`);
        console.log(`Total Cost: $${report.totalCost.toFixed(6)}`);
        console.log(`Total Requests: ${report.totalRequests}`);
        console.log(`Number of Sessions: ${report.sessions.length}`);

        console.log(`\nSessions:`);
        report.sessions.forEach((session: any, idx: number) => {
            console.log(`  ${idx + 1}. ${session.sessionId}`);
            console.log(`     Requests: ${session.requestCount}, Cost: $${session.totalCost.toFixed(6)}`);
        });
    } else {
        printError(`Failed to get user report: ${response.status}`);

        console.log(response.data);
    }
}

async function runTests() {
    try {
        printSection('Starting LLM Proxy Test Suite');

        printInfo('Starting server...');
        startServer();

        await waitForServer();

        await testCreateSession();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testGenerateObject();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testSimpleInference();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testInferenceWithThinkTool();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testInferenceWithTimeTool();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testBudgetExhaustion();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testSessionUsageReport();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await testUserUsageReport();

        printSection('Test Suite Completed Successfully! 🎉');
    } catch (error) {
        printError('Test suite failed with error:');
        console.error(error);
    } finally {
        printInfo('Stopping server ...');
        process.exit(0);
    }
}

if (require.main === module) {
    runTests();
}
