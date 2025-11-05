import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class MorningStar extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'MorningStar';
        this.requiredCount = 3;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysLow = data.low[0];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let secondDaysLow = data.low[1];
        let thirdDaysOpen = data.open[2];
        let thirdDaysClose = data.close[2];

        let firstDaysMidpoint = (firstDaysOpen + firstDaysClose) / 2;
        let isFirstBearish = firstDaysClose < firstDaysOpen;
        let isSmallBodyExists = firstDaysLow > secondDaysLow && firstDaysLow > secondDaysHigh;
        let isThirdBullish = thirdDaysOpen < thirdDaysClose;

        let gapExists =
            secondDaysHigh < firstDaysLow && secondDaysLow < firstDaysLow && thirdDaysOpen > secondDaysHigh && secondDaysClose < thirdDaysOpen;
        let doesCloseAboveFirstMidpoint = thirdDaysClose > firstDaysMidpoint;

        return isFirstBearish && isSmallBodyExists && gapExists && isThirdBullish && doesCloseAboveFirstMidpoint;
    }
}

export function morningStar(data: StockData) {
    return new MorningStar().hasPattern(data);
}
