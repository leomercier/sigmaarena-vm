// Performance test for streaming/real-time Bollinger Bands calculation

import { BollingerBands } from '../technical-indicators';

class BollingerBandsStreamingTest {
    private BB_PERIOD = 20;
    private BB_STD_DEV = 2;

    // Generate sample price data stream
    generatePriceStream(length: number): number[] {
        const prices: number[] = [];
        let basePrice = 100;

        for (let i = 0; i < length; i++) {
            basePrice += (Math.random() - 0.5) * 2;
            prices.push(Math.max(basePrice, 1));
        }

        return prices;
    }

    // Test Implementation 1: Recalculate from scratch each time
    testImplementation1(priceStream: number[]): { totalTime: number; results: any[] } {
        const results: any[] = [];
        const priceHistory: number[] = [];

        const startTime = performance.now();

        for (const newPrice of priceStream) {
            priceHistory.push(newPrice);

            // Calculate BB from entire history each time
            const bb = BollingerBands.lastValue(priceHistory, this.BB_PERIOD, this.BB_STD_DEV);

            if (bb) {
                results.push(bb);
            }
        }

        const endTime = performance.now();

        return {
            totalTime: endTime - startTime,
            results
        };
    }

    // Test Implementation 2: Use stateful nextValue() method
    testImplementation2(priceStream: number[]): { totalTime: number; results: any[] } {
        const results: any[] = [];

        // Initialize the indicator once
        const bb = new BollingerBands({
            period: this.BB_PERIOD,
            stdDev: this.BB_STD_DEV,
            values: [] // Start with empty, will use nextValue()
        });

        const startTime = performance.now();

        for (const newPrice of priceStream) {
            // Process one price at a time using nextValue()
            const result = bb.nextValue(newPrice);

            if (result) {
                results.push(result);
            }
        }

        const endTime = performance.now();

        return {
            totalTime: endTime - startTime,
            results
        };
    }

    // Verify that both implementations produce the same final result
    verifyResults(results1: any[], results2: any[]): boolean {
        if (results1.length !== results2.length) {
            console.log(`❌ Result count mismatch: ${results1.length} vs ${results2.length}`);
            return false;
        }

        if (results1.length === 0) {
            return false;
        }

        const tolerance = 0.0001;
        const last1 = results1[results1.length - 1];
        const last2 = results2[results2.length - 1];

        const middleMatch = Math.abs(last1.middle - last2.middle) < tolerance;
        const upperMatch = Math.abs(last1.upper - last2.upper) < tolerance;
        const lowerMatch = Math.abs(last1.lower - last2.lower) < tolerance;

        return middleMatch && upperMatch && lowerMatch;
    }

