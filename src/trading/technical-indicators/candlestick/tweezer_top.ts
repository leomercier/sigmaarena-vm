import StockData from '../types';
import { averageGain } from '../utils/average_gain';
import { averageLoss } from '../utils/average_loss';
import CandlestickFinder from './candlestick_finder';

export default class TweezerTop extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'TweezerTop';
        this.requiredCount = 5;
    }

    logic(data: StockData) {
        return this.upwardTrend(data) && data.high[3] == data.high[4];
    }

    upwardTrend(data: StockData) {
        // Analyze trends in closing prices of the first three or four candlesticks
        let gains = averageGain({ values: data.close.slice(0, 3), period: 2 });
        let losses = averageLoss({ values: data.close.slice(0, 3), period: 2 });

        // Upward trend, so more gains than losses
        return gains > losses;
    }
}

export function tweezerTop(data: StockData) {
    return new TweezerTop().hasPattern(data);
}
