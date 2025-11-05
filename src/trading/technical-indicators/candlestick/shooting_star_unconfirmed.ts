import StockData from '../types';
import ShootingStar from './shooting_star';

export default class ShootingStarUnconfirmed extends ShootingStar {
    constructor() {
        super();
        this.name = 'ShootingStarUnconfirmed';
    }

    logic(data: StockData) {
        let isPattern = this.upwardTrend(data, false);
        isPattern = isPattern && this.includesHammer(data, false);
        return isPattern;
    }
}

export function shootingStarUnconfirmed(data: StockData) {
    return new ShootingStarUnconfirmed().hasPattern(data);
}
