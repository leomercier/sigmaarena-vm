import { OHLCVData } from '../../trading/types';
import { delays } from '../../utils/delays';
import { getErrorMetadata } from '../../utils/errors';
import { logError } from '../../utils/logging';
import { exchangesInstance } from './exchanges';
import { OHLCVExchangeInputData } from './types';

export async function getExchangeTokenOHLCVs(input: OHLCVExchangeInputData): Promise<OHLCVData[]> {
    let needsMoreData = true;
    let tokenOHLCVs: OHLCVData[] = [];

    if (input.timeFrom.getTime() > input.timeTo.getTime()) {
        return [];
    }

    let startDate = input.timeFrom;

    while (needsMoreData) {
        if (startDate.getTime() > input.timeTo.getTime()) {
            break;
        }

        const data = await getExchangeOHLCVData({
            exchangeId: input.exchangeId,
            exchangeType: input.exchangeType,
            address: input.address,
            symbol: input.symbol,
            timeFrom: startDate,
            timeTo: input.timeTo,
            intervalType: input.intervalType
        });

        tokenOHLCVs = tokenOHLCVs.concat(data);

        if (data.length > 0) {
            const lastTime = tokenOHLCVs[tokenOHLCVs.length - 1].timestamp;
            startDate = new Date(lastTime + ohlcvIntervalTypeDelays[input.intervalType]);
        } else {
            needsMoreData = false;
        }
    }

    return tokenOHLCVs;
}

async function getExchangeOHLCVData(input: OHLCVExchangeInputData): Promise<OHLCVData[]> {
    try {
        const exchangeData = await exchangesInstance.getExchange(input.exchangeId, input.exchangeType, true);
        if (!exchangeData) {
            return [];
        }

        const ohlcvData = await exchangeData.exchange.fetchOHLCV(input.symbol, input.intervalType, input.timeFrom.getTime());
        return ohlcvData.map((ohlcv) => ({
            open: ohlcv[1] || 0,
            high: ohlcv[2] || 0,
            low: ohlcv[3] || 0,
            close: ohlcv[4] || 0,
            volume: ohlcv[5] || 0,
            timestamp: new Date(ohlcv[0] || 0).getTime(),
            symbol: input.symbol
        }));
    } catch (err) {
        logError('Error in getExchangeOHLCVData', { ...getErrorMetadata(err as Error), input });
        throw err;
    }
}

export const ohlcvIntervalTypeDelays: Record<string, number> = {
    '1m': delays.oneMinute,
    '3m': 3 * delays.oneMinute,
    '5m': delays.fiveMinutes,
    '15m': delays.fifteenMinutes,
    '30m': delays.thirtyMinutes,
    '1H': delays.oneHour,
    '2H': delays.twoHours,
    '4H': 4 * delays.oneHour,
    '6H': delays.sixHours,
    '8H': 8 * delays.oneHour,
    '12H': delays.twelveHours,
    '1D': delays.oneDay,
    '3D': delays.threeDays,
    '1W': delays.oneWeek,
    '1M': 31 * delays.oneDay
};
