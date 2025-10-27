/**
 * Delays in milliseconds.
 */
export interface Delays {
    oneSecond: number;
    twoSeconds: number;
    fiveSeconds: number;
    tenSeconds: number;
    thirtySeconds: number;
    oneMinute: number;
    fiveMinutes: number;
    tenMinutes: number;
    fifteenMinutes: number;
    thirtyMinutes: number;
    oneHour: number;
    twoHours: number;
    sixHours: number;
    twelveHours: number;
    oneDay: number;
    twoDays: number;
    threeDays: number;
    oneWeek: number;
    thirtyDays: number;
}

export const delays: Delays = {
    oneSecond: 1000,
    twoSeconds: 2 * 1000,
    fiveSeconds: 5 * 1000,
    tenSeconds: 10 * 1000,
    thirtySeconds: 30 * 1000,
    oneMinute: 60 * 1000,
    fiveMinutes: 5 * 60 * 1000,
    tenMinutes: 10 * 60 * 1000,
    fifteenMinutes: 15 * 60 * 1000,
    thirtyMinutes: 30 * 60 * 1000,
    oneHour: 60 * 60 * 1000,
    twoHours: 2 * 60 * 60 * 1000,
    sixHours: 6 * 60 * 60 * 1000,
    twelveHours: 12 * 60 * 60 * 1000,
    oneDay: 24 * 60 * 60 * 1000,
    twoDays: 2 * 24 * 60 * 60 * 1000,
    threeDays: 3 * 24 * 60 * 60 * 1000,
    oneWeek: 7 * 24 * 60 * 60 * 1000,
    thirtyDays: 30 * 24 * 60 * 60 * 1000
};

export async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
