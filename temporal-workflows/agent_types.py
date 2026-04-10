"""
Shared types for the AgentTask tracking system.
"""

from dataclasses import dataclass


@dataclass
class AgentTaskInput:
    task_id: str
    agent_id: str = ""
    description: str = ""
    provider: str = "claude"
    model: str = ""
    prompt: str = ""
    api_key: str = ""
