import { SandboxManager } from './manager';

async function runExamples() {
    const manager = new SandboxManager();

    // Example 1: Simple calculation
    console.log('\n=== Example 1: Simple Calculation ===');
    const simpleScript = `
    export async function runScript() {
      const numbers = [1, 2, 3, 4, 5];
      const sum = numbers.reduce((a, b) => a + b, 0);
      return { sum, average: sum / numbers.length };
    }
  `;

    const result1 = await manager.executeScript({
        script: simpleScript,
        timeoutMs: 25000,
        maxCpus: 0.25,
        maxMemoryMb: 128
    });
    console.log('Result:', result1);

    // Example 2: Using allowed libraries
    console.log('\n=== Example 2: Using Lodash ===');
    const lodashScript = `
    import _ from 'lodash';
    
    export async function runScript() {
      const data = [
        { category: 'A', value: 10 },
        { category: 'B', value: 20 },
        { category: 'A', value: 15 }
      ];
      
      const grouped = _.groupBy(data, 'category');
      const summed = _.mapValues(grouped, items => 
        _.sumBy(items, 'value')
      );
      
      return summed;
    }
  `;

    const result2 = await manager.executeScript({
        script: lodashScript,
        timeoutMs: 25000
    });
    console.log('Result:', result2);

    // Example 3: API call (requires network access)
    console.log('\n=== Example 3: API Call ===');
    const apiScript = `
    import axios from 'axios';
    
    export async function runScript() {
      try {
        const response = await axios.get('https://api.github.com/repos/microsoft/typescript', {
          timeout: 5000
        });
        
        return {
          repository: response.data.name,
          stars: response.data.stargazers_count,
          language: response.data.language
        };
      } catch (error) {
        throw new Error('Failed to fetch data: ' + error.message);
      }
    }
  `;

    const result3 = await manager.executeScript({
        script: apiScript,
        timeoutMs: 10000,
        allowedEndpoints: ['api.github.com']
    });
    console.log('Result:', result3);

    // Example 4: Timeout handling
    console.log('\n=== Example 4: Timeout Test ===');
    const timeoutScript = `
    export async function runScript() {
      // This will timeout
      await new Promise(resolve => setTimeout(resolve, 60000));
      return { message: 'This will never be reached' };
    }
  `;

    const result4 = await manager.executeScript({
        script: timeoutScript,
        timeoutMs: 2000
    });
    console.log('Result:', result4);

    // Example 5: Error handling
    console.log('\n=== Example 5: Error Handling ===');
    const errorScript = `
    export async function runScript() {
      throw new Error('Intentional error for testing');
    }
  `;

    const result5 = await manager.executeScript({
        script: errorScript,
        timeoutMs: 5000
    });
    console.log('Result:', result5);

    // Example 6: Multiple concurrent executions
    console.log('\n=== Example 6: Concurrent Execution ===');
    const concurrentScripts = Array(3)
        .fill(null)
        .map(
            (_, i) => `
    export async function runScript() {
      await new Promise(resolve => setTimeout(resolve, ${1000 + i * 500}));
      return { taskId: ${i}, completed: true };
    }
  `
        );

    const results = await Promise.all(
        concurrentScripts.map((script, i) =>
            manager.executeScript({
                script,
                timeoutMs: 25000
            })
        )
    );
    console.log('Concurrent results:', results);

    // Cleanup
    await manager.cleanup();
}

// Run examples
runExamples().catch(console.error);
