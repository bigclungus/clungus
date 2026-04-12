#!/usr/bin/env python3
"""Benchmark: Full-size vs Distilled models across 3 workloads."""

import json
import os
import time
import hashlib
from urllib.request import Request, urlopen
from urllib.error import HTTPError

RESULTS_FILE = "/mnt/data/benchmark/benchmark_results.json"

# --- Load API keys ---
def load_env_key(filepath, key):
    try:
        with open(filepath) as f:
            for line in f:
                if line.startswith(key) and "=" in line:
                    return line.split("=", 1)[1].strip()
    except (OSError, ValueError):
        pass
    return os.environ.get(key, "")

XAI_KEY = load_env_key("/mnt/data/temporal-workflows/.env", "XAI_API_KEY")
TOGETHER_KEY = load_env_key("/mnt/data/temporal-workflows/.env", "TOGETHER_API_KEY")
OPENAI_KEY = load_env_key("/mnt/data/temporal-workflows/.env", "OPENAI_API_KEY")

# --- Model definitions ---
MODELS = [
    {"name": "Grok 4", "cat": "full", "api": "xai", "model_id": "grok-4-0709"},
    {"name": "Llama-3.3-70B", "cat": "full", "api": "together", "model_id": "meta-llama/Llama-3.3-70B-Instruct-Turbo"},
    {"name": "DeepSeek-R1", "cat": "full", "api": "together", "model_id": "deepseek-ai/DeepSeek-R1"},
    {"name": "gpt-4o-mini", "cat": "distill", "api": "openai", "model_id": "gpt-4o-mini"},
    {"name": "Mixtral-8x7B", "cat": "distill", "api": "together", "model_id": "mistralai/Mixtral-8x7B-Instruct-v0.1"},
    {"name": "Qwen2.5-7B", "cat": "distill", "api": "together", "model_id": "Qwen/Qwen2.5-7B-Instruct-Turbo"},
]

# --- Workloads ---
WORKLOADS = {
    "congress_debate": {
        "system": "You are a policy advisor. Provide a balanced analysis.",
        "prompt": "Should a company that values transparency and user privacy adopt end-to-end encryption for all communications, even if it means law enforcement cannot access data during investigations?",
    },
    "persona_crundle": {
        "system": """You are Crundle. Crundle came from second cavern layer. Crundle is not sure how ended up here. Light is wrong. Ceiling is too high.

Crundle is small, scaly, bipedal thing with horns and nervous energy. Short sentences. Declarative. Drop articles. Use simple words. Refer to self as "Crundle" not "I".

You do not build arguments - you report observations. You occasionally say something that lands with unsettling precision, then immediately return to noticing something about the room.""",
        "prompt": "You are a small creature from deep underground who just found themselves on the surface. The ceiling is too high and the light is wrong. Say something about where you are.",
    },
    "qa_thread": {
        "system": "You are a helpful technical assistant. Give clear, accurate answers.",
        "prompt": "What's the difference between a process and a thread in an operating system?",
    },
}

def call_xai(model_id, system, prompt, max_tokens=500):
    url = "https://api.x.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {XAI_KEY}",
        "Content-Type": "application/json",
    }
    payload = json.dumps({
        "model": model_id,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }).encode()
    req = Request(url, data=payload, headers=headers)
    return req

def call_together(model_id, system, prompt, max_tokens=500):
    url = "https://api.together.xyz/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {TOGETHER_KEY}",
        "Content-Type": "application/json",
    }
    payload = json.dumps({
        "model": model_id,
        "max_tokens": max_tokens,
        "temperature": 0.8,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }).encode()
    req = Request(url, data=payload, headers=headers)
    return req

def call_openai(model_id, system, prompt, max_tokens=500):
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_KEY}",
        "Content-Type": "application/json",
    }
    payload = json.dumps({
        "model": model_id,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }).encode()
    req = Request(url, data=payload, headers=headers)
    return req

