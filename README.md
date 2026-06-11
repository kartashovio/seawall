# Seawall

An autonomous risk guardian for Sui lending protocols. An off-chain agent
watches several price and liquidity sources, scores how anomalous the market
looks, and can only ever push a protocol's parameters in the safer direction.
A Move policy object re-derives the breach on-chain and is the only thing that
can actually act, so you never have to trust the agent's number.

See [Architecture_ru.md](./Architecture_ru.md) for the overall design and
[docs/ml-plan.md](./docs/ml-plan.md) for the risk model and backtest.

## Layout

- `packages/shared` — constants, Pyth feed ids, shared types
- `packages/model` — the anomaly detector (pure TypeScript, no Sui deps)
- `packages/agent` — the off-chain agent and the backtest harness
- `data/` — local cache of downloaded market data (not committed)
