import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class BullishHaramiCross extends CandlestickFinder {
    constructor() {
        super();
        this.requiredCount = 2;
        this.name = 'BullishHaramiCross';
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysHigh = data.high[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let secondDaysLow = data.low[1];

        let isBullishHaramiCrossPattern =
            firstDaysOpen > secondDaysOpen &&
            firstDaysClose < secondDaysOpen &&
            firstDaysClose < secondDaysClose &&
            firstDaysOpen > secondDaysLow &&
            firstDaysHigh > secondDaysHigh;

        let isSecondDayDoji = this.approximateEqual(secondDaysOpen, secondDaysClose);

        return isBullishHaramiCrossPattern && isSecondDayDoji;
    }
}

export function bullishHaramiCross(data: StockData) {
    return new BullishHaramiCross().hasPattern(data);
}
