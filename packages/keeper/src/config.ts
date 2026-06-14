// Keeper config + its OWN throwaway keypair (gas-only). The keeper key is
// deliberately NOT the policy's registered_agent: `poke` is permissionless, so a
// keeper from ANY funded key must work — that's the proof a malicious keeper can
// only choose *when* to poke a deterministic function, never the outcome.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { PYTH_SUI_USD, HERMES_BETA_URL } from "@seawall/shared";
import type { KeeperConfig } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(here, "../../../config/testnet.json");
const KEY_PATH = join(here, "..", ".keeper.key"); // gitignored (*.key)

export function loadKeeperConfig(): KeeperConfig {
  const c = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  for (const k of ["packageId", "policyId", "poolId", "feedId", "pythState", "wormholeState", "dbusdcType"]) {
    if (!c[k] || c[k] === "0x0") throw new Error(`config/testnet.json: '${k}' unset — deploy first`);
  }
  if (c.feedId.replace(/^0x/, "") === PYTH_SUI_USD.mainnet.replace(/^0x/, "")) {
    throw new Error("feedId is the MAINNET id — refusing (contract reads the beta feed)");
  }
  if (!c.registeredAgent) throw new Error("config/testnet.json: 'registeredAgent' unset");
  return { ...c, hermesUrl: HERMES_BETA_URL } as KeeperConfig;
}

/// The keeper's own key: env KEEPER_KEY (bech32) → gitignored file → generate+save.
export function loadOrCreateKeeperKeypair(): Ed25519Keypair {
  const fromEnv = process.env.KEEPER_KEY;
  if (fromEnv) return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(fromEnv).secretKey);
  if (existsSync(KEY_PATH)) {
    return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(readFileSync(KEY_PATH, "utf8").trim()).secretKey);
  }
  const kp = new Ed25519Keypair();
  writeFileSync(KEY_PATH, kp.getSecretKey(), { mode: 0o600 }); // bech32 suiprivkey…, gitignored
  return kp;
}

/// Exports a CLI-keystore key (used only to one-time fund the keeper from the
/// deployer — the keeper itself never needs the deployer key).
export function exportCliKeypair(addr: string): Ed25519Keypair {
  // SECURITY: stdout here is the bech32 SECRET. Scrub on any failure so the
  // captured buffer never reaches a thrown error / journald (see agent config.ts).
  let out: string;
  try {
    out = execSync(`sui keytool export --key-identity ${addr} --json`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
  } catch {
    throw new Error(`sui keytool export failed for ${addr} (key not in CLI keystore?)`);
  }
  try {
    return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(JSON.parse(out).exportedPrivateKey as string).secretKey);
  } catch {
    throw new Error(`could not parse exported key for ${addr}`);
  } finally {
    out = "";
  }
}
