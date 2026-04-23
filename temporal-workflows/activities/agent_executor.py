"""
agent_executor.py — Activities for AgentTaskWorkflow execution paths.

run_xai_agent: used by the xAI path — calls the xAI API with a full
  agentic tool-use loop supporting read_file, write_file, list_dir, bash.
  Moved here from the now-deleted xai_agent_activity.py.
"""

import json
import subprocess
import shlex
from pathlib import Path
import httpx
from temporalio import activity

from .constants import XAI_API_URL
from .utils import get_xai_key
MAX_TOOL_ITERATIONS = 20

# Rough pricing per 1M tokens (input, output)
_PRICING: dict[str, tuple[float, float]] = {
    "grok-4.20-0309-reasoning": (3.00, 15.00),
    "grok-3-mini": (0.30, 0.50),
    "grok-3": (3.00, 15.00),
}

# Allowlisted bash commands (first token of command)
_BASH_ALLOWED = {"ls", "cat", "grep", "find", "head", "tail", "wc", "echo"}
# Blocklisted substrings in the full command string (belt-and-suspenders)
_BASH_BLOCKED_PATTERNS = ["rm ", "rm\t", "rm\n", "rmdir", "systemctl", "git push", "sudo", "curl", "wget"]


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    for key, (in_price, out_price) in _PRICING.items():
        if model.startswith(key):
            return round(
                (input_tokens / 1_000_000) * in_price
                + (output_tokens / 1_000_000) * out_price,
                8,
            )
    return 0.0


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _tool_read_file(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"ERROR: {e}"


def _tool_write_file(path: str, content: str) -> str:
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"OK: wrote {len(content)} bytes to {path}"
    except Exception as e:
        return f"ERROR: {e}"


def _tool_list_dir(path: str) -> str:
    try:
        entries = sorted(Path(path).iterdir(), key=lambda p: (p.is_file(), p.name))
        lines = []
        for entry in entries:
            kind = "FILE" if entry.is_file() else "DIR "
            lines.append(f"{kind}  {entry.name}")
        return "\n".join(lines) if lines else "(empty directory)"
    except Exception as e:
        return f"ERROR: {e}"


def _tool_bash(command: str) -> str:
    # Security: check first token
    try:
        tokens = shlex.split(command)
    except ValueError as e:
        return f"ERROR: could not parse command: {e}"

    if not tokens:
        return "ERROR: empty command"

    first = tokens[0]
    # Strip any path prefix (e.g. /bin/ls -> ls)
    first_base = Path(first).name

    if first_base not in _BASH_ALLOWED:
        return f"ERROR: command '{first_base}' not in allowlist ({', '.join(sorted(_BASH_ALLOWED))})"

    # Belt-and-suspenders: block dangerous patterns in full command string
    cmd_lower = command.lower()
    for pattern in _BASH_BLOCKED_PATTERNS:
        if pattern in cmd_lower:
            return f"ERROR: command contains blocked pattern '{pattern.strip()}'"

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout
        if result.stderr:
            output += f"\nSTDERR: {result.stderr}"
        if result.returncode != 0:
            output += f"\nEXIT CODE: {result.returncode}"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return "ERROR: command timed out after 30s"
    except Exception as e:
        return f"ERROR: {e}"


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling format)
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file at the given absolute path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file to read"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file at the given absolute path. Creates parent directories if needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to write"},
                    "content": {"type": "string", "description": "Full file content to write"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": "List the contents of a directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the directory"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "Run a shell command. Only the following commands are allowed: "
                "ls, cat, grep, find, head, tail, wc, echo. "
                "Blocked: rm, systemctl, git push, sudo, curl, wget."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"},
                },
                "required": ["command"],
            },
        },
    },
]


def _dispatch_tool(name: str, arguments: dict) -> str:
    """Route a tool call to the appropriate implementation."""
    if name == "read_file":
        return _tool_read_file(arguments.get("path", ""))
    elif name == "write_file":
        return _tool_write_file(arguments.get("path", ""), arguments.get("content", ""))
    elif name == "list_dir":
        return _tool_list_dir(arguments.get("path", ""))
    elif name == "bash":
        return _tool_bash(arguments.get("command", ""))
    else:
        return f"ERROR: unknown tool '{name}'"


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------

