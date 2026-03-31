/**
 * post-merge-review.ts
 *
 * Triggered on GitHub push events to a repo's default branch.
 * Fetches the diff, runs it through Claude for correctness/security review,
 * posts a commit comment on GitHub, and pings Discord if HIGH severity findings exist.
 *
 * Congress #87 / GitHub issue #72
 */

import * as childProcess from "node:child_process";
import { injectDiscord } from "../utils/inject.js";

const REVIEW_MODEL = "claude-sonnet-4-6";
const CLAUDE_CLI = "/home/clungus/.local/bin/claude";

async function fetchCommitDiff(repo: string, sha: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.diff",
    "User-Agent": "BigClungus",
  };
  if (token) headers["Authorization"] = `token ${token}`;

  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`GitHub commits API returned ${resp.status} for ${repo}@${sha}`);
  }
  const diff = await resp.text();
  // Truncate very large diffs — huge diffs overwhelm context and are noise
  const MAX_DIFF_CHARS = 80_000;
  if (diff.length > MAX_DIFF_CHARS) {
    return diff.slice(0, MAX_DIFF_CHARS) + `\n\n[diff truncated at ${MAX_DIFF_CHARS.toLocaleString()} characters]`;
  }
  return diff;
}

async function postCommitComment(repo: string, sha: string, body: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "BigClungus",
  };
  if (token) headers["Authorization"] = `token ${token}`;

  const url = `https://api.github.com/repos/${repo}/commits/${sha}/comments`;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!resp.ok) {
    throw new Error(`GitHub commit comment API returned ${resp.status} for ${repo}@${sha}: ${await resp.text()}`);
  }
}

async function callClaudeForReview(prompt: string, diff: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "text", "--model", REVIEW_MODEL];
    const proc = childProcess.spawn(CLAUDE_CLI, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let fullText = "";
    let stderr = "";

    // Timeout for review — large diffs can be slow
    const killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`[post-merge-review] claude CLI timed out after 180s`));
    }, 180_000);

    proc.stdout.on("data", (chunk: Buffer) => { fullText += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdin.write(diff);
    proc.stdin.end();
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(fullText.trim());
      }
    });
    proc.on("error", (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

function buildReviewPrompt(): string {
  return `Review this git diff for correctness regressions and security vulnerabilities only.
Do NOT comment on style, test coverage, or code organization.

For each finding, specify:
- Severity: HIGH (security vulnerability, data loss, broken integration) or LOW (logic error, edge case, minor regression)
- File and line range
- What the issue is and why it matters

If no issues found, respond with "LGTM — no correctness or security issues found."

Diff:`;
}

function hasHighSeverity(reviewText: string): boolean {
  // Match common HIGH severity indicators Claude might produce
  const patterns = [
    /severity:\s*high/i,
    /\bhigh\s+severity\b/i,
    /\*\*high\*\*/i,
    /\[high\]/i,
    /severity.*:\s*high/i,
  ]
  const matched = patterns.some(p => p.test(reviewText))
  if (!matched && reviewText.length > 100 && reviewText !== 'LGTM') {
    // Log when we couldn't determine severity from a non-trivial review
    console.warn('[post-merge-review] could not detect severity level from review output')
  }
  return matched
}

export interface PushReviewParams {
  repo: string;          // "owner/name"
  sha: string;           // head commit SHA
  ref: string;           // e.g. "refs/heads/main"
  pusher: string;        // GitHub username
  defaultBranch: string; // repo's default branch name
}

let activeReviews = 0
const MAX_CONCURRENT_REVIEWS = 2

export async function runPostMergeReview(params: PushReviewParams): Promise<void> {
  if (activeReviews >= MAX_CONCURRENT_REVIEWS) {
    console.warn(`[post-merge-review] skipping review for ${params.repo} — ${activeReviews} reviews already in progress`)
    return
  }
  activeReviews++
  try {
    await _runPostMergeReviewInner(params)
  } finally {
    activeReviews--
  }
}

async function _runPostMergeReviewInner(params: PushReviewParams): Promise<void> {
  const { repo, sha, ref, pusher, defaultBranch } = params;

  const expectedRef = `refs/heads/${defaultBranch}`;
  if (ref !== expectedRef) {
    console.log(`[post-merge-review] skipping ${repo}: ref=${ref} is not default branch (${expectedRef})`);
    return;
  }

  console.log(`[post-merge-review] starting review for ${repo}@${sha} (pushed by ${pusher})`);

  let diff: string;
  try {
    diff = await fetchCommitDiff(repo, sha);
  } catch (e) {
    console.error(`[post-merge-review] failed to fetch diff for ${repo}@${sha}:`, e);
    throw e;
  }

  if (!diff.trim()) {
    console.log(`[post-merge-review] empty diff for ${repo}@${sha}, skipping review`);
    return;
  }

  let review: string;
  try {
    const prompt = buildReviewPrompt();
    review = await callClaudeForReview(prompt, diff);
  } catch (e) {
    console.error(`[post-merge-review] Claude review failed for ${repo}@${sha}:`, e);
    throw e;
  }

  const commentBody = `## Post-Merge Code Review (BigClungus / Congress #87)

> Checks: correctness regressions and security vulnerabilities only. Not style, tests, or organization.

${review}

---
*Model: ${REVIEW_MODEL} | [Scope](https://github.com/bigclungus/bigclungus-meta/issues/72)*`;

  try {
    await postCommitComment(repo, sha, commentBody);
    console.log(`[post-merge-review] posted commit comment on ${repo}@${sha}`);
  } catch (e) {
    console.error(`[post-merge-review] failed to post commit comment on ${repo}@${sha}:`, e);
    throw e;
  }

  if (hasHighSeverity(review)) {
    const shortSha = sha.slice(0, 8);
    const commitUrl = `https://github.com/${repo}/commit/${sha}`;
    const discordMsg = `🚨 **Post-merge review: HIGH severity finding**\n**Repo:** \`${repo}\`\n**Commit:** [\`${shortSha}\`](${commitUrl}) by ${pusher}\n\nSee commit comment for details.`;
    try {
      await injectDiscord(discordMsg, undefined, "post-merge-review");
      console.log(`[post-merge-review] Discord HIGH severity ping sent for ${repo}@${sha}`);
    } catch (e) {
      console.error(`[post-merge-review] failed to send Discord ping for ${repo}@${sha}:`, e);
      throw e;
    }
  }

  console.log(`[post-merge-review] review complete for ${repo}@${sha}`);
}
