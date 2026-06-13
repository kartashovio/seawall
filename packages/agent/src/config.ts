// Agent config: deployed IDs from config/testnet.json + the signing key (loaded
// at runtime from the CLI keystore, never hardcoded). Fail-fast on a missing id
// or a mainnet feed (the contract reads the beta feed; a mainnet id would 404 on
// hermes-beta and silently break the live leg).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { PYTH_SUI_USD, HERMES_BETA_URL } from "@seawall/shared";

export const SUI_TYPE = "0x2::sui::SUI";
export const CLOCK = "0x6";

export interface AgentConfig {
  packageId: string;
  policyId: string;
  poolId: string;
  vaultId?: string;
  feedId: string;
  dbusdcType: string;
  pythState: string;
  wormholeState: string;
  registeredAgent: string;
  hermesUrl: string;
}

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../config/testnet.json");

export function loadConfig(): AgentConfig {
  const c = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  for (const k of ["packageId", "policyId", "poolId", "feedId", "pythState", "wormholeState", "registeredAgent", "dbusdcType"]) {
    if (!c[k] || c[k] === "0x0") throw new Error(`config/testnet.json: '${k}' is unset — run Step 2/3 deploy first`);
  }
  if (c.feedId.replace(/^0x/, "") === PYTH_SUI_USD.mainnet.replace(/^0x/, "")) {
    throw new Error("feedId is the MAINNET id — the contract reads the beta feed; refusing to run");
  }
  return { ...c, hermesUrl: HERMES_BETA_URL } as AgentConfig;
}

/// Loads the registered-agent key from the CLI keystore at runtime (never in the
/// repo). In prod the agent has its own key registered via governance_rotate_agent;
/// for the demo it reuses the deployer/registered_agent address.
export function loadAgentKeypair(addr: string): Ed25519Keypair {
  const out = execSync(`sui keytool export --key-identity ${addr} --json`, { encoding: "utf8" });
  const { secretKey } = decodeSuiPrivateKey(JSON.parse(out).exportedPrivateKey as string);
  return Ed25519Keypair.fromSecretKey(secretKey);
}
