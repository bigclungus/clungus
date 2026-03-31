"""
Temporal workflow: CongressWorkflow (legacy alias)

This module re-exports CongressWorkflow from the unified session_wf module.
All logic now lives in SessionWorkflow; CongressWorkflow is a thin wrapper
that sets flavor="congress" (or "meme" based on mode) and delegates.

Kept for backward compatibility — existing trigger code fires 'CongressWorkflow'
by string name via Temporal.
"""
from workflows.session_wf import CongressWorkflow  # noqa: F401
