import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class ThreeWhiteSoldiers extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'ThreeWhiteSoldiers';
        this.requiredCount = 3;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysHigh = data.high[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let thirdDaysOpen = data.open[2];
        let thirdDaysClose = data.close[2];
        let thirdDaysHigh = data.high[2];

        let isUpTrend = secondDaysHigh > firstDaysHigh && thirdDaysHigh > secondDaysHigh;
        let isAllBullish = firstDaysOpen < firstDaysClose && secondDaysOpen < secondDaysClose && thirdDaysOpen < thirdDaysClose;

        let doesOpenWithinPreviousBody =
            firstDaysClose > secondDaysOpen && secondDaysOpen < firstDaysHigh && secondDaysHigh > thirdDaysOpen && thirdDaysOpen < secondDaysClose;

        return isUpTrend && isAllBullish && doesOpenWithinPreviousBody;
    }
}

export function threeWhiteSoldiers(data: StockData) {
    return new ThreeWhiteSoldiers().hasPattern(data);
}
