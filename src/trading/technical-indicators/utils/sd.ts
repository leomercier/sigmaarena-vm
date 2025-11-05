import { Indicator, IndicatorInput } from '../indicator';
import { SMA } from '../moving-averages/sma';
import LinkedList from '../utils/fixed_size_linked_list';

export class SDInput extends IndicatorInput {
    period!: number;
    values!: number[];
}

export class SD extends Indicator {
    generator: IterableIterator<number | undefined>;
    constructor(input: SDInput) {
        super(input);
        var period = input.period;
        var priceArray = input.values;

        var sma = new SMA({
            period: period,
            values: [],
            format: (v: number) => {
                return v;
            }
        });

        this.result = [];

        this.generator = (function* () {
            var tick;
            var mean;
            var currentSet = new LinkedList(period);
            tick = yield;
            var sd;
            while (true) {
                currentSet.push(tick);
                mean = sma.nextValue(tick);
                if (mean) {
                    let sum = 0;
                    for (let x of currentSet.iterator()) {
                        sum = sum + Math.pow(x - mean, 2);
                    }
                    sd = Math.sqrt(sum / period);
                }
                tick = yield sd;
            }
        })();

        this.generator.next();

        priceArray.forEach((tick) => {
            var result = this.generator.next(tick);
            if (result.value != undefined) {
                this.result.push(this.format(result.value));
            }
        });
    }

    static calculate = sd;

    nextValue(price: number): number | undefined {
        var nextResult = this.generator.next(price);
        if (nextResult.value != undefined) return this.format(nextResult.value);
    }
}

export function sd(input: SDInput): number[] {
    Indicator.reverseInputs(input);

    var result = new SD(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