@activity.defn
async def run_xai_agent(
    prompt: str,
    model: str,
    api_key: str,
    task_id: str,
) -> dict:
    """
    Agentic tool-use loop against xAI chat completions API.

    If api_key is empty, resolved via get_xai_key() (env or .env file lookup).

    Supports tools: read_file, write_file, list_dir, bash (sandboxed).
    Loops up to MAX_TOOL_ITERATIONS times before forcing a final answer.

    Returns:
        {
            "status": "completed",
            "model": str,
            "response": str,
            "input_tokens": int,
            "output_tokens": int,
            "cost_usd": float,
            "tool_calls_made": int,
        }
    """
    # Resolve API key — prefer passed value, fall back to env/.env lookup
    if not api_key:
        api_key = get_xai_key()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    messages: list[dict] = [{"role": "user", "content": prompt}]
    total_input_tokens = 0
    total_output_tokens = 0
    tool_calls_made = 0
    final_response = ""

    activity.heartbeat({"task_id": task_id, "status": "starting_agentic_loop"})

    async with httpx.AsyncClient(timeout=120.0) as client:
        for iteration in range(MAX_TOOL_ITERATIONS):
            activity.heartbeat({
                "task_id": task_id,
                "status": "calling_xai_api",
                "iteration": iteration,
                "tool_calls_made": tool_calls_made,
            })

            # Token count guard: estimate tokens via chars/4 heuristic.
            # If estimated tokens exceed 120k (buffer below xAI 131k limit),
            # trim to messages[0] (initial prompt) + last 10 messages.
            estimated_tokens = len(json.dumps(messages)) // 4
            if estimated_tokens > 120_000:
                old_len = len(messages)
                messages = [messages[0]] + messages[-10:]
                activity.logger.warning(
                    "token guard triggered: ~%d estimated tokens, trimmed %d → %d messages",
                    estimated_tokens, old_len, len(messages),
                )

            payload: dict = {
                "model": model,
                "messages": messages,
                "tools": TOOLS,
                "tool_choice": "auto",
            }

            resp = await client.post(XAI_API_URL, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"xAI API error {resp.status_code}: {resp.text[:500]}"
                )
            data = resp.json()

            # Accumulate token usage
            usage = data.get("usage", {})
            total_input_tokens += usage.get("prompt_tokens", 0)
            total_output_tokens += usage.get("completion_tokens", 0)

            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError(f"xAI API returned no choices: {json.dumps(data)[:300]}")

            choice = choices[0]
            message = choice.get("message", {})

            # Append assistant message to conversation history
            messages.append(message)

            # Check if model wants to call tools
            tool_calls = message.get("tool_calls") or []

            if tool_calls:
                # Execute each tool call and append results
                for tc in tool_calls:
                    tc_id = tc.get("id", f"call_{tool_calls_made}")
                    tc_name = tc.get("function", {}).get("name", "")
                    tc_args_raw = tc.get("function", {}).get("arguments", "{}")

                    try:
                        tc_args = json.loads(tc_args_raw)
                    except json.JSONDecodeError as e:
                        activity.logger.warning("[agent_executor] bad tool args JSON for %s: %s — %s", tc_name, tc_args_raw[:100], e)
                        tc_args = {}

                    activity.heartbeat({
                        "task_id": task_id,
                        "status": "executing_tool",
                        "tool": tc_name,
                        "iteration": iteration,
                    })

                    tool_result = _dispatch_tool(tc_name, tc_args)
                    tool_calls_made += 1

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "content": tool_result,
                    })

                # Trim context if messages list is getting large
                if len(messages) > 30:
                    old_len = len(messages)
                    messages = [messages[0]] + messages[-24:]
                    activity.logger.warning(
                        "context trimmed: %d → %d messages", old_len, len(messages)
                    )

                # Continue loop — let model see tool results
                continue

            # No tool calls — this is the final text response
            final_response = message.get("content", "")
            break

        else:
            # Hit max iterations — get a final summary without tools
            activity.heartbeat({
                "task_id": task_id,
                "status": "max_iterations_reached",
                "tool_calls_made": tool_calls_made,
            })
            messages.append({
                "role": "user",
                "content": "You have reached the maximum number of tool call iterations. Please provide your final answer based on what you have done so far.",
            })
            payload = {
                "model": model,
                "messages": messages,
                # No tools — force a text response
            }
            resp = await client.post(XAI_API_URL, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                usage = data.get("usage", {})
                total_input_tokens += usage.get("prompt_tokens", 0)
                total_output_tokens += usage.get("completion_tokens", 0)
                choices = data.get("choices", [])
                if choices:
                    final_response = choices[0].get("message", {}).get("content", "")

    activity.heartbeat({"task_id": task_id, "status": "completed", "tool_calls_made": tool_calls_made})

    cost_usd = _estimate_cost(model, total_input_tokens, total_output_tokens)

    return {
        "status": "completed",
        "model": model,
        "response": final_response,
        "input_tokens": total_input_tokens,
        "output_tokens": total_output_tokens,
        "cost_usd": cost_usd,
        "tool_calls_made": tool_calls_made,
    }
