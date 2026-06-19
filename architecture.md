# Autonomous Risk Guardian

## Entities

- [offchain] ML risk-scoring model
- [onchain] Move package on Sui
- [protocol] lending protocol

## Roles of the entities

### offchain: ML

A trained ML model scores the current state of the market. It outputs:

- AI risk score (for the dashboard)
- max_ltv, %
- borrow_cap, %

We never touch liq_buffer, because then the agent could do harm.

We send a ParamRequest on-chain when:

- clamp(target) is tighter than current
- OR every 5 minutes

### offchain: keeper

Every 5 minutes it calls the on-chain function to compute div_own with no parameters from the off-chain agent. At the end, last_check is updated.

### onchain

Runs either with parameters from the off-chain agent, or without them.

```text
agent_req = data from the agent (optional)
div_own = f(divergence[Pyth<>DeepBook], depth DeepBook)  // function still to be finalized; it carries a coin_decimal factor
      If divergence >= X% , is_frozen=true
      else if depth DeepBook != ok, is_frozen=true
      else calculate onchain_own(div_own)  // compute the parameter on-chain

desired = tighter_of( clamp(agent_req,floor,baseline), clamp(onchain_own,floor,baseline) )  // if agent_req is absent from the call, run without it
      if desired is tighter than current, then  current = desired  // tighten instantly
      else, then step toward desired by one notch  // only while all-clear holds; we relax slowly and on our own

last_check = now
```

### protocol

We implement an inline check. When borrow or withdraw_collateral is called, we run the check through the on-chain Move package with no parameters.

We write the results into GuardianPolicy and use them. If is_frozen, the transaction is rejected. If the new max_ltv or borrow_cap require it, the transaction is rejected.

## Safety bounds

### Restrictions while frozen

We freeze:

- borrow
- withdraw_collateral

### Leaving the frozen state

No one but the DAO/owner can unfreeze the protocol.

### Bounded trust in the off-chain agent

1. Per the onchain section → "With parameters", we only ever change GuardianPolicy settings toward the safer side
2. Tightening is instant and by tighter_of. Relaxing happens drop by drop.

Every 10 minutes we lower the safety of the settings, if there is no reason to keep them stricter.

### Manual intervention

1. If the protocol is frozen, only the DAO/owner can lift the restriction
2. The DAO/owner can change the [baseline ; cap] bounds for the parameters — i.e. change the min–max values

### Decentralization

1. Any protocol can run its own off-chain agent
2. When interacting with the Move package, a protocol can change only its own GuardianPolicy — protection against attackers, only authorized changes

### Other safety notes

Besides last_check we also need to record last_change. That lets us know the most recent relax/freeze and compute the timeout.

## Why Sui?

- PTB atomicity
- Move capability/ownership (enforced at the type level)
- Native DeepBook CLOB
