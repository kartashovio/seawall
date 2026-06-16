#!/usr/bin/env bash
# seawall gas auto-faucet — keep the keeper (and the agent/deployer) topped from
# the FREE testnet faucet so a long-running demo can't silently run dry.
#
# Why this exists: the keeper funds itself ONCE at boot (ensureFunded, ~0.2 SUI,
# only when < 0.05) and never re-tops; at ~0.02-0.04 SUI/h it drains in hours and
# every poke then fails until refilled. This is additive — it NEVER touches the
# keeper/agent processes. A missed poke is fail-CLOSED anyway (the inline floor
# still protects every borrow); this just removes the operational papercut.
#
# Installed as seawall-keeper-fuel.service + .timer (every 30 min). Faucet 429s
# (rate-limit) are fine — the next tick retries; one success every couple of days
# keeps both addresses funded.
set -uo pipefail

RPC="https://fullnode.testnet.sui.io"
FAUCET="https://faucet.testnet.sui.io/v2/gas"

# "address min_mist" — request a top-up when the SUI balance drops below min.
WATCH=(
  "0x821dcf0cce95bb2b95b82e3e046be61f9c7ab19ed1725f8f0156528f80527274 300000000"  # keeper      < 0.3 SUI
  "0x818e43cdca009f9800e936784e13e43dc89076eecc9ac48add459036d56a9130 500000000"  # agent/owner < 0.5 SUI
)

bal() {
  curl -s --max-time 12 "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"suix_getBalance\",\"params\":[\"$1\",\"0x2::sui::SUI\"]}" \
    | sed -n 's/.*"totalBalance":"\([0-9]*\)".*/\1/p'
}

for row in "${WATCH[@]}"; do
  addr="${row%% *}"; min="${row##* }"
  b="$(bal "$addr")"; b="${b:-0}"
  if [ "$b" -lt "$min" ]; then
    code=$(curl -s --max-time 25 -o /tmp/seawall-fuel.out -w '%{http_code}' -X POST "$FAUCET" \
      -H 'Content-Type: application/json' -d "{\"FixedAmountRequest\":{\"recipient\":\"$addr\"}}")
    echo "[fuel] ${addr:0:12} bal=$b < $min -> faucet http=$code $(head -c 140 /tmp/seawall-fuel.out)"
  else
    echo "[fuel] ${addr:0:12} bal=$b ok (>= $min)"
  fi
done
