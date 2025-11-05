import { Indicator, IndicatorInput } from '..//indicator';
import { SMA } from '../moving-averages/sma';
import { SD } from '../utils/sd';

export class BollingerBandsInput extends IndicatorInput {
    period!: number;
    stdDev!: number;
    values!: number[];
}

export class BollingerBandsOutput extends IndicatorInput {
    middle!: number;
    upper!: number;
    lower!: number;
    pb!: number;
}

export class BollingerBands extends Indicator {
    generator: IterableIterator<BollingerBandsOutput | undefined>;

    constructor(input: BollingerBandsInput) {
        super(input);
        var period = input.period;
        var priceArray = input.values;
        var stdDev = input.stdDev;
        var format = this.format;

        var sma, sd;

        this.result = [];

        sma = new SMA({
            period: period,
            values: [],
            format: (v) => {
                return v;
            }
        });
        sd = new SD({
            period: period,
            values: [],
            format: (v) => {
                return v;
            }
        });

        this.generator = (function* () {
            var result;
            var tick;
            var calcSMA;
            var calcSD;

            tick = yield;

            while (true) {
                calcSMA = sma.nextValue(tick);
                calcSD = sd.nextValue(tick);

                if (calcSMA && calcSD) {
                    let middle = format(calcSMA);
                    let upper = format(calcSMA + calcSD * stdDev);
                    let lower = format(calcSMA - calcSD * stdDev);
                    let pb: number = format((tick - lower) / (upper - lower));
                    result = {
                        middle: middle,
                        upper: upper,
                        lower: lower,
                        pb: pb
                    };
                }
                tick = yield result;
            }
        })();

        this.generator.next();

        priceArray.forEach((tick) => {
            var result = this.generator.next(tick);
            if (result.value != undefined) {
                this.result.push(result.value);
            }
        });
    }

    static calculate = bollingerbands;

    nextValue(price: number): BollingerBandsOutput | undefined {
        return this.generator.next(price).value;
    }
}

export function bollingerbands(input: BollingerBandsInput): BollingerBandsOutput[] {
    Indicator.reverseInputs(input);

    var result = new BollingerBands(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
