"""
bridge_act — Li.Fi bridge activities for ETH → USDC (Base → Polygon).

Activities:
  get_bridge_quote     — fetch a route+tx from Li.Fi API
  execute_bridge_tx    — sign and submit tx using wallet private key
  wait_for_bridge_confirmation — poll tx receipt until mined

Private key is read from /mnt/data/secrets/eth_wallet (first line).
"""

from __future__ import annotations

import asyncio
from logging import getLogger
from pathlib import Path
from typing import Any

import aiohttp
from temporalio import activity
from web3 import Web3

logger = getLogger(__name__)

LIFI_QUOTE_URL = "https://li.quest/v1/quote"
BASE_RPC = "https://mainnet.base.org"
WALLET_ADDRESS = "0x425bC492E43b2a5Eb7E02c9F5dd9c1D2F378f02f"
SECRETS_PATH = "/mnt/data/secrets/eth_wallet"

# Max wait for tx confirmation: 5 minutes
CONFIRMATION_TIMEOUT_S = 300
POLL_INTERVAL_S = 5


def _load_private_key() -> str:
    """Parse the wallet secrets file (KEY=VALUE format) and return the private key."""
    for line in Path(SECRETS_PATH).read_text().strip().splitlines():
        line = line.strip()
        if line.upper().startswith("PRIVATE_KEY="):
            key = line.split("=", 1)[1].strip()
            if not key.startswith("0x"):
                key = "0x" + key
            return key
    raise RuntimeError(f"[bridge] PRIVATE_KEY not found in {SECRETS_PATH}")


def _w3() -> Web3:
    return Web3(Web3.HTTPProvider(BASE_RPC))


@activity.defn
async def get_bridge_quote(
    from_chain: int,
    to_chain: int,
    from_token: str,
    to_token: str,
    amount_wei: int,
) -> dict[str, Any]:
    """Fetch a bridge quote from Li.Fi. Returns the full quote dict including transactionRequest."""
    params = {
        "fromChain": str(from_chain),
        "toChain": str(to_chain),
        "fromToken": from_token,
        "toToken": to_token,
        "fromAddress": WALLET_ADDRESS,
        "fromAmount": str(amount_wei),
        "slippage": "0.03",
    }
    logger.info("[bridge] fetching Li.Fi quote: %s", params)
    async with aiohttp.ClientSession() as session:
        async with session.get(LIFI_QUOTE_URL, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            body = await resp.json()
            if resp.status != 200:
                raise RuntimeError(f"[bridge] Li.Fi quote error {resp.status}: {body}")

    tx_req = body.get("transactionRequest")
    if not tx_req:
        raise RuntimeError(f"[bridge] Li.Fi quote missing transactionRequest: {body}")

    estimate = body.get("estimate", {})
    logger.info(
        "[bridge] quote ok — to_amount=%s to_amount_min=%s tool=%s",
        estimate.get("toAmount"),
        estimate.get("toAmountMin"),
        body.get("tool"),
    )
    return body


@activity.defn
async def execute_bridge_tx(quote: dict[str, Any]) -> str:
    """Sign and submit the bridge transaction. Returns tx hash (hex string)."""
    tx_req = quote["transactionRequest"]

    private_key = _load_private_key()
    w3 = _w3()

    # Resolve gas fields — Li.Fi returns hex strings
    def _hex_to_int(v: Any) -> int:
        if isinstance(v, int):
            return v
        return int(v, 16) if isinstance(v, str) and v.startswith("0x") else int(v)

    gas_limit = _hex_to_int(tx_req["gasLimit"])
    value = _hex_to_int(tx_req.get("value", "0x0"))

    # EIP-1559: derive maxFeePerGas / maxPriorityFeePerGas from current base fee
    latest = w3.eth.get_block("latest")
    base_fee = latest.get("baseFeePerGas", 0)
    # Li.Fi may give gasPrice as a fallback; use 2x base fee + 1 gwei priority
    priority_fee = Web3.to_wei(1, "gwei")
    max_fee = base_fee * 2 + priority_fee

    nonce = w3.eth.get_transaction_count(WALLET_ADDRESS)
    chain_id = _hex_to_int(tx_req["chainId"]) if "chainId" in tx_req else 8453

    tx_dict = {
        "to": Web3.to_checksum_address(tx_req["to"]),
        "data": tx_req["data"],
        "value": value,
        "gas": gas_limit,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": priority_fee,
        "nonce": nonce,
        "chainId": chain_id,
        "type": 2,
    }

    logger.info(
        "[bridge] signing tx — to=%s value=%d gas=%d nonce=%d chainId=%d",
        tx_dict["to"],
        value,
        gas_limit,
        nonce,
        chain_id,
    )

    signed = w3.eth.account.sign_transaction(tx_dict, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    tx_hash_hex = tx_hash.hex()
    logger.info("[bridge] tx submitted: %s", tx_hash_hex)
    return tx_hash_hex


@activity.defn
async def wait_for_bridge_confirmation(tx_hash: str) -> dict[str, Any]:
    """Poll Base RPC until the tx is mined. Returns receipt summary."""
    w3 = _w3()
    deadline = asyncio.get_event_loop().time() + CONFIRMATION_TIMEOUT_S

    logger.info("[bridge] waiting for confirmation: %s", tx_hash)
    while asyncio.get_event_loop().time() < deadline:
        activity.heartbeat(f"polling {tx_hash}")
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
            if receipt is not None:
                status = receipt.get("status", -1)
                block = receipt.get("blockNumber")
                gas_used = receipt.get("gasUsed")
                logger.info("[bridge] tx confirmed block=%s status=%s gasUsed=%s", block, status, gas_used)
                if status == 0:
                    raise RuntimeError(f"[bridge] tx reverted on-chain: {tx_hash}")
                return {
                    "tx_hash": tx_hash,
                    "status": "confirmed",
                    "block": block,
                    "gas_used": gas_used,
                }
        except RuntimeError:
            raise
        except Exception as exc:
            logger.warning("[bridge] receipt poll error: %s", exc)

        await asyncio.sleep(POLL_INTERVAL_S)

    raise TimeoutError(f"[bridge] tx not confirmed within {CONFIRMATION_TIMEOUT_S}s: {tx_hash}")
