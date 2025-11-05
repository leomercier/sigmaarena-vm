import { Indicator, IndicatorInput } from '../indicator';
import { CandleData } from '../types';

export class TypicalPriceInput extends IndicatorInput {
    low?: number[];
    high?: number[];
    close?: number[];
}

export class TypicalPrice extends Indicator {
    result: number[] = [];
    generator: IterableIterator<number | undefined>;

    constructor(input: TypicalPriceInput) {
        super(input);

        this.generator = (function* () {
            let priceInput = yield;
            while (true) {
                priceInput = yield (priceInput.high + priceInput.low + priceInput.close) / 3;
            }
        })();

        this.generator.next();

        input.low!.forEach((tick, index) => {
            var result = this.generator.next({
                high: input.high![index],
                low: input.low![index],
                close: input.close![index]
            });
            this.result.push(result.value);
        });
    }

    static calculate = typicalPrice;

    nextValue(price: CandleData): number | undefined {
        var result = this.generator.next(price).value;
        return result;
    }
}

export function typicalPrice(input: TypicalPriceInput): number[] {
    Indicator.reverseInputs(input);

    var result = new TypicalPrice(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
