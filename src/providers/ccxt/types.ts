export interface OHLCVInputData {
    address: string;
    platform: string;
    timeFrom: Date;
    timeTo: Date;
    intervalType: string;
    currency: string;
}

export const defaultCurrency = 'usd';

export interface OHLCVExchangeInputData {
    exchangeId: string;
    exchangeType: 'spot' | 'futures';
    address: string;
    symbol: string;
    timeFrom: Date;
    timeTo: Date;
    intervalType: string;
}
