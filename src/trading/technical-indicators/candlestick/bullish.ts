import StockData from '../types';
import BullishEngulfingPattern from './bullish_engulfing_pattern';
import BullishHammerStick from './bullish_hammer_stick';
import BullishHarami from './bullish_harami';
import BullishHaramiCross from './bullish_harami_cross';
import BullishInvertedHammerStick from './bullish_inverted_hammer_stick';
import BullishMarubozu from './bullish_marubozu';
import CandlestickFinder from './candlestick_finder';
import DownsideTasukiGap from './downside_tasuki_gap';
import HammerPattern from './hammer_pattern';
import HammerPatternUnconfirmed from './hammer_pattern_unconfirmed';
import MorningDojiStar from './morning_doji_star';
import MorningStar from './morning_star';
import PiercingLine from './piercing_line';
import ThreeWhiteSoldiers from './three_white_soldiers';
import TweezerBottom from './tweezer_bottom';

let bullishPatterns = [
    new BullishEngulfingPattern(),
    new DownsideTasukiGap(),
    new BullishHarami(),
    new BullishHaramiCross(),
    new MorningDojiStar(),
    new MorningStar(),
    new BullishMarubozu(),
    new PiercingLine(),
    new ThreeWhiteSoldiers(),
    new BullishHammerStick(),
    new BullishInvertedHammerStick(),
    new HammerPattern(),
    new HammerPatternUnconfirmed(),
    new TweezerBottom()
];

export default class BullishPatterns extends CandlestickFinder {
    constructor() {
        super();
        this.name = 'Bullish Candlesticks';
    }

    hasPattern(data: StockData) {
        return bullishPatterns.reduce(function (state, pattern) {
            let result = pattern.hasPattern(data);
            return state || result;
        }, false);
    }
}

export function bullish(data: StockData) {
    return new BullishPatterns().hasPattern(data);
}
