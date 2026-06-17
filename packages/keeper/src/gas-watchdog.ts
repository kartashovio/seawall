// gas-watchdog — keeps the demo's two gas-spending identities topped up so the
// live dashboard never dies of an empty wallet. Designed to run on a systemd
// timer (every ~20 min) on the prod box; see deploy/seawall-gas-watchdog.*.
//
// The two identities and their (measured) burn, steady-state ≈ 0.4 SUI/day total:
//   • agent  = the policy's registered_agent (CAUTION submits + 5-min heartbeat)
//   • keeper = the throwaway poke key (.keeper.key, 5-min permissionless poke)
//
// Strategy per address, cheapest-first:
//   1. balance >= LOW_SUI  → nothing to do.
//   2. else hit the public testnet faucet (HTTP v2). It is per-IP rate-limited,
//      so a 429 is normal — we log and move on; the next tick tries again. A few
//      successful hits/day dwarf the ~0.4 SUI/day burn, so this alone sustains it.
//   3. keeper-only safety net: if the keeper is critically low and the faucet
//      didn't help, transfer a top-up from the deployer (which self-refills via
//      the faucet as the agent). The keeper must never die — a missed poke is
//      safe, but a dead keeper stops the on-chain liveness heartbeat.
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { loadKeeperConfig, loadOrCreateKeeperKeypair, exportCliKeypair } from "./config";

const FAUCET = process.env.FAUCET_URL ?? "https://faucet.testnet.sui.io/v2/gas";
const MIST = 1_000_000_000;
const LOW_SUI = Number(process.env.GAS_LOW_SUI ?? 2.0); // refill target
const KEEPER_CRIT_SUI = 0.5; // keeper deployer-fallback trigger
// The deployer-raid floor MUST dominate the refill target, so the agent (which
// IS the deployer) can never be split below its own keep-alive line by its own
// watchdog. Coupled to LOW_SUI on purpose.
const DEPLOYER_MIN_SUI = Math.max(2.0, LOW_SUI);
const FALLBACK_MIST = BigInt(Math.round(0.5 * MIST));

const ts = (): string => new Date().toISOString().replace("T", " ").slice(0, 19);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function balSui(c: SuiClient, addr: string): Promise<number> {
  return Number((await c.getBalance({ owner: addr })).totalBalance) / MIST;
}

async function faucetOnce(addr: string): Promise<{ status: number; body: string }> {
  try {
    const r = await fetch(FAUCET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ FixedAmountRequest: { recipient: addr } }),
    });
    return { status: r.status, body: (await r.text()).replace(/\s+/g, " ").slice(0, 120) };
  } catch (e) {
    return { status: 0, body: `ERR ${String(e).slice(0, 100)}` };
  }
}

// The public faucet is per-IP rate-limited and answers a 429 with a short
// "Wait for Ns" hint — honor it once so a single run usually lands the top-up.
async function faucet(addr: string): Promise<string> {
  let res = await faucetOnce(addr);
  const m = res.body.match(/Wait for (\d+)\s*s/i);
  if (res.status === 429 && m) {
    await sleep((Number(m[1]) + 1) * 1000);
    res = await faucetOnce(addr);
  }
  return `${res.status} ${res.body}`;
}

async function main(): Promise<void> {
  const cfg = loadKeeperConfig();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const keeperAddr = loadOrCreateKeeperKeypair().getPublicKey().toSuiAddress();
  const agentAddr = cfg.registeredAgent;

  let first = true;
  for (const [name, addr] of [
    ["agent", agentAddr],
    ["keeper", keeperAddr],
  ] as const) {
    // Per-address try/catch: one wallet's RPC hiccup neither aborts the other
    // nor hides which wallet was being serviced (the top-level catch is a backstop).
    try {
      const bal = await balSui(client, addr);
      if (bal >= LOW_SUI) {
        console.log(`[gas ${ts()}] ${name} ${addr.slice(0, 10)} ${bal.toFixed(3)} SUI — ok`);
        continue;
      }
      if (!first) await sleep(4000); // space requests under the per-IP cooldown
      first = false;
      const f = await faucet(addr);
      const after = await balSui(client, addr);
      console.log(`[gas ${ts()}] ${name} ${addr.slice(0, 10)} ${bal.toFixed(3)}→${after.toFixed(3)} SUI LOW → faucet ${f}`);
    } catch (e) {
      console.log(`[gas ${ts()}] ${name} check failed: ${String(e).slice(0, 100)}`);
    }
  }

  // keeper safety net — never let the heartbeat die.
  const kbal = await balSui(client, keeperAddr);
  if (kbal < KEEPER_CRIT_SUI) {
    try {
      const deployer = exportCliKeypair(cfg.registeredAgent);
      const dbal = await balSui(client, deployer.getPublicKey().toSuiAddress());
      if (dbal >= DEPLOYER_MIN_SUI) {
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(FALLBACK_MIST)]);
        tx.transferObjects([coin], tx.pure.address(keeperAddr));
        const res = await client.signAndExecuteTransaction({ signer: deployer, transaction: tx });
        await client.waitForTransaction({ digest: res.digest }); // confirm finality before logging success
        const kafter = await balSui(client, keeperAddr);
        console.log(`[gas ${ts()}] keeper critically low → topped 0.5 SUI from deployer ${res.digest.slice(0, 10)} (keeper now ${kafter.toFixed(3)})`);
      } else {
        console.log(`[gas ${ts()}] keeper critically low but deployer buffer thin (${dbal.toFixed(3)}) — relying on faucet`);
      }
    } catch (e) {
      console.log(`[gas ${ts()}] deployer fallback failed: ${String(e).slice(0, 100)}`);
    }
  }
}

main().catch((e) => {
  console.error("[gas] FATAL", e);
  process.exitCode = 1;
});
