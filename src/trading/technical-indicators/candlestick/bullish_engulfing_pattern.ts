import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class BullishEngulfingPattern extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'BullishEngulfingPattern';
        this.requiredCount = 2;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];

        let isBullishEngulfing =
            firstDaysClose < firstDaysOpen && firstDaysOpen > secondDaysOpen && firstDaysClose > secondDaysOpen && firstDaysOpen < secondDaysClose;

        return isBullishEngulfing;
    }
}

export function bullishEngulfingPattern(data: StockData) {
    return new BullishEngulfingPattern().hasPattern(data);
}