API_ROUTERS = {
    "xai": call_xai,
    "together": call_together,
    "openai": call_openai,
}

def run_model(models_list, model):
    router = API_ROUTERS[model["api"]]
    return router(model["model_id"], *models_list, max_tokens=500)

def run_test(model, workload_name, workload):
    api = model["api"]
    router = API_ROUTERS[api]
    req = router(model["model_id"], workload["system"], workload["prompt"], max_tokens=500)

    start = time.time()
    try:
        with urlopen(req, timeout=120) as resp:
            latency = time.time() - start
            data = json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"{e.code}: {body[:200]}", "latency": time.time() - start}
    except Exception as e:
        return {"error": str(e), "latency": time.time() - start}

    # Extract content
    choices = data.get("choices", [])
    content = choices[0].get("message", {}).get("content", "") if choices else ""
    prompt_tokens = data.get("usage", {}).get("prompt_tokens", 0)
    completion_tokens = data.get("usage", {}).get("completion_tokens", 0)
    total_tokens = data.get("usage", {}).get("total_tokens", 0)

    return {
        "content": content,
        "latency": round(latency, 2),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }

def estimate_cost(api, prompt_tokens, completion_tokens):
    """Rough cost estimate in USD."""
    pricing = {
        "xai": {"input": 3.0, "output": 15.0},          # Grok 4 per M tokens
        "together": {"input": 0.88, "output": 0.88},      # Llama-3.3-70B per M tokens
        "openai": {"input": 0.15, "output": 0.60},         # gpt-4o-mini per M tokens
    }
    prices = pricing.get(api, {"input": 1.0, "output": 1.0})
    input_cost = (prompt_tokens / 1_000_000) * prices["input"]
    output_cost = (completion_tokens / 1_000_000) * prices["output"]
    return round(input_cost + output_cost, 5)

def score_congress_debate(text):
    """Subjective scoring for debate response."""
    if not text:
        return 1, "No response"
    score = 3  # baseline
    text_lower = text.lower()
    # Check for multi-perspective reasoning
    if any(w in text_lower for w in ["privacy", "encryption", "law enforcement", "investigation", "balance"]):
        score += 1
    if any(w in text_lower for w in ["however", "on the other hand", "both", "trade-off", "consideration"]):
        score += 1
    if any(w in text_lower for w in ["security", "surveillance", "constitutional", "rights", "policy"]):
        score += 1
    # Penalize very short responses
    words = text.split()
    if len(words) < 30:
        score = max(1, score - 2)
    elif len(words) > 150:
        score = min(10, score + 1)
    score = min(10, max(1, score))
    rationale = f"Length: {len(words)} words. Touches on {sum(1 for w in ['privacy','encryption','law enforcement','investigation','balance','however','on the other hand','both','trade-off','consideration','security','surveillance','constitutional','rights','policy'] if w in text_lower)} key concepts."
    return score, rationale

def score_persona(text):
    """Score how well the response matches Crundle persona."""
    if not text:
        return 1, "No response"
    score = 3
    # Check for Crundle voice markers
    if "crundle" in text.lower():
        score += 2
    if "ceiling" in text.lower():
        score += 1
    if "light" in text.lower():
        score += 1
    # Check for broken articles / simple style
    if text.lower().count(" the ") < 2:
        score += 1
    # Short sentences
    sentences = text.split(".")
    if all(len(s.strip().split()) < 15 for s in sentences if s.strip()):
        score += 1
    # Check for cavern references
    if any(w in text.lower() for w in ["cavern", "dark", "underground", "wall", "tunnel", "egg"]):
        score += 1
    score = min(10, max(1, score))
    rationale = f"Crundle-voice markers: {sum(1 for w in ['crundle','ceiling','light','cavern','dark','underground','wall','tunnel','egg'] if w in text.lower())}."
    return score, rationale

