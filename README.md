# SigmaArena VM - SN127

A TypeScript-based trading simulation platform that provides sandboxed execution environment for evaluating trading strategies with real market data. The system integrates with multiple exchanges via CCXT, runs strategies in isolated environments, and generates detailed performance reports.

## Highlights

- **CLI-based trading simulation** with configurable strategies and market data fetching
- **CCXT integration** for real-time and historical market data from multiple exchanges
- **Deterministic simulation engine** with order execution modeling, slippage simulation, and configurable market conditions
- **Strategy authoring framework** with typed trade functions (`buy`, `sell`, `getOrderStatus`, `getCurrentPrice`) and a `Trading` base class
- **Sandboxed execution** that isolates strategies in Docker containers for secure evaluation
- **Comprehensive reporting** with trade analysis, performance metrics, and detailed logging

## Project Layout

- `src/commands/` – CLI interface and command implementations, including the `simulate-trade` command
- `src/providers/ccxt/` – CCXT exchange integration for fetching real market data (OHLCV)
- `src/trading/` – core trading abstractions, simulation engine, strategy management, and reporting
- `src/sandbox/` – isolated execution environment with Docker containerization
- `src/config/` – configuration management for strategies and simulation parameters
- `src/utils/` – utilities for logging, error handling, delays, and file operations
- `results/` – output directory for simulation results, trade reports, and market data

## Getting Started

1. **Prerequisites**: Node.js 20+ and Docker (for sandbox execution).

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run a trading simulation**:

   ```bash
   npm run simulate-trade src/commands/simulate-trade/config.json src/trading/strategies/rsi.ts
   ```
   This runs the RSI strategy with real market data and generates comprehensive reports.

4. **Check simulation results**:

   - `results/simulation_result.json` – main simulation output
   - `results/trade_report.md` – detailed performance analysis
   - `results/trades.md` – individual trade records
   - `results/ohlcv_data.json` – market data used in simulation

## CLI Commands

### Simulate Trade

Run a trading strategy simulation with real market data:
   ```bash
   npm run simulate-trade <config.json> <strategy.ts>
   ```

**Example:**

   ```bash
   npm run simulate-trade src/commands/simulate-trade/config.json src/trading/strategies/rsi.ts
   ```

The configuration file should include:

- `tradingConfig`: wallet balance, tradable tokens, exchange settings
- `simulationConfig`: order fill strategy, slippage parameters
- `exchangeConfig`: exchange ID, symbol, time range, and data interval

## Market Data Integration

The system integrates with multiple cryptocurrency exchanges through CCXT:

### Supported Exchanges

- **MEXC** and **Hyperliquid**: currently configured
- **Other CCXT exchanges**: Easily configurable once need arises

### Data Intervals

Supports various timeframes for historical data:
- `1m`, `5m`, `15m`, `30m`, `60m` (minutes)
- `1H`, `4H` (hours)
- `1D` (days)
- `1W` (week), `1M` (month)

### OHLCV Data Fetching

The system automatically fetches Open, High, Low, Close, Volume data for specified time ranges and handles pagination for large datasets.

## Strategy Development

### Creating Strategies

Extend the `Trading` base class and implement the abstract functions. Get inspiration from the existing strategies in the `strategies` folder.

### Available Trade Functions

- `buy(token, amount, price)` – Execute buy orders
- `sell(token, amount, price)` – Execute sell orders
- `getOrderStatus(orderId)` – Check order status
- `getCurrentPrice(token)` – Get current market price

## Simulation Features

### Order Execution Modeling

- **Immediate fill**: Orders execute instantly at market price
- **Slippage simulation**: Configurable price impact modeling
- **Order book simulation**: Realistic market depth consideration

### Performance Analytics

The system generates comprehensive reports including:

- **P&L Analysis**: Profit/loss tracking across all trades
- **Trade Statistics**: Win rate, average profit/loss, trade frequency

### Output Files

- `simulation_result.json`: Complete simulation data and metrics
- `trade_report.md`: Human-readable performance analysis
- `trades.md`: Detailed individual trade records
- `ohlcv_data.json`: Market data used for backtesting

## Configuration

### Trading Config

```json
{
  "walletBalance": { "USDC": 10000, "BTC": 0, "ETH": 0 },
  "baseToken": "USDC",
  "tradableTokens": ["BTCUSDC", "ETHUSDC"],
  "exchangeSettings": {
    "spotEnabled": true,
    "futuresEnabled": true,
    "spotLeverageOptions": [1, 2, 3],
    "futuresLeverageOptions": [1, 2, 3, 4, 5, 10]
  }
}
```

### Simulation Config

```json
{
  "orderFillStrategy": "immediate",
  "slippagePercentage": 0.005
}
```

### Exchange Config

```json
{
  "exchangeId": "mexc",
  "exchangeType": "spot",
  "symbol": "ETHUSDC",
  "timeFrom": "2024-10-01T00:00:00Z",
  "timeTo": "2024-10-21T00:00:00Z",
  "intervalType": "5m"
}
```

- **Simulate a trade run**: execute the CLI through `npx` with a JSON config path and the strategy entry file you want to evaluate.
    ```bash
    EXCHANGE_MEXC=apiKey:xxxx|apiSecret:xxxx npx sigmaarena-vm simulate-trade ./example/config.json ./example/agent.ts
    ```

## Development Workflow

- **Strategy development**: Create new strategies in `src/trading/strategies/`
- **Configuration tuning**: Modify simulation parameters in config files
- **Testing**: Run simulations with different market conditions and time ranges
- **Analysis**: Review generated reports and optimize strategy performance
- **Sandbox iteration**: Update Docker environment with `npm run build-sandbox-image`

## Roadmap

- **Multi-exchange support**: Expand CCXT integration to support more exchanges and trading pairs
- **Advanced order types**: Implement stop-loss, take-profit, and conditional orders
- **Real-time execution**: Enable live trading capabilities with real-time market data feeds
- **AI integration**: Connect ML models and prediction services for signal generation
- **Portfolio optimization**: Multi-asset portfolio management and risk assessment
- **Performance benchmarking**: Compare strategies against market indices and benchmarks
- **Risk management**: Advanced position sizing and portfolio risk controls
- **Production deployment**: Automated strategy deployment to live trading environments

## Docker Support

Build and run the sandbox environment:

```bash
# Build sandbox image
npm run build-sandbox-image

# Run development environment
make dev-env
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run simulations to validate functionality
4. Submit a pull request with performance analysis

## License

ISC License - see package.json for details.

---

Questions or ideas? Open an issue or start a discussion to help improve the trading simulation engine.
