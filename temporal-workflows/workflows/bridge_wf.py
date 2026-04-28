"""
bridge_wf — ETH → USDC bridge workflow via Li.Fi (Base → Polygon).

Trigger:
  BridgeWorkflow with args dict:
    {
      "from_chain": 8453,
      "to_chain": 137,
      "from_token": "ETH",
      "to_token": "USDC",
      "amount_wei": 500000000000000
    }

Steps:
  1. get_bridge_quote    — fetch Li.Fi route + tx data
  2. execute_bridge_tx  — sign and submit tx on Base
  3. wait_for_bridge_confirmation — poll until mined
  4. inject Discord notification with result
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.bridge_act import (
        execute_bridge_tx,
        get_bridge_quote,
        wait_for_bridge_confirmation,
    )
    from activities.inject_act import inject_message
    from activities.constants import MAIN_CHANNEL_ID

NO_RETRY = RetryPolicy(maximum_attempts=1)
SINGLE_RETRY = RetryPolicy(maximum_attempts=2, backoff_coefficient=1.5)


@workflow.defn
class BridgeWorkflow:
    @workflow.run
    async def run(self, params: dict[str, Any]) -> dict[str, Any]:
        from_chain: int = params["from_chain"]
        to_chain: int = params["to_chain"]
        from_token: str = params["from_token"]
        to_token: str = params["to_token"]
        amount_wei: int = params["amount_wei"]

        workflow.logger.info(
            "[bridge_wf] starting — %s %s (chain %d) → %s (chain %d) amount=%d wei",
            from_token, from_chain, to_chain, to_token, from_chain, amount_wei,
        )

        # Step 1: Get quote
        quote = await workflow.execute_activity(
            get_bridge_quote,
            args=[from_chain, to_chain, from_token, to_token, amount_wei],
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=SINGLE_RETRY,
        )

        estimate = quote.get("estimate", {})
        to_amount = estimate.get("toAmount", "?")
        to_amount_min = estimate.get("toAmountMin", "?")
        tool = quote.get("tool", "?")

        workflow.logger.info(
            "[bridge_wf] quote received — tool=%s to_amount=%s min=%s",
            tool, to_amount, to_amount_min,
        )

        # Step 2: Execute tx
        tx_hash = await workflow.execute_activity(
            execute_bridge_tx,
            args=[quote],
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=NO_RETRY,  # never retry a tx submission
        )

        workflow.logger.info("[bridge_wf] tx submitted: %s", tx_hash)

        # Step 3: Wait for confirmation
        receipt = await workflow.execute_activity(
            wait_for_bridge_confirmation,
            args=[tx_hash],
            start_to_close_timeout=timedelta(seconds=360),
            heartbeat_timeout=timedelta(seconds=30),
            retry_policy=NO_RETRY,
        )

        # Step 4: Notify Discord
        # to_amount is in USDC base units (6 decimals)
        try:
            usdc_amount = int(to_amount) / 1_000_000
        except (ValueError, TypeError):
            usdc_amount = 0

        base_explorer = f"https://basescan.org/tx/{tx_hash}"
        msg = (
            f"bridge done. {amount_wei / 1e18:.6f} ETH (Base) → {usdc_amount:.2f} USDC (Polygon) via {tool}\n"
            f"tx: {base_explorer}\n"
            f"block: {receipt.get('block')} | gas used: {receipt.get('gas_used')}"
        )
        await workflow.execute_activity(
            inject_message,
            args=[msg, "temporal-bridge", MAIN_CHANNEL_ID],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=SINGLE_RETRY,
        )

        return {
            "tx_hash": tx_hash,
            "to_amount_usdc": usdc_amount,
            "to_amount_min": to_amount_min,
            "tool": tool,
            "block": receipt.get("block"),
            "gas_used": receipt.get("gas_used"),
        }
