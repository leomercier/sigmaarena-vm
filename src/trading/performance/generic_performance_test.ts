import * as technicalIndicators from '../technical-indicators';

interface IndicatorImplementation {
    name: string;
    type: 'generator' | 'direct';

    // For generator-based (stateful)
    generatorClass?: any;
    useNextValue?: boolean;

    // For direct calculation (stateless)
    directFunction?: (...args: any[]) => any;
}

interface TestConfiguration {
    indicatorName: string;
    implementations: IndicatorImplementation[];
    params: any; // Indicator-specific parameters
    dataLength: number;
    streamLength?: number; // For streaming tests
    iterations?: number; // For batch tests
    tolerance?: number; // For result comparison
}

interface TestResult {
    implementation: string;
    type: string;
    totalTime: number;
    averageTime: number;
    operationsCount: number;
    passed: boolean;
    error?: string;
}

class GenericIndicatorPerformanceTest {
    private tolerance: number = 0.0001;

    generatePriceData(length: number, startPrice: number = 100): number[] {
        const prices: number[] = [];
        let price = startPrice;

        for (let i = 0; i < length; i++) {
            price += (Math.random() - 0.5) * 2;
            prices.push(Math.max(price, 1));
        }

        return prices;
    }

    // Compare two results with tolerance
    private compareResults(result1: any, result2: any, tolerance: number): { match: boolean; mismatchPercentage: number; details: string[] } {
        if (result1 === null || result2 === null) {
            return {
                match: result1 === result2,
                mismatchPercentage: result1 === result2 ? 0 : 100,
                details: result1 !== result2 ? ['One result is null'] : []
            };
        }

        if (Array.isArray(result1) !== Array.isArray(result2)) {
            const r1 = Array.isArray(result1) ? result1[result1.length - 1] : result1;
            const r2 = Array.isArray(result2) ? result2[result2.length - 1] : result2;
            return this.compareResults(r1, r2, tolerance);
        }

        // Handle single object results
        if (typeof result1 === 'object' && !Array.isArray(result1)) {
            const objComparison = this.compareObjects(result1, result2, tolerance);
            return {
                match: objComparison.match,
                mismatchPercentage: objComparison.match ? 0 : 100,
                details: objComparison.details
            };
        }

        // Handle array results
        if (Array.isArray(result1) && Array.isArray(result2)) {
            if (result1.length === 0 || result2.length === 0) {
                const match = result1.length === result2.length;
                return {
                    match,
                    mismatchPercentage: match ? 0 : 100,
                    details: match ? [] : ['Empty array length mismatch']
                };
            }

            // Compare all elements in the arrays
            const minLength = Math.min(result1.length, result2.length);
            let mismatches = 0;
            const mismatchDetails: string[] = [];

            for (let i = 0; i < minLength; i++) {
                const comparison = this.compareObjects(result1[i], result2[i], tolerance);
                if (!comparison.match) {
                    mismatches++;
                    if (mismatchDetails.length < 5) {
                        // Only keep first 5 examples
                        mismatchDetails.push(`Index ${i}: ${comparison.details.join(', ')}`);
                    }
                }
            }

            if (result1.length !== result2.length) {
                mismatchDetails.push(`Array length mismatch: ${result1.length} vs ${result2.length}`);
            }

            const mismatchPercentage = (mismatches / minLength) * 100;
            return {
                match: mismatches === 0 && result1.length === result2.length,
                mismatchPercentage,
                details: mismatchDetails
            };
        }

        // Handle numeric results
        if (typeof result1 === 'number' && typeof result2 === 'number') {
            const roundedDiff = Math.abs(this.roundToThreeDecimals(result1) - this.roundToThreeDecimals(result2));
            const match = roundedDiff < tolerance;
            return {
                match,
                mismatchPercentage: match ? 0 : 100,
                details: match ? [] : [`Numeric difference: ${result1} vs ${result2}`]
            };
        }

        return {
            match: false,
            mismatchPercentage: 100,
            details: [`Incompatible result types for comparison: ${typeof result1} vs ${typeof result2}`]
        };
    }

    private roundToThreeDecimals(value: number): number {
        return Math.round(value * 1000) / 1000;
    }

    private compareObjects(obj1: any, obj2: any, tolerance: number): { match: boolean; details: string[] } {
        const details: string[] = [];
        const keys1 = Object.keys(obj1).filter((k) => typeof obj1[k] === 'number');
        const keys2 = Object.keys(obj2).filter((k) => typeof obj2[k] === 'number');

        if (keys1.length !== keys2.length) {
            details.push(`Different number of numeric keys: ${keys1.length} vs ${keys2.length}`);
            return { match: false, details };
        }

        for (const key of keys1) {
            if (!keys2.includes(key)) {
                details.push(`Key '${key}' missing in second result`);
                continue;
            }

            const val1 = this.roundToThreeDecimals(obj1[key]);
            const val2 = this.roundToThreeDecimals(obj2[key]);

            if (Math.abs(val1 - val2) >= tolerance) {
                details.push(`${key}: ${val1} vs ${val2}`);
            }
        }

        return { match: details.length === 0, details };
    }

    private executeBatchTest(
        impl: IndicatorImplementation,
        prices: number[],
        params: any,
        iterations: number
    ): { time: number; result: any; error?: string } {
        try {
            let result: any;
            const startTime = performance.now();

            for (let i = 0; i < iterations; i++) {
                if (impl.type === 'generator') {
                    // Generator-based: calculate full array
                    result = impl.generatorClass.calculate({
                        values: prices,
                        ...params
                    });
                } else {
                    // Direct function
                    result = impl.directFunction!(prices, ...Object.values(params));
                }
            }

            const endTime = performance.now();
            return { time: endTime - startTime, result };
        } catch (error) {
            return { time: 0, result: null, error: String(error) };
        }
    }

    private executeStreamingTest(impl: IndicatorImplementation, priceStream: number[], params: any): { time: number; result: any; error?: string } {
        try {
            const results: any[] = [];

            if (impl.type === 'generator' && impl.useNextValue) {
                // Generator with nextValue (stateful)
                const indicator = new impl.generatorClass({
                    values: [],
                    ...params
                });

                const startTime = performance.now();

                for (const price of priceStream) {
                    const result = indicator.nextValue(price);
                    if (result) {
                        results.push(result);
                    }
                }

                const endTime = performance.now();
                return { time: endTime - startTime, result: results };
            } else if (impl.type === 'generator' && !impl.useNextValue) {
                // Generator without nextValue - use calculate method with growing array
                const priceHistory: number[] = [];

                const startTime = performance.now();

                for (const price of priceStream) {
                    priceHistory.push(price);
                    const result = impl.generatorClass.calculate({
                        values: priceHistory,
                        ...params
                    });
                    if (result && result.length > 0) {
                        results.push(result[result.length - 1]);
                    }
                }

                const endTime = performance.now();
                return { time: endTime - startTime, result: results };
            } else if (impl.type === 'direct') {
                // Direct function (recalculate each time)
                const priceHistory: number[] = [];

                const startTime = performance.now();

                for (const price of priceStream) {
                    priceHistory.push(price);
                    const result = impl.directFunction!(priceHistory, ...Object.values(params));
                    if (result) {
                        results.push(result);
                    }
                }

                const endTime = performance.now();
                return { time: endTime - startTime, result: results };
            } else {
                return { time: 0, result: null, error: 'Invalid streaming configuration' };
            }
        } catch (error) {
            return { time: 0, result: null, error: String(error) };
        }
    }

