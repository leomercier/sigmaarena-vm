import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class BullishMarubozu extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'BullishMarubozu';
        this.requiredCount = 1;
    }

    logic(data: StockData) {
        let daysOpen = data.open[0];
        let daysClose = data.close[0];
        let daysHigh = data.high[0];
        let daysLow = data.low[0];

        let isBullishMarubozu =
            this.approximateEqual(daysClose, daysHigh) && this.approximateEqual(daysLow, daysOpen) && daysOpen < daysClose && daysOpen < daysHigh;

        return isBullishMarubozu;
    }
}

export function bullishMarubozu(data: StockData) {
    return new BullishMarubozu().hasPattern(data);
}
