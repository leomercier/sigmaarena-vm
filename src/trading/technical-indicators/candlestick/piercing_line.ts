import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class PiercingLine extends CandlestickFinder {
    constructor() {
        super();
        this.requiredCount = 2;
        this.name = 'PiercingLine';
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysLow = data.low[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysLow = data.low[1];

        let firstDaysMidpoint = (firstDaysOpen + firstDaysClose) / 2;
        let isDowntrend = secondDaysLow < firstDaysLow;
        let isFirstBearish = firstDaysClose < firstDaysOpen;
        let isSecondBullish = secondDaysClose > secondDaysOpen;

        let isPiercingLinePattern = firstDaysLow > secondDaysOpen && secondDaysClose > firstDaysMidpoint;

        return isDowntrend && isFirstBearish && isPiercingLinePattern && isSecondBullish;
    }
}

export function piercingLine(data: StockData) {
    return new PiercingLine().hasPattern(data);
}
