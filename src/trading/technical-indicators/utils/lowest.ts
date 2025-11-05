import { Indicator, IndicatorInput } from '../indicator';
import FixedSizedLinkedList from './fixed_size_linked_list';

export class LowestInput extends IndicatorInput {
    values!: number[];
    period!: number;
}

export class Lowest extends Indicator {
    generator: IterableIterator<number | undefined>;

    constructor(input: LowestInput) {
        super(input);
        var values = input.values;
        var period = input.period;

        this.result = [];

        var periodList = new FixedSizedLinkedList(period, false, true, false);

        this.generator = (function* () {
            var tick;
            var high;

            tick = yield;

            while (true) {
                periodList.push(tick);
                if (periodList.totalPushed >= period) {
                    high = periodList.periodLow;
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

    static calculate = lowest;

    nextValue(price: number): number | undefined {
        var result = this.generator.next(price);
        if (result.value != undefined) {
            return result.value;
        }
    }
}

export function lowest(input: LowestInput): number[] {
    Indicator.reverseInputs(input);

    var result = new Lowest(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
