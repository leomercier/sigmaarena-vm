import StockData from '../types';
import HangingMan from './hanging_man';

export default class HangingManUnconfirmed extends HangingMan {
    constructor() {
        super();
        this.name = 'HangingManUnconfirmed';
    }

    logic(data: StockData) {
        let isPattern = this.upwardTrend(data, false);
        isPattern = isPattern && this.includesHammer(data, false);
        return isPattern;
    }
}

export function hangingManUnconfirmed(data: StockData) {
    return new HangingManUnconfirmed().hasPattern(data);
}
