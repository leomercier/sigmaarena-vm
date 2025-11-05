import { Indicator, IndicatorInput } from '../indicator';
import { SMA } from '../moving-averages/sma';
import { RSI } from '../oscillators/rsi';
import { Stochastic } from './stochastic';

export class StochasticRsiInput extends IndicatorInput {
    values!: number[];
    rsiPeriod!: number;
    stochasticPeriod!: number;
    kPeriod!: number;
    dPeriod!: number;
}

export class StochasticRSIOutput {
    stochRSI!: number;
    k!: number;
    d!: number;
}

export class StochasticRSI extends Indicator {
    result: StochasticRSIOutput[];
    generator: IterableIterator<StochasticRSIOutput | undefined>;

    constructor(input: StochasticRsiInput) {
        super(input);
        let closes = input.values;
        let rsiPeriod = input.rsiPeriod;
        let stochasticPeriod = input.stochasticPeriod;
        let kPeriod = input.kPeriod;
        let dPeriod = input.dPeriod;
        this.result = [];

        this.generator = (function* () {
            let rsi = new RSI({ period: rsiPeriod, values: [] });
            let stochastic = new Stochastic({ period: stochasticPeriod, high: [], low: [], close: [], signalPeriod: kPeriod });
            let dSma = new SMA({
                period: dPeriod,
                values: [],
                format: (v) => {
                    return v;
                }
            });

            let lastRSI, stochasticRSI, d, result;
            var tick = yield;

            while (true) {
                lastRSI = rsi.nextValue(tick);

                if (lastRSI !== undefined) {
                    var stochasticInput = { high: lastRSI, low: lastRSI, close: lastRSI } as any;
                    stochasticRSI = stochastic.nextValue(stochasticInput);

                    if (stochasticRSI !== undefined && stochasticRSI.d !== undefined) {
                        d = dSma.nextValue(stochasticRSI.d);
                        if (d !== undefined)
                            result = {
                                stochRSI: stochasticRSI.k,
                                k: stochasticRSI.d,
                                d: d
                            };
                    }
                }
                tick = yield result;
            }
        })();

        this.generator.next();

        closes.forEach((tick, _index) => {
            var result = this.generator.next(tick);
            if (result.value !== undefined) {
                this.result.push(result.value);
            }
        });
    }

    static calculate = stochasticrsi;

    nextValue(input: StochasticRsiInput): StochasticRSIOutput | undefined {
        let nextResult = this.generator.next(input);
        if (nextResult.value !== undefined) {
            return nextResult.value;
        }
    }
}

export function stochasticrsi(input: StochasticRsiInput): StochasticRSIOutput[] {
    Indicator.reverseInputs(input);

    var result = new StochasticRSI(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
