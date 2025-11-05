import StockData from '../types';
import CandlestickFinder from './candlestick_finder';
import Doji from './doji';

export default class MorningDojiStar extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'MorningDojiStar';
        this.requiredCount = 3;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysLow = data.low[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let secondDaysLow = data.low[1];
        let thirdDaysOpen = data.open[2];
        let thirdDaysClose = data.close[2];

        let firstDaysMidpoint = (firstDaysOpen + firstDaysClose) / 2;
        let isFirstBearish = firstDaysClose < firstDaysOpen;
        let dojiExists = new Doji().hasPattern({
            open: [secondDaysOpen],
            close: [secondDaysClose],
            high: [secondDaysHigh],
            low: [secondDaysLow]
        });

        let isThirdBullish = thirdDaysOpen < thirdDaysClose;

        let gapExists =
            secondDaysHigh < firstDaysLow && secondDaysLow < firstDaysLow && thirdDaysOpen > secondDaysHigh && secondDaysClose < thirdDaysOpen;
        let doesCloseAboveFirstMidpoint = thirdDaysClose > firstDaysMidpoint;

        return isFirstBearish && dojiExists && isThirdBullish && gapExists && doesCloseAboveFirstMidpoint;
    }
}

export function morningDojiStar(data: StockData) {
    return new MorningDojiStar().hasPattern(data);
}