    runBatchTest(config: TestConfiguration): void {
        const iterations = config.iterations || 1000;
        const tolerance = config.tolerance || this.tolerance;

        console.log('═'.repeat(80));
        console.log(`${config.indicatorName} - BATCH CALCULATION TEST`);
        console.log('═'.repeat(80));
        console.log(`Data length: ${config.dataLength} prices`);
        console.log(`Iterations: ${iterations}`);
        console.log(`Parameters:`, JSON.stringify(config.params, null, 2));
        console.log('');

        const prices = this.generatePriceData(config.dataLength);
        const results: TestResult[] = [];
        const outputs: any[] = [];

        // Test each implementation
        for (const impl of config.implementations) {
            console.log(`Testing ${impl.name} (${impl.type})...`);

            const testResult = this.executeBatchTest(impl, prices, config.params, iterations);

            outputs.push(testResult.result);

            results.push({
                implementation: impl.name,
                type: impl.type,
                totalTime: testResult.time,
                averageTime: testResult.time / iterations,
                operationsCount: iterations,
                passed: !testResult.error,
                error: testResult.error
            });
        }

        console.log('');
        console.log('Result Validation:');
        console.log('─'.repeat(80));

        for (let i = 1; i < outputs.length; i++) {
            const comparison = this.compareResults(outputs[0], outputs[i], tolerance);
            const status = comparison.match ? '✓ MATCH' : `✗ MISMATCH (${comparison.mismatchPercentage.toFixed(1)}% different)`;

            console.log(`  ${config.implementations[0].name} vs ${config.implementations[i].name}: ${status}`);

            if (!comparison.match && comparison.details.length > 0) {
                console.log(`    Details: ${comparison.details.slice(0, 3).join('; ')}`);

                if (comparison.details.length > 3) {
                    console.log(`    ... and ${comparison.details.length - 3} more differences`);
                }
            }
        }

        console.log('');
        console.log('Performance Results:');
        console.log('─'.repeat(80));

        for (const result of results) {
            if (result.error) {
                console.log(`${result.implementation}:`);
                console.log(`  ❌ ERROR: ${result.error}`);
            } else {
                console.log(`${result.implementation} (${result.type}):`);
                console.log(`  Total time: ${result.totalTime.toFixed(2)}ms`);
                console.log(`  Average time: ${result.averageTime.toFixed(4)}ms`);
            }
            console.log('');
        }

        // Performance comparison
        if (results.every((r) => !r.error)) {
            const sortedResults = [...results].sort((a, b) => a.averageTime - b.averageTime);
            const fastest = sortedResults[0];
            const slowest = sortedResults[sortedResults.length - 1];
            const speedup = slowest.averageTime / fastest.averageTime;

            console.log('Performance Summary:');
            console.log('─'.repeat(80));
            console.log(`🏆 Fastest: ${fastest.implementation}`);
            console.log(`   ${speedup.toFixed(2)}x faster than slowest`);
            console.log(`   ${fastest.averageTime.toFixed(4)}ms per calculation`);
        }

        console.log('═'.repeat(80));
        console.log('');
    }

