import StockData from '../types';
import HammerPattern from './hammer_pattern';

export default class HammerPatternUnconfirmed extends HammerPattern {
    constructor() {
        super();
        this.name = 'HammerPatternUnconfirmed';
    }

    logic(data: StockData) {
        let isPattern = this.downwardTrend(data, false);
        isPattern = isPattern && this.includesHammer(data, false);
        return isPattern;
    }
}

export function hammerPatternUnconfirmed(data: StockData) {
    return new HammerPatternUnconfirmed().hasPattern(data);
}
