// Performance test for Bollinger Bands implementations

import { BollingerBands } from '../technical-indicators';

class BollingerBandsPerformanceTest {
    private BB_PERIOD = 20;
    private BB_STD_DEV = 2;

    // Generate sample price data
    generatePriceData(length: number): number[] {
        const prices: number[] = [];
        let basePrice = 100;

        for (let i = 0; i < length; i++) {
            // Simulate price movement with some randomness
            basePrice += (Math.random() - 0.5) * 2;
            prices.push(Math.max(basePrice, 1)); // Ensure positive prices
        }

        return prices;
    }

    // Test runner for a single implementation
    runTest(testName: string, calculateFn: () => any, iterations: number): { totalTime: number; averageTime: number } {
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            calculateFn();
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const averageTime = totalTime / iterations;

        return { totalTime, averageTime };
    }

    // Verify that both implementations produce similar results
    verifyResults(bb1: any, bb2: any[]): boolean {
        if (!bb1 || bb2.length === 0) {
            return false;
        }

        const latestBB2 = bb2.slice(-1)[0];
        const tolerance = 0.0001; // Small tolerance for floating point comparison

        const middleMatch = Math.abs(bb1.middle - latestBB2.middle) < tolerance;
        const upperMatch = Math.abs(bb1.upper - latestBB2.upper) < tolerance;
        const lowerMatch = Math.abs(bb1.lower - latestBB2.lower) < tolerance;

        return middleMatch && upperMatch && lowerMatch;
    }

    // Main test function
    runPerformanceComparison(dataLength: number = 1000, iterations: number = 1000): void {
        console.log('='.repeat(60));
        console.log('Bollinger Bands Performance Comparison');
        console.log('='.repeat(60));
        console.log(`Data length: ${dataLength} prices`);
        console.log(`Iterations: ${iterations}`);
        console.log(`Period: ${this.BB_PERIOD}, Std Dev: ${this.BB_STD_DEV}`);
        console.log('');

        // Generate test data once
        const prices = this.generatePriceData(dataLength);

        // Test Implementation 1 (calculateBollingerBands)
        console.log('Testing Implementation 1 (calculateBollingerBands - last value only)...');
        const result1 = this.runTest('Implementation 1', () => BollingerBands.lastValue(prices, this.BB_PERIOD, this.BB_STD_DEV), iterations);

        // Test Implementation 2 (BollingerBands.calculate)
        console.log('Testing Implementation 2 (BollingerBands.calculate - full array)...');
        const result2 = this.runTest(
            'Implementation 2',
            () =>
                BollingerBands.calculate({
                    values: prices,
                    period: this.BB_PERIOD,
                    stdDev: this.BB_STD_DEV
                }),
            iterations
        );

        // Verify results match
        const bb1 = BollingerBands.lastValue(prices, this.BB_PERIOD, this.BB_STD_DEV);
        const bb2 = BollingerBands.calculate({
            values: prices,
            period: this.BB_PERIOD,
            stdDev: this.BB_STD_DEV
        });
        const resultsMatch = this.verifyResults(bb1, bb2);

        // Display results
        console.log('');
        console.log('Results:');
        console.log('-'.repeat(60));
        console.log(`Implementation 1 (calculateBollingerBands):`);
        console.log(`  Scope: Calculates ONLY the latest BB value`);
        console.log(`  Total time: ${result1.totalTime.toFixed(2)}ms`);
        console.log(`  Average time: ${result1.averageTime.toFixed(4)}ms`);
        console.log('');
        console.log(`Implementation 2 (BollingerBands.calculate):`);
        console.log(`  Scope: Calculates BB for ALL ${dataLength - this.BB_PERIOD + 1} data points`);
        console.log(`  Total time: ${result2.totalTime.toFixed(2)}ms`);
        console.log(`  Average time: ${result2.averageTime.toFixed(4)}ms`);
        console.log('');
        console.log(`Results match: ${resultsMatch ? '✓ YES' : '✗ NO'}`);
        console.log('');

        // Determine winner
        const speedup = result2.averageTime / result1.averageTime;
        console.log(`Performance Comparison:`);
        console.log(`  Implementation 1 is ${speedup.toFixed(2)}x faster`);
        console.log(`  Time difference: ${(result2.averageTime - result1.averageTime).toFixed(4)}ms per call`);
        console.log('');
        console.log(`⚠️  Important Note:`);
        console.log(`  - Implementation 1: Returns single value (latest only)`);
        console.log(`  - Implementation 2: Returns ${dataLength - this.BB_PERIOD + 1} values (full history)`);
        console.log(`  - They serve different purposes!`);
        console.log('='.repeat(60));
    }
}

const tester = new BollingerBandsPerformanceTest();
tester.runPerformanceComparison(
    1000, // data length
    1000 // iterations
);
