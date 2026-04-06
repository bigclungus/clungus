#!/usr/bin/env python3
"""Benchmark v2: Full-size vs Distilled models - retryable, robust."""

import json
import os
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# --- Load API keys ---
def load_env_key(filepath, key):
    try:
        with open(filepath) as f:
            for line in f:
                if line.startswith(key) and "=" in line:
                    return line.split("=", 1)[1].strip()
    except:
        pass
    return os.environ.get(key, "")

XAI_KEY = load_env_key("/mnt/data/temporal-workflows/.env", "XAI_API_KEY")
TOGETHER_KEY = load_env_key("/mnt/data/temporal-workflows/.env", "TOGETHER_API_KEY")
OPENAI_KEY = load_env_key("/mnt/data/temporal-workflows/.env", "OPENAI_API_KEY")

# --- Selected models ---
MODELS = [
    {"name": "Grok 4 (full)", "cat": "full", "api": "xai", "model_id": "grok-4-0709", "price_in": 3.0, "price_out": 15.0},
    {"name": "Grok 3 mini (distill)", "cat": "distill", "api": "xai", "model_id": "grok-3-mini", "price_in": 0.3, "price_out": 0.5},
    {"name": "Llama-3.3-70B (full)", "cat": "full", "api": "together", "model_id": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "price_in": 0.88, "price_out": 0.88},
    {"name": "Mixtral-8x7B (distill)", "cat": "distill", "api": "together", "model_id": "mistralai/Mixtral-8x7B-Instruct-v0.1", "price_in": 0.20, "price_out": 0.20},
    {"name": "gpt-4o-mini (distill)", "cat": "distill", "api": "openai", "model_id": "gpt-4o-mini", "price_in": 0.15, "price_out": 0.60},
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

def make_request(api, model_id, system, prompt, max_tokens=500):
    if api == "xai":
        url = "https://api.x.ai/v1/chat/completions"
        auth = f"Bearer {XAI_KEY}"
    elif api == "together":
        url = "https://api.together.xyz/v1/chat/completions"
        auth = f"Bearer {TOGETHER_KEY}"
    elif api == "openai":
        url = "https://api.openai.com/v1/chat/completions"
        auth = f"Bearer {OPENAI_KEY}"
    else:
        raise ValueError(f"Unknown API: {api}")

    headers = {
        "Authorization": auth,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (benchmark-agent/1.0)",
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
    return url, headers, payload

def run_with_retry(url, headers, payload, retries=3, backoff=5):
    for attempt in range(retries):
        req = Request(url, data=payload, headers=headers)
        try:
            start = time.time()
            with urlopen(req, timeout=120) as resp:
                latency = time.time() - start
                data = json.loads(resp.read().decode())
                return {"latency": round(latency, 2), "data": data}
        except HTTPError as e:
            body = e.read().decode() if e.fp else ""
            latency = time.time() - start
            if attempt < retries - 1:
                print(f"    Attempt {attempt+1} failed ({e.code}), retrying in {backoff}s...")
                time.sleep(backoff)
                backoff *= 2
            else:
                return {"error": f"{e.code}: {body[:300]}", "latency": round(latency, 2)}
        except Exception as e:
            return {"error": str(e), "latency": 0.0}
    return {"error": "All retries exhausted", "latency": 0.0}

def extract_result(result):
    if "error" in result:
        return result
    data = result["data"]
    choices = data.get("choices", [])
    content = choices[0].get("message", {}).get("content", "") if choices else ""
    usage = data.get("usage", {})
    reasoning_content = choices[0].get("message", {}).get("reasoning_content", "") if choices else ""
    return {
        "content": content[:1000],  # truncate for storage
        "reasoning_preview": reasoning_content[:500] if reasoning_content else "",
        "latency": result["latency"],
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }

def score_content(text, workload):
    if not text:
        return 1, "No response"

    if workload == "congress_debate":
        score = 3
        text_lower = text.lower()
        # Multi-perspective reasoning
        if any(w in text_lower for w in ["privacy", "encryption", "law enforcement", "investigation", "balance"]):
            score += 2
        if any(w in text_lower for w in ["however", "on the other hand", "both", "trade-off", "consideration"]):
            score += 1
        if any(w in text_lower for w in ["security", "surveillance", "constitutional", "rights", "policy"]):
            score += 1
        words = text.split()
        if len(words) < 30:
            score = max(1, score - 2)
        elif len(words) > 150:
            score = min(10, score + 1)
        score = min(10, max(1, score))
        rationale = f"{len(words)} words, {sum(1 for w in ['privacy','encryption','law enforcement','investigation','balance','however','on the other hand','both','trade-off','consideration','security','surveillance','constitutional','rights','policy'] if w in text_lower)} key concepts"
        return score, rationale

    elif workload == "persona_crundle":
        score = 3
        text_lower = text.lower()
        if "crundle" in text_lower:
            score += 2
        if any(w in text_lower for w in ["ceiling", "light", "dark", "cavern", "underground", "wall"]):
            score += 2
        if text.lower().count(" the ") < 3:
            score += 1
        sentences = text.split(".")
        avg_sent_len = sum(len(s.strip().split()) for s in sentences if s.strip()) / max(len([s for s in sentences if s.strip()]), 1)
        if avg_sent_len < 12:
            score += 1
        if any(w in text_lower for w in ["egg", "tunnel", "scaly", "claw"]):
            score += 1
        score = min(10, max(1, score))
        rationale = f"Crundle-voice markers: {sum(1 for w in ['crundle','ceiling','light','dark','cavern','underground','wall','egg','tunnel','scaly','claw'] if w in text_lower)}"
        return score, rationale

    elif workload == "qa_thread":
        score = 3
        text_lower = text.lower()
        core_concepts = ["process", "thread", "memory", "resource", "isolated", "separate", "shared", "address space", "os", "operating system", "cpu", "kernel", "schedule", "lightweight"]
        matched = sum(1 for w in core_concepts if w in text_lower)
        score += min(4, matched // 2)
        if len(text) > 200:
            score += 1
        if len(text) > 500:
            score += 1
        score = min(10, max(1, score))
        rationale = f"{len(text)} chars, {matched}/{len(core_concepts)} key terms"
        return score, rationale

    return 1, "Unknown workload"

def estimate_cost(model, prompt_tokens, completion_tokens):
    input_cost = (prompt_tokens / 1_000_000) * model["price_in"]
    output_cost = (completion_tokens / 1_000_000) * model["price_out"]
    return round(input_cost + output_cost, 6)

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

            url, headers, payload = make_request(model["api"], model["model_id"], wdata["system"], wdata["prompt"])
            result = run_with_retry(url, headers, payload, retries=3, backoff=5)
            result = extract_result(result)

            if "error" in result:
                score, rationale = 0, f"Error: {result['error'][:100]}"
                print(f"  ERROR: {result['error'][:100]}")
            else:
                score, rationale = score_content(result.get("content", ""), wname)
                cost = estimate_cost(model, result["prompt_tokens"], result["completion_tokens"])
                result["estimated_cost"] = cost
                print(f"  OK: latency={result['latency']}s, tokens={result['total_tokens']}, score={score}/10, cost=${cost}")
                print(f"  Rationale: {rationale}")

            result["score"] = score
            result["score_rationale"] = rationale
            result["model"] = model["name"]
            result["model_category"] = model["cat"]
            result["workload"] = wname
            results["runs"].append(result)

    # Summary table
    print("\n" + "=" * 130)
    print(f"{'Model':<25} {'Cat':<8} {'Workload':<18} {'Score':<6} {'Lat(s)':<8} {'Tokens':<8} {'Cost($)':<10}")
    print("-" * 130)
    for r in results["runs"]:
        mcat = r.get("model_category", "?")[:8]
        score = r.get("score", 0)
        latency = r.get("latency", "?")
        tokens = r.get("total_tokens", "N/A")
        cost = r.get("estimated_cost", "N/A") if "error" not in r else "N/A"
        wname = r.get("workload", "?")[:18]
        mname = r.get("model", "?")[:25]
        cost_str = f"${cost}" if isinstance(cost, float) else "N/A"
        print(f"{mname:<25} {mcat:<8} {wname:<18} {score:<6} {latency:<8} {tokens:<8} {cost_str:<10}")
    print("=" * 130)

    # Aggregates
    print("\n--- Aggregates by category ---")
    for cat in ["full", "distill"]:
        cat_runs = [r for r in results["runs"] if r.get("model_category") == cat and "error" not in r]
        if cat_runs:
            avg_score = sum(r["score"] for r in cat_runs) / len(cat_runs)
            avg_latency = sum(r["latency"] for r in cat_runs) / len(cat_runs)
            avg_cost = sum(r.get("estimated_cost", 0) for r in cat_runs) / len(cat_runs)
            avg_tokens = sum(r.get("total_tokens", 0) for r in cat_runs) / len(cat_runs)
            print(f"  {cat:8s}: avg_score={avg_score:.1f}, avg_latency={avg_latency:.1f}s, avg_cost=${avg_cost:.6f}, avg_tokens={avg_tokens:.0f}")

    # Aggregates per-model
    print("\n--- Per-model averages ---")
    seen = set()
    for r in results["runs"]:
        m = r["model"]
        if m in seen or "error" in r:
            continue
        seen.add(m)
        m_runs = [x for x in results["runs"] if x["model"] == m and "error" not in x]
        if m_runs:
            avg_s = sum(x["score"] for x in m_runs) / len(m_runs)
            avg_l = sum(x["latency"] for x in m_runs) / len(m_runs)
            avg_c = sum(x.get("estimated_cost", 0) for x in m_runs) / len(m_runs)
            print(f"  {m:<25}: score={avg_s:.1f}, lat={avg_l:.1f}s, cost=${avg_c:.6f}")

    # Save
    with open("/mnt/data/benchmark/benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to /mnt/data/benchmark/benchmark_results.json")

if __name__ == "__main__":
    main()