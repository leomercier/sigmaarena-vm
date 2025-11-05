import StockData from '../types';
import { averageGain } from '../utils/average_gain';
import { averageLoss } from '../utils/average_loss';
import CandlestickFinder from './candlestick_finder';

export default class TweezerBottom extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'TweezerBottom';
        this.requiredCount = 5;
    }

    logic(data: StockData) {
        return this.downwardTrend(data) && data.low[3] == data.low[4];
    }

    downwardTrend(data: StockData) {
        // Analyze trends in closing prices of the first three or four candlesticks
        let gains = averageGain({ values: data.close.slice(0, 3), period: 2 });
        let losses = averageLoss({ values: data.close.slice(0, 3), period: 2 });

        // Downward trend, so more losses than gains
        return losses > gains;
    }
}

export function tweezerBottom(data: StockData) {
    return new TweezerBottom().hasPattern(data);
}