    runStreamingTest(config: TestConfiguration): void {
        const streamLength = config.streamLength || 1000;
        const tolerance = config.tolerance || this.tolerance;

        console.log('═'.repeat(80));
        console.log(`${config.indicatorName} - STREAMING/REAL-TIME TEST`);
        console.log('═'.repeat(80));
        console.log(`Stream length: ${streamLength} price ticks`);
        console.log(`Parameters:`, JSON.stringify(config.params, null, 2));
        console.log('Scenario: Process prices one at a time (simulates live trading)');
        console.log('');

        const priceStream = this.generatePriceData(streamLength);
        const results: TestResult[] = [];
        const outputs: any[] = [];

        for (const impl of config.implementations) {
            console.log(`Testing ${impl.name} (${impl.type})...`);

            const testResult = this.executeStreamingTest(impl, priceStream, config.params);

            outputs.push(testResult.result);

            results.push({
                implementation: impl.name,
                type: impl.type,
                totalTime: testResult.time,
                averageTime: testResult.time / streamLength,
                operationsCount: streamLength,
                passed: !testResult.error,
                error: testResult.error
            });
        }

        console.log('');
        console.log('Result Validation:');
        console.log('─'.repeat(80));

        for (let i = 1; i < outputs.length; i++) {
            const comparison = this.compareResults(outputs[0], outputs[i], tolerance);
            const status = comparison.match ? '✓ MATCH' : `✗ MISMATCH (${comparison.mismatchPercentage.toFixed(1)}% different)`;

            console.log(`  ${config.implementations[0].name} vs ${config.implementations[i].name}: ${status}`);

            if (!comparison.match && comparison.details.length > 0) {
                console.log(`    Details: ${comparison.details.slice(0, 3).join('; ')}`);

                if (comparison.details.length > 3) {
                    console.log(`    ... and ${comparison.details.length - 3} more differences`);
                }
            }
        }

        console.log('');
        console.log('Performance Results:');
        console.log('─'.repeat(80));

        for (const result of results) {
            if (result.error) {
                console.log(`${result.implementation}:`);
                console.log(`  ❌ ERROR: ${result.error}`);
            } else {
                console.log(`${result.implementation} (${result.type}):`);
                console.log(`  Total time: ${result.totalTime.toFixed(2)}ms`);
                console.log(`  Average per tick: ${result.averageTime.toFixed(4)}ms`);
                console.log(`  Ticks per second: ${(1000 / result.averageTime).toFixed(0)}`);
            }
            console.log('');
        }

        if (results.every((r) => !r.error)) {
            const sortedResults = [...results].sort((a, b) => a.averageTime - b.averageTime);
            const fastest = sortedResults[0];
            const slowest = sortedResults[sortedResults.length - 1];
            const speedup = slowest.averageTime / fastest.averageTime;

            console.log('Performance Summary:');
            console.log('─'.repeat(80));
            console.log(`🏆 Fastest: ${fastest.implementation}`);
            console.log(`   ${speedup.toFixed(2)}x faster than slowest`);
            console.log(`   ${((1 - fastest.averageTime / slowest.averageTime) * 100).toFixed(1)}% efficiency gain`);
            console.log('');
            console.log(`For live trading at 100 ticks/second:`);
            console.log(`  ${fastest.implementation}: ${(fastest.averageTime * 100).toFixed(2)}ms per 100 ticks`);
            console.log(`  ${slowest.implementation}: ${(slowest.averageTime * 100).toFixed(2)}ms per 100 ticks`);
        }

        console.log('═'.repeat(80));
        console.log('');
    }

    runFullTest(config: TestConfiguration): void {
        this.runBatchTest(config);

        if (config.streamLength) {
            this.runStreamingTest(config);
        }
    }
}

const tester = new GenericIndicatorPerformanceTest();

tester.runFullTest({
    indicatorName: 'Bollinger Bands',
    implementations: [
        {
            name: 'Generator-based (calculate)',
            type: 'generator',
            generatorClass: technicalIndicators.BollingerBands
        },
        {
            name: 'Generator-based (nextValue)',
            type: 'generator',
            generatorClass: technicalIndicators.BollingerBands,
            useNextValue: true
        },
        {
            name: 'Direct calculation',
            type: 'direct',
            directFunction: technicalIndicators.BollingerBands.lastValue
        }
    ],
    params: {
        period: 20,
        stdDev: 2
    },
    dataLength: 1000,
    streamLength: 1000,
    iterations: 1000
});

// tester.runFullTest({
//     indicatorName: 'RSI',
//     implementations: [
//         {
//             name: 'Generator-based (calculate)',
//             type: 'generator',
//             generatorClass: technicalIndicators.RSI
//         },
//         {
//             name: 'Generator-based (nextValue)',
//             type: 'generator',
//             generatorClass: technicalIndicators.RSI,
//             useNextValue: true
//         },
//         {
//             name: 'Direct calculation',
//             type: 'direct',
//             directFunction: technicalIndicators.RSI.lastValue
//         }
//     ],
//     params: {
//         period: 14
//     },
//     dataLength: 1000,
//     streamLength: 1000,
//     iterations: 1000
// });

export default GenericIndicatorPerformanceTest;