    // Main streaming test function
    runStreamingComparison(streamLength: number = 1000): void {
        console.log('='.repeat(70));
        console.log('Bollinger Bands STREAMING Performance Test');
        console.log('Simulating Real-Time Trading with Sequential Price Updates');
        console.log('='.repeat(70));
        console.log(`Stream length: ${streamLength} price ticks`);
        console.log(`Period: ${this.BB_PERIOD}, Std Dev: ${this.BB_STD_DEV}`);
        console.log('');

        // Generate price stream
        const priceStream = this.generatePriceStream(streamLength);

        console.log('Scenario: New price arrives → Calculate latest BB → Repeat');
        console.log('');

        // Test Implementation 1
        console.log('Testing Implementation 1 (recalculate from scratch each tick)...');
        const test1 = this.testImplementation1(priceStream);
        console.log(`  Completed ${test1.results.length} calculations`);

        // Test Implementation 2
        console.log('Testing Implementation 2 (stateful nextValue() method)...');
        const test2 = this.testImplementation2(priceStream);
        console.log(`  Completed ${test2.results.length} calculations`);

        // Verify results
        const resultsMatch = this.verifyResults(test1.results, test2.results);

        // Display results
        console.log('');
        console.log('Results:');
        console.log('-'.repeat(70));

        console.log(`Implementation 1 (calculateBollingerBands - recalculate):`);
        console.log(`  Strategy: Recalculate from entire history on each new price`);
        console.log(`  Complexity: O(period) per tick, O(n × period) total`);
        console.log(`  Total time: ${test1.totalTime.toFixed(2)}ms`);
        console.log(`  Average per tick: ${(test1.totalTime / streamLength).toFixed(4)}ms`);
        console.log(`  Memory: O(n) - stores growing price history`);
        console.log('');

        console.log(`Implementation 2 (BollingerBands.nextValue - stateful):`);
        console.log(`  Strategy: Maintain internal state, update incrementally`);
        console.log(`  Complexity: O(period) per tick, O(n × period) total`);
        console.log(`  Total time: ${test2.totalTime.toFixed(2)}ms`);
        console.log(`  Average per tick: ${(test2.totalTime / streamLength).toFixed(4)}ms`);
        console.log(`  Memory: O(period) - only stores rolling window`);
        console.log('');

        console.log(`Results match: ${resultsMatch ? '✓ YES' : '✗ NO'}`);
        console.log('');

        // Performance comparison
        const speedup = test1.totalTime / test2.totalTime;

        console.log('Performance Analysis:');
        console.log('-'.repeat(70));

        if (test2.totalTime < test1.totalTime) {
            console.log(`🏆 Winner: Implementation 2 (nextValue)`);
            console.log(`   ${speedup.toFixed(2)}x faster than Implementation 1`);
            console.log(`   Time saved: ${(test1.totalTime - test2.totalTime).toFixed(2)}ms total`);
            console.log(`   Efficiency gain: ${((1 - test2.totalTime / test1.totalTime) * 100).toFixed(1)}%`);
        } else {
            console.log(`🏆 Winner: Implementation 1 (recalculate)`);
            console.log(`   ${(1 / speedup).toFixed(2)}x faster than Implementation 2`);
            console.log(`   Time saved: ${(test2.totalTime - test1.totalTime).toFixed(2)}ms total`);
        }

        console.log('');
        console.log('Key Insights:');
        console.log(`  • For streaming data, Implementation 2 avoids redundant calculations`);
        console.log(`  • nextValue() maintains state between calls (more efficient)`);
        console.log(`  • Implementation 1 recalculates from scratch each time (wasteful)`);
        console.log(`  • For ${streamLength} ticks, that's ${streamLength} full recalculations!`);
        console.log('='.repeat(70));

        // Extended analysis
        console.log('');
        console.log('📊 Extended Analysis:');
        console.log('-'.repeat(70));

        const ticksPerSecond1 = (streamLength / test1.totalTime) * 1000;
        const ticksPerSecond2 = (streamLength / test2.totalTime) * 1000;

        console.log(`Processing capacity:`);
        console.log(`  Implementation 1: ${ticksPerSecond1.toFixed(0)} ticks/second`);
        console.log(`  Implementation 2: ${ticksPerSecond2.toFixed(0)} ticks/second`);
        console.log('');

        console.log(`For a trading bot processing market data:`);
        console.log(`  • At 1 tick/second:  Both perform well`);
        console.log(`  • At 10 ticks/second: Implementation 2 is ${speedup.toFixed(1)}x better`);
        console.log(`  • At 100 ticks/second: Implementation 2 becomes critical`);
        console.log('='.repeat(70));
    }

    // Run multiple iterations to get statistical confidence
    runMultipleTests(streamLength: number = 1000, iterations: number = 5): void {
        console.log('Running multiple iterations for statistical confidence...\n');

        const impl1Times: number[] = [];
        const impl2Times: number[] = [];

        for (let i = 0; i < iterations; i++) {
            const priceStream = this.generatePriceStream(streamLength);

            const test1 = this.testImplementation1(priceStream);
            const test2 = this.testImplementation2(priceStream);

            impl1Times.push(test1.totalTime);
            impl2Times.push(test2.totalTime);
        }

        const avg1 = impl1Times.reduce((a, b) => a + b) / iterations;
        const avg2 = impl2Times.reduce((a, b) => a + b) / iterations;
        const min1 = Math.min(...impl1Times);
        const max1 = Math.max(...impl1Times);
        const min2 = Math.min(...impl2Times);
        const max2 = Math.max(...impl2Times);

        console.log('Statistical Results:');
        console.log('-'.repeat(70));
        console.log(`Implementation 1: avg=${avg1.toFixed(2)}ms, min=${min1.toFixed(2)}ms, max=${max1.toFixed(2)}ms`);
        console.log(`Implementation 2: avg=${avg2.toFixed(2)}ms, min=${min2.toFixed(2)}ms, max=${max2.toFixed(2)}ms`);
        console.log(`Average speedup: ${(avg1 / avg2).toFixed(2)}x`);
        console.log('='.repeat(70));
    }
}

const tester = new BollingerBandsStreamingTest();

// Single comprehensive test
tester.runStreamingComparison(
    1000 // stream length
);

// Or run multiple iterations for statistical confidence
tester.runMultipleTests(
    1000, // stream length
    5 // iterations
);
