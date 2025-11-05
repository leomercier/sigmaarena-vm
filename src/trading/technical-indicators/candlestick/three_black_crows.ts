import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class ThreeBlackCrows extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'ThreeBlackCrows';
        this.requiredCount = 3;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysLow = data.low[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysLow = data.low[1];
        let thirdDaysOpen = data.open[2];
        let thirdDaysClose = data.close[2];
        let thirdDaysLow = data.low[2];

        let isDownTrend = firstDaysLow > secondDaysLow && secondDaysLow > thirdDaysLow;
        let isAllBearish = firstDaysOpen > firstDaysClose && secondDaysOpen > secondDaysClose && thirdDaysOpen > thirdDaysClose;

        let doesOpenWithinPreviousBody =
            firstDaysOpen > secondDaysOpen && secondDaysOpen > firstDaysClose && secondDaysOpen > thirdDaysOpen && thirdDaysOpen > secondDaysClose;

        return isDownTrend && isAllBearish && doesOpenWithinPreviousBody;
    }
}

export function threeBlackCrows(data: StockData) {
    return new ThreeBlackCrows().hasPattern(data);
}
