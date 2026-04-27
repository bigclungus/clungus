import { readFileSync } from "node:fs";
import { ConnectError, Code } from "@connectrpc/connect";
import type { HandlerContext, ServiceImpl } from "@connectrpc/connect";
import { requireAuth } from "./service-auth.js";
import { create } from "@bufbuild/protobuf";
import { WalletService, GetBalanceResponseSchema } from "../../gen/wallet/v1/wallet_pb.js";
import type { GetBalanceRequest, GetBalanceResponse } from "../../gen/wallet/v1/wallet_pb.js";


const WALLET_FILE = "/mnt/data/secrets/eth_wallet";
const BASE_RPC_URL = "https://base-mainnet.public.blastapi.io";

function readAddress(): string {
  const content = readFileSync(WALLET_FILE, "utf8");
  for (const line of content.split("\n")) {
    if (line.startsWith("ADDRESS=")) {
      return line.slice("ADDRESS=".length).trim();
    }
  }
  throw new ConnectError("ADDRESS not found in wallet file", Code.Internal);
}

async function fetchEthBalance(address: string): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_getBalance",
    params: [address, "latest"],
    id: 1,
  });

  const res = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new ConnectError(`RPC request failed: ${res.status} ${res.statusText}`, Code.Unavailable);
  }

  const data = (await res.json()) as { result?: string; error?: { message: string } };

  if (data.error) {
    throw new ConnectError(`RPC error: ${data.error.message}`, Code.Internal);
  }
  if (!data.result) {
    throw new ConnectError("No result from RPC", Code.Internal);
  }

  // Convert hex wei to ETH string
  const wei = BigInt(data.result);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

export const walletServiceImpl: ServiceImpl<typeof WalletService> = {
  async getBalance(_req: GetBalanceRequest, ctx: HandlerContext): Promise<GetBalanceResponse> {
    requireAuth(ctx);
    const address = readAddress();
    const balanceEth = await fetchEthBalance(address);

    return create(GetBalanceResponseSchema, {
      address,
      balanceEth,
      chain: "Base",
    });
  },
};
