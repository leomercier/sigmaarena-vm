import { Indicator, IndicatorInput } from '../indicator';
import { LinkedList } from '../utils/linked_list';

export class MAInput extends IndicatorInput {
    constructor(
        public period: number,
        public values: number[]
    ) {
        super();
    }
}

export class SMA extends Indicator {
    period: number;
    price: number[];
    result: number[];

    generator: IterableIterator<number | undefined>;

    constructor(input: MAInput) {
        super(input);
        this.period = input.period;
        this.price = input.values;

        var genFn = function* (period: number): IterableIterator<number | undefined> {
            var list = new LinkedList();
            var sum = 0;
            var counter = 1;
            var current = yield;
            var result;

            list.push(0);

            while (true) {
                if (counter < period) {
                    counter++;
                    list.push(current);
                    sum = sum + current;
                } else {
                    sum = sum - list.shift() + current;
                    result = sum / period;
                    list.push(current);
                }
                current = yield result;
            }
        };

        this.generator = genFn(this.period);
        this.generator.next();

        this.result = [];

        this.price.forEach((tick) => {
            var result = this.generator.next(tick);
            if (result.value !== undefined) {
                this.result.push(this.format(result.value));
            }
        });
    }

    static calculate = sma;

    nextValue(price: number): number | undefined {
        var result = this.generator.next(price).value;
        if (result != undefined) return this.format(result);
    }
}

export function sma(input: MAInput): number[] {
    Indicator.reverseInputs(input);

    var result = new SMA(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
