import StockData from '../types';
import BearishEngulfingPattern from './bearish_engulfing_pattern';
import BearishHammerStick from './bearish_hammer_stick';
import BearishHarami from './bearish_harami';
import BearishHaramiCross from './bearish_harami_cross';
import BearishInvertedHammerStick from './bearish_inverted_hammer_stick';
import BearishMarubozu from './bearish_marubozu';
import CandlestickFinder from './candlestick_finder';
import EveningDojiStar from './evening_doji_star';
import EveningStar from './evening_star';
import HangingMan from './hanging_man';
import HangingManUnconfirmed from './hanging_man_unconfirmed';
import ShootingStar from './shooting_star';
import ShootingStarUnconfirmed from './shooting_star_unconfirmed';
import ThreeBlackCrows from './three_black_crows';
import TweezerTop from './tweezer_top';

let bearishPatterns = [
    new BearishEngulfingPattern(),
    new BearishHarami(),
    new BearishHaramiCross(),
    new EveningDojiStar(),
    new EveningStar(),
    new BearishMarubozu(),
    new ThreeBlackCrows(),
    new BearishHammerStick(),
    new BearishInvertedHammerStick(),
    new HangingMan(),
    new HangingManUnconfirmed(),
    new ShootingStar(),
    new ShootingStarUnconfirmed(),
    new TweezerTop()
];

export default class BearishPatterns extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'Bearish Candlesticks';
    }

    hasPattern(data: StockData) {
        return bearishPatterns.reduce(function (state, pattern) {
            return state || pattern.hasPattern(data);
        }, false);
    }
}

export function bearish(data: StockData) {
    return new BearishPatterns().hasPattern(data);
}
