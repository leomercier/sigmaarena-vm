import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class EveningStar extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'EveningStar';
        this.requiredCount = 3;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysHigh = data.high[0];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let secondDaysLow = data.low[1];
        let thirdDaysOpen = data.open[2];
        let thirdDaysClose = data.close[2];

        let firstDaysMidpoint = (firstDaysOpen + firstDaysClose) / 2;
        let isFirstBullish = firstDaysClose > firstDaysOpen;
        let isSmallBodyExists = firstDaysHigh < secondDaysLow && firstDaysHigh < secondDaysHigh;
        let isThirdBearish = thirdDaysOpen > thirdDaysClose;

        let gapExists =
            secondDaysHigh > firstDaysHigh && secondDaysLow > firstDaysHigh && thirdDaysOpen < secondDaysLow && secondDaysClose > thirdDaysOpen;
        let doesCloseBelowFirstMidpoint = thirdDaysClose < firstDaysMidpoint;

        return isFirstBullish && isSmallBodyExists && gapExists && isThirdBearish && doesCloseBelowFirstMidpoint;
    }
}

export function eveningStar(data: StockData) {
    return new EveningStar().hasPattern(data);
}
