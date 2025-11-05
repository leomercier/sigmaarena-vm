import { Indicator, IndicatorInput } from '../indicator';
import { AverageGain } from '../utils/average_gain';
import { AverageLoss } from '../utils/average_loss';

export class RSIInput extends IndicatorInput {
    period!: number;
    values!: number[];
}

export class RSI extends Indicator {
    generator: IterableIterator<number | undefined>;

    constructor(input: RSIInput) {
        super(input);

        var period = input.period;
        var values = input.values;

        var GainProvider = new AverageGain({ period: period, values: [] });
        var LossProvider = new AverageLoss({ period: period, values: [] });

        this.generator = (function* (_period) {
            var current = yield;
            var lastAvgGain, lastAvgLoss, RS, currentRSI;
            while (true) {
                lastAvgGain = GainProvider.nextValue(current);
                lastAvgLoss = LossProvider.nextValue(current);
                if (lastAvgGain !== undefined && lastAvgLoss !== undefined) {
                    if (lastAvgLoss === 0) {
                        currentRSI = 100;
                    } else if (lastAvgGain === 0) {
                        currentRSI = 0;
                    } else {
                        RS = lastAvgGain / lastAvgLoss;
                        RS = isNaN(RS) ? 0 : RS;
                        currentRSI = parseFloat((100 - 100 / (1 + RS)).toFixed(2));
                    }
                }
                current = yield currentRSI;
            }
        })(period);

        this.generator.next();

        this.result = [];

        values.forEach((tick) => {
            var result = this.generator.next(tick);
            if (result.value !== undefined) {
                this.result.push(result.value);
            }
        });
    }

    static calculate = rsi;

    nextValue(price: number): number | undefined {
        return this.generator.next(price).value;
    }
}

export function rsi(input: RSIInput): number[] {
    Indicator.reverseInputs(input);

    var result = new RSI(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
