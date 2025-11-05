import { Indicator, IndicatorInput } from '../indicator';
import FixedSizedLinkedList from './fixed_size_linked_list';

export class SumInput extends IndicatorInput {
    values!: number[];
    period!: number;
}

export class Sum extends Indicator {
    generator: IterableIterator<number | undefined>;

    constructor(input: SumInput) {
        super(input);
        var values = input.values;
        var period = input.period;

        this.result = [];

        var periodList = new FixedSizedLinkedList(period, false, false, true);

        this.generator = (function* () {
            var tick;
            var high;

            tick = yield;

            while (true) {
                periodList.push(tick);
                if (periodList.totalPushed >= period) {
                    high = periodList.periodSum;
                }
                tick = yield high;
            }
        })();

        this.generator.next();

        values.forEach((value, _index) => {
            var result = this.generator.next(value);
            if (result.value != undefined) {
                this.result.push(result.value);
            }
        });
    }

    static calculate = sum;

    nextValue(price: number): number | undefined {
        var result = this.generator.next(price);
        if (result.value != undefined) {
            return result.value;
        }
    }
}

export function sum(input: SumInput): number[] {
    Indicator.reverseInputs(input);

    var result = new Sum(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
