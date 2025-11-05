import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class BullishHarami extends CandlestickFinder {
    constructor() {
        super();
        this.requiredCount = 2;
        this.name = 'BullishHarami';
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let firstDaysHigh = data.high[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];
        let secondDaysHigh = data.high[1];
        let secondDaysLow = data.low[1];

        let isBullishHaramiPattern =
            firstDaysOpen > secondDaysOpen &&
            firstDaysClose < secondDaysOpen &&
            firstDaysClose < secondDaysClose &&
            firstDaysOpen > secondDaysLow &&
            firstDaysHigh > secondDaysHigh;

        return isBullishHaramiPattern;
    }
}

export function bullishHarami(data: StockData) {
    return new BullishHarami().hasPattern(data);
}
