import StockData from '../types';
import { averageGain } from '../utils/average_gain';
import { averageLoss } from '../utils/average_loss';
import { bearishHammerStick } from './bearish_hammer_stick';
import { bullishHammerStick } from './bullish_hammer_stick';
import CandlestickFinder from './candlestick_finder';

export default class HangingMan extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'HangingMan';
        this.requiredCount = 5;
    }

    logic(data: StockData) {
        let isPattern = this.upwardTrend(data);
        isPattern = isPattern && this.includesHammer(data);
        isPattern = isPattern && this.hasConfirmation(data);
        return isPattern;
    }

    upwardTrend(data: StockData, confirm = true) {
        let end = confirm ? 3 : 4;
        // Analyze trends in closing prices of the first three or four candlesticks
        let gains = averageGain({ values: data.close.slice(0, end), period: end - 1 });
        let losses = averageLoss({ values: data.close.slice(0, end), period: end - 1 });
        // Upward trend, so more gains than losses
        return gains > losses;
    }

    includesHammer(data: StockData, confirm = true) {
        let start = confirm ? 3 : 4;
        let end = confirm ? 4 : undefined;
        let possibleHammerData = {
            open: data.open.slice(start, end),
            close: data.close.slice(start, end),
            low: data.low.slice(start, end),
            high: data.high.slice(start, end)
        };

        let isPattern = bearishHammerStick(possibleHammerData);
        isPattern = isPattern || bullishHammerStick(possibleHammerData);

        return isPattern;
    }

    hasConfirmation(data: StockData) {
        let possibleHammer = {
            open: data.open[3],
            close: data.close[3],
            low: data.low[3],
            high: data.high[3]
        };
        let possibleConfirmation = {
            open: data.open[4],
            close: data.close[4],
            low: data.low[4],
            high: data.high[4]
        };
        // Confirmation candlestick is bearish
        let isPattern = possibleConfirmation.open > possibleConfirmation.close;
        return isPattern && possibleHammer.close > possibleConfirmation.close;
    }
}

export function hangingMan(data: StockData) {
    return new HangingMan().hasPattern(data);
}
