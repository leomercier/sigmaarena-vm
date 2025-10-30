import { Exchange, hyperliquid, mexc } from 'ccxt';
import config from '../../config/config';
import { getErrorMetadata } from '../../utils/errors';
import { logError } from '../../utils/logging';

export interface ExchangeConfig {
    apiKey?: string;
    apiSecret?: string;
    privateKey?: string;
    walletAddress?: string;
    environment?: string;
    verbose?: string;

    balanceWalletAddress?: string;

    [key: string]: any;
}

export interface ExchangeData {
    exchange: Exchange;
    initialized: boolean;
    config: ExchangeConfig;
}

class Exchanges {
    private exchanges: Record<string, ExchangeData> = {};

    constructor() {
        for (const [exchangeName, exchangeParams] of Object.entries(config.exchangeConfigs)) {
            switch (exchangeName) {
                case 'mexc':
                    this.createMexcExchanges(exchangeParams);
                    break;
                case 'hyperliquid':
                    this.createHyperliquidExchanges(exchangeParams);
                    break;
            }
        }
    }

    public async getExchange(name: string, exchangeType: 'spot' | 'futures', initialize: boolean): Promise<ExchangeData | null> {
        const keyName = `${name}-${exchangeType}`;

        if (!this.exchanges[keyName]) {
            return null;
        }

        if (!this.exchanges[keyName].initialized && initialize) {
            try {
                await this.exchanges[keyName].exchange.loadMarkets();
                this.exchanges[keyName].initialized = true;
            } catch (err) {
                logError('Error initializing exchange', { name: keyName, ...getErrorMetadata(err as Error) });
                return null;
            }
        }

        return this.exchanges[keyName];
    }

    private createMexcExchanges(params: string): void {
        const exchangeConfig = this.parseExchangeConfig(params);

        if (!exchangeConfig.apiKey || !exchangeConfig.apiSecret) {
            return;
        }

        const exchange = new mexc({
            apiKey: exchangeConfig.apiKey,
            secret: exchangeConfig.apiSecret,
            verbose: exchangeConfig.verbose === 'true' ? true : false
        });

        this.exchanges['mexc-spot'] = {
            exchange,
            initialized: false,
            config: exchangeConfig
        };
    }

    private createHyperliquidExchanges(params: string): void {
        const exchangeConfig = this.parseExchangeConfig(params);

        if (!exchangeConfig.privateKey || !exchangeConfig.walletAddress) {
            return;
        }

        const baseUserConfig: any = {
            privateKey: exchangeConfig.privateKey,
            walletAddress: exchangeConfig.walletAddress,
            verbose: exchangeConfig.verbose === 'true' ? true : false
        };

        if (exchangeConfig.environment === 'testnet') {
            baseUserConfig.urls = {
                api: {
                    public: 'https://api.hyperliquid-testnet.xyz',
                    private: 'https://api.hyperliquid-testnet.xyz'
                }
            };
            baseUserConfig.sandbox = true;
        }

        const spotUserConfig = { ...baseUserConfig, options: { defaultType: 'spot' } };
        const spotExchange = new hyperliquid(spotUserConfig);
        this.exchanges['hyperliquid-spot'] = {
            exchange: spotExchange,
            initialized: false,
            config: exchangeConfig
        };

        const futuresUserConfig = { ...baseUserConfig, options: { defaultType: 'perps' } };
        const futuresExchange = new hyperliquid(futuresUserConfig);
        this.exchanges['hyperliquid-futures'] = {
            exchange: futuresExchange,
            initialized: false,
            config: exchangeConfig
        };
    }

    private parseExchangeConfig(params: string): ExchangeConfig {
        const pairs = params.split('|');

        const exchangeConfig: ExchangeConfig = {};

        for (const pair of pairs) {
            const [key, value] = pair.split(':');
            exchangeConfig[key.trim()] = value.trim();
        }

        return exchangeConfig;
    }
}

export const exchangesInstance = new Exchanges();
