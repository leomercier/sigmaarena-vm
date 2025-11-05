import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class DarkCloudCover extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'DarkCloudCover';
        this.requiredCount = 2;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysHigh = data.high[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];

        let firstDayMidpoint = (firstDaysClose + firstDaysOpen) / 2;
        let isFirstBullish = firstDaysClose > firstDaysOpen;
        let isSecondBearish = secondDaysClose < secondDaysOpen;
        let isDarkCloudPattern = secondDaysOpen > firstDaysHigh && secondDaysClose < firstDayMidpoint && secondDaysClose > firstDaysOpen;

        return isFirstBullish && isSecondBearish && isDarkCloudPattern;
    }
}

export function darkCloudCover(data: StockData) {
    return new DarkCloudCover().hasPattern(data);
}
