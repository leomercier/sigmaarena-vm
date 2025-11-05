import { Indicator, IndicatorInput } from '../indicator';
import { WEMA } from '../moving-averages/wema';
import { WilderSmoothing } from '../moving-averages/wilder_smoothing';
import { MDM } from './minus_dm';
import { PDM } from './plus_dm';
import { TrueRange } from './true_range';

export class ADXInput extends IndicatorInput {
    high!: number[];
    low!: number[];
    close!: number[];
    period!: number;
}

export class ADXOutput extends IndicatorInput {
    adx?: number;
    pdi?: number;
    mdi?: number;
}

export class ADX extends Indicator {
    result: ADXOutput[];
    generator: IterableIterator<ADXOutput | undefined>;

    constructor(input: ADXInput) {
        super(input);
        var lows = input.low;
        var highs = input.high;
        var closes = input.close;
        var period = input.period;
        var format = this.format;

        var plusDM = new PDM({
            high: [],
            low: []
        });

        var minusDM = new MDM({
            high: [],
            low: []
        });

        var emaPDM = new WilderSmoothing({
            period: period,
            values: [],
            format: (v) => {
                return v;
            }
        });
        var emaMDM = new WilderSmoothing({
            period: period,
            values: [],
            format: (v) => {
                return v;
            }
        });
        var emaTR = new WilderSmoothing({
            period: period,
            values: [],
            format: (v) => {
                return v;
            }
        });
        var emaDX = new WEMA({
            period: period,
            values: [],
            format: (v) => {
                return v;
            }
        });

        var tr = new TrueRange({
            low: [],
            high: [],
            close: []
        });

        if (!(lows.length === highs.length && highs.length === closes.length)) {
            throw 'Inputs(low,high, close) not of equal size';
        }

        this.result = [];

        this.generator = (function* () {
            var tick = yield;
            var lastPDI, lastMDI, lastDX, smoothedDX;

            while (true) {
                let calcTr = tr.nextValue(tick);
                let calcPDM = plusDM.nextValue(tick);
                let calcMDM = minusDM.nextValue(tick);

                if (calcTr === undefined) {
                    tick = yield;
                    continue;
                }

                let lastATR = emaTR.nextValue(calcTr);
                let lastAPDM = emaPDM.nextValue(calcPDM);
                let lastAMDM = emaMDM.nextValue(calcMDM);

                if (lastATR != undefined && lastAPDM != undefined && lastAMDM != undefined) {
                    lastPDI = (lastAPDM * 100) / lastATR;
                    lastMDI = (lastAMDM * 100) / lastATR;

                    let diDiff = Math.abs(lastPDI - lastMDI);
                    let diSum = lastPDI + lastMDI;

                    lastDX = (diDiff / diSum) * 100;
                    smoothedDX = emaDX.nextValue(lastDX);
                }
                tick = yield { adx: smoothedDX, pdi: lastPDI, mdi: lastMDI };
            }
        })();

        this.generator.next();

        lows.forEach((tick, index) => {
            var result = this.generator.next({
                high: highs[index],
                low: lows[index],
                close: closes[index]
            });
            if (result.value != undefined && result.value.adx != undefined) {
                this.result.push({ adx: format(result.value.adx), pdi: format(result.value.pdi), mdi: format(result.value.mdi) });
            }
        });
    }

    static calculate = adx;

    nextValue(price: number): ADXOutput | undefined {
        let result = this.generator.next(price).value;
        if (result != undefined && result.adx != undefined) {
            return { adx: this.format(result.adx), pdi: this.format(result.pdi), mdi: this.format(result.mdi) };
        }
    }
}

export function adx(input: ADXInput): ADXOutput[] {
    Indicator.reverseInputs(input);

    var result = new ADX(input).result;
    if (input.reversedInput) {
        result.reverse();
    }

    Indicator.reverseInputs(input);

    return result;
}
