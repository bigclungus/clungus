"""
Temporal workflow: TrialWorkflow (legacy alias)

This module re-exports TrialWorkflow from the unified session_wf module.
All logic now lives in SessionWorkflow; TrialWorkflow is a thin wrapper
that sets flavor="trial" and delegates.

Kept for backward compatibility — existing trigger code fires 'TrialWorkflow'
by string name via Temporal.
"""
from workflows.session_wf import TrialWorkflow  # noqa: F401
