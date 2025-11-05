import StockData from '../types';
import CandlestickFinder from './candlestick_finder';
import Doji from './doji';

export default class AbandonedBaby extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'AbandonedBaby';
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
        let thirdDaysHigh = data.high[2];
        let thirdDaysLow = data.low[2];

        let isFirstBearish = firstDaysClose < firstDaysOpen;
        let dojiExists = new Doji().hasPattern({
            open: [secondDaysOpen],
            close: [secondDaysClose],
            high: [secondDaysHigh],
            low: [secondDaysLow]
        });

        let gapExists = secondDaysHigh < firstDaysLow && thirdDaysLow > secondDaysHigh && thirdDaysClose > thirdDaysOpen;
        let isThirdBullish = thirdDaysHigh < firstDaysOpen;

        return isFirstBearish && dojiExists && gapExists && isThirdBullish;
    }
}

export function abandonedBaby(data: StockData) {
    return new AbandonedBaby().hasPattern(data);
}
