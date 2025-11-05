import { Indicator, IndicatorInput } from '../indicator';
import { CrossDown } from './cross_down';
import { CrossUp } from './cross_up';

export class CrossInput extends IndicatorInput {
    constructor(
        public lineA: number[],
        public lineB: number[]
    ) {
        super();
    }
}

export class CrossOver extends Indicator {
    generator: IterableIterator<true | false>;
    result: boolean[];

    constructor(input: CrossInput) {
        super(input);

        var crossUp = new CrossUp({ lineA: input.lineA, lineB: input.lineB });
        var crossDown = new CrossDown({ lineA: input.lineA, lineB: input.lineB });

        const genFn = function* (): IterableIterator<true | false> {
            var current = yield false;
            var result = false;
            var first = true;

            while (true) {
                var nextUp = crossUp.nextValue(current.valueA, current.valueB);
                var nextDown = crossDown.nextValue(current.valueA, current.valueB);

                result = nextUp || nextDown;

                if (first) result = false;
                first = false;
                current = yield result;
            }
        };

        this.generator = genFn();
        this.generator.next();

        var resultA = crossUp.getResult();
        var resultB = crossDown.getResult();

        this.result = resultA.map((a: any, index: number) => {
            if (index === 0) return false;
            return !!(a || resultB[index]);
        });
    }

    static calculate = crossOver;

    static reverseInputs(input: CrossInput): void {
        if (input.reversedInput) {
            input.lineA ? input.lineA.reverse() : undefined;
            input.lineB ? input.lineB.reverse() : undefined;
        }
    }

    nextValue(valueA: number, valueB: number): true | false {
        return this.generator.next({
            valueA: valueA,
            valueB: valueB
        }).value;
    }
}

export function crossOver(input: CrossInput): boolean[] {
    Indicator.reverseInputs(input);

    var result = new CrossOver(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
