import StockData from '../types';
import CandlestickFinder from './candlestick_finder';

export default class BearishEngulfingPattern extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'BearishEngulfingPattern';
        this.requiredCount = 2;
    }

    logic(data: StockData) {
        let firstDaysOpen = data.open[0];
        let firstDaysClose = data.close[0];
        let secondDaysOpen = data.open[1];
        let secondDaysClose = data.close[1];

        let isBearishEngulfing =
            firstDaysClose > firstDaysOpen && firstDaysOpen < secondDaysOpen && firstDaysClose < secondDaysOpen && firstDaysOpen > secondDaysClose;

        return isBearishEngulfing;
    }
}

export function bearishEngulfingPattern(data: StockData) {
    return new BearishEngulfingPattern().hasPattern(data);
}
