# SigmaArena VM - SN127

The SigmaArena Virtual Machine (VM) provides a sandboxed execution environment for evaluating on-chain and off-chain trading strategies before they are deployed into the SigmaArena competition. It bundles a deterministic simulation engine, strategy lifecycle helpers, and tooling to safely import user-authored TypeScript strategies with exchange-like trade functions.

## Highlights
- **Deterministic simulation loop** with seeded order books, execution slippage modeling, and configurable market presets.
- **Strategy authoring kit** that exposes typed trade functions (`buy`, `sell`, `getOrderStatus`, `getCurrentPrice`) and a `Trading` base class to streamline lifecycle management.
- **Sandbox orchestration** that packages strategies, injects VM-provided helpers, and runs them in an isolated Docker image.
- **Utility layer** for logging, delays, Slack notifications, and common config management.

## Project Layout
- `src/trading/` – core trading abstractions, session management, and simulation runner/example strategy.
- `src/sandbox/` – scripts for building and running the isolated execution environment, including Docker assets.
- `src/config/` – configuration helpers for wiring strategies into the VM.
- `src/utils/` – supporting utilities (logging, async helpers, Slack hooks, file copy scripts).
- `src/index.ts` – entry point placeholder for future orchestration code.

## Getting Started
1. **Prerequisites**: Node.js 20+ and Docker (for sandbox/image workflows).
2. **Install dependencies**:
   ```bash
   npm install
   ```
   The `postinstall` hook builds the TypeScript sources into `dist/`.
3. **Run the base runtime**:
   ```bash
   npm start
   ```
4. **Explore the simulation example** (runs against the mock strategy):
   ```bash
   npx tsx src/trading/example_simulation_runner.ts
   ```
5. **Sandbox smoke test** (shows how external modules will be wired in production):
   ```bash
   npx tsx src/sandbox/example_usage.ts
   ```

## Developer Workflow
- **Strategy authoring**: extend `src/trading/trading_class.ts` and expose a default instance in `src/trading/strategies/`.
- **Simulation testing**: adjust presets in `src/trading/simulation/simulation_config.ts` to validate execution behavior and market dynamics.
- **Sandbox iteration**: update the Docker assets under `src/sandbox/` and rebuild with `npm run build-sandbox-image`.

## Roadmap
- Enable external TypeScript modules so third-party strategy bundles can be dynamically linked.
- Create AI inference providers (via Chutes & Targon) that surface predictions and signals directly inside strategies.
- Build historical price oracles for replaying archived market data sets.
- Stand up live price oracles for real-time execution in connected deployments.
- Author comprehensive run-test scripts that validate strategies and VM services end-to-end.
- Deliver deploy scripts that ship validated strategies into the SigmaArena production arena.

---

Questions or ideas? Open an issue or start a discussion so we can shape the SigmaArena VM together.