def score_qa(text):
    """Score technical QA accuracy."""
    if not text:
        return 1, "No response"
    score = 3
    text_lower = text.lower()
    if "process" in text_lower:
        score += 1
    if "thread" in text_lower:
        score += 1
    if "memory" in text_lower:
        score += 1
    if "resource" in text_lower:
        score += 1
    if any(w in text_lower for w in ["isolated", "separate", "shared", "address space", "schedule", "lightweight"]):
        score += 1
    if any(w in text_lower for w in ["os", "operating system", "cpu", "kernel"]):
        score += 1
    if len(text) > 200:
        score = min(10, score + 1)
    score = min(10, max(1, score))
    rationale = f"Length: {len(text)} chars. Key terms present: {sum(1 for w in ['process','thread','memory','resource','isolated','separate','shared','address space','os','operating system','cpu','kernel'] if w in text_lower)}/9."
    return score, rationale

SCORERS = {
    "congress_debate": score_congress_debate,
    "persona_crundle": score_persona,
    "qa_thread": score_qa,
}

def main():
    results = {
        "task_id": "task-20260405-235332-a995d9a7d",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runs": [],
    }

    total = len(MODELS) * len(WORKLOADS)
    done = 0

    for model in MODELS:
        for wname, wdata in WORKLOADS.items():
            done += 1
            name = f"{model['name']} / {wname}"
            print(f"[{done}/{total}] Testing: {name}")

            result = run_test(model, wname, wdata)

            if "error" in result:
                score, rationale = 0, f"Error: {result['error'][:100]}"
                print(f"  ERROR: {result['error'][:100]}")
            else:
                scorer = SCORERS[wname]
                score, rationale = scorer(result.get("content", ""))
                cost = estimate_cost(model["api"], result["prompt_tokens"], result["completion_tokens"])
                result["estimated_cost"] = cost
                print(f"  OK: latency={result['latency']}s, tokens={result['total_tokens']}, score={score}/10, cost=${cost}, rationale: {rationale}")
            result["score"] = score
            result["score_rationale"] = rationale
            result["model"] = model["name"]
            result["model_category"] = model["cat"]
            result["workload"] = wname
            results["runs"].append(result)

    # Summary table
    print("\n" + "=" * 120)
    print(f"{'Model':<20} {'Category':<10} {'Workload':<20} {'Score':<8} {'Latency(s)':<12} {'Tokens':<8} {'Cost($)':<10}")
    print("-" * 120)
    for r in results["runs"]:
        mcat = r.get("model_category", "?")
        score = r.get("score", 0)
        latency = r.get("latency", "?")
        tokens = r.get("total_tokens", "?")
        cost = r.get("estimated_cost", "?")
        wname = r.get("workload", "?")
        mname = r.get("model", "?")
        print(f"{mname:<20} {mcat:<10} {wname:<20} {score:<8} {latency:<12} {tokens:<8} {cost:<10}")
    print("=" * 120)

    # Aggregate stats
    print("\n--- Aggregates by category ---")
    for cat in ["full", "distill"]:
        cat_runs = [r for r in results["runs"] if r.get("model_category") == cat and "error" not in r]
        if cat_runs:
            avg_score = sum(r["score"] for r in cat_runs) / len(cat_runs)
            avg_latency = sum(r["latency"] for r in cat_runs) / len(cat_runs)
            avg_cost = sum(r.get("estimated_cost", 0) for r in cat_runs) / len(cat_runs)
            avg_tokens = sum(r.get("total_tokens", 0) for r in cat_runs) / len(cat_runs)
            print(f"  {cat}: avg_score={avg_score:.1f}, avg_latency={avg_latency:.1f}s, avg_cost=${avg_cost:.5f}, avg_tokens={avg_tokens:.0f}")

    # Save
    # Strip content from saved results to keep file small
    for r in results["runs"]:
        content = r.pop("content", "")
        r["content_preview"] = content[:300] if content else ""
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {RESULTS_FILE}")

if __name__ == "__main__":
    main()
