import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class DownsideTasukiGap extends CandlestickFinder {
    constructor() {
        super();
        this.requiredCount = 3;
        this.name = 'DownsideTasukiGap';
    }
    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysLow = data.low[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let thirdDaysOpen = data.open[2];
        let thirdDaysClose = data.close[2];

        let isFirstBearish = firstDaysClose < firstDaysOpen;
        let isSecondBearish = secondDaysClose < secondDaysOpen;
        let isThirdBullish = thirdDaysClose > thirdDaysOpen;
        let isFirstGapExists = secondDaysHigh < firstDaysLow;
        let isDownsideTasukiGap =
            secondDaysOpen > thirdDaysOpen && secondDaysClose < thirdDaysOpen && thirdDaysClose > secondDaysOpen && thirdDaysClose < firstDaysClose;

        return isFirstBearish && isSecondBearish && isThirdBullish && isFirstGapExists && isDownsideTasukiGap;
    }
}

export function downsideTasukiGap(data: StockData) {
    return new DownsideTasukiGap().hasPattern(data);
}
