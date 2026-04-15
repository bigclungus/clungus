import { Database } from "bun:sqlite";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { ConnectError, Code } from "@connectrpc/connect";
import type { HandlerContext, ServiceImpl } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { PersonaService } from "../../gen/persona/v1/persona_pb.js";
import {
  PersonaSchema,
  ListPersonasResponseSchema,
  GetPersonaResponseSchema,
  CreatePersonaResponseSchema,
  UpdatePersonaResponseSchema,
  DeletePersonaResponseSchema,
  PostVerdictResponseSchema,
} from "../../gen/persona/v1/persona_pb.js";
import type {
  Persona,
  ListPersonasRequest,
  ListPersonasResponse,
  GetPersonaRequest,
  GetPersonaResponse,
  CreatePersonaRequest,
  CreatePersonaResponse,
  UpdatePersonaRequest,
  UpdatePersonaResponse,
  DeletePersonaRequest,
  DeletePersonaResponse,
  PostVerdictRequest,
  PostVerdictResponse,
} from "../../gen/persona/v1/persona_pb.js";
import { requireAuth } from "./service-auth.js";

const PERSONAS_DB = "/mnt/data/hello-world/personas.db";
const AGENTS_DIR = "/home/clungus/work/bigclungus-meta/agents";

function openDb(): Database {
  return new Database(PERSONAS_DB);
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!content.startsWith("---")) return { meta, body: content };
  const end = content.indexOf("---", 3);
  if (end === -1) return { meta, body: content };
  const frontmatter = content.slice(3, end);
  const body = content.slice(end + 3).trim();
  for (const line of frontmatter.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) meta[key] = val;
  }
  return { meta, body };
}

function buildFrontmatter(fields: Record<string, string | boolean | null | undefined>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== "") {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function rowToPersona(row: Record<string, unknown>, prompt = ""): Persona {
  return create(PersonaSchema, {
    name: String(row.name ?? ""),
    displayName: String(row.display_name ?? ""),
    model: String(row.model ?? ""),
    role: String(row.role ?? ""),
    title: String(row.title ?? ""),
    sex: String(row.sex ?? ""),
    congress: Boolean(row.congress),
    evolves: Boolean(row.evolves),
    avatarUrl: String(row.avatar_url ?? ""),
    status: String(row.status ?? "eligible"),
    prompt,
    lastVerdict: String(row.last_verdict ?? ""),
    lastVerdictDate: String(row.last_verdict_date ?? ""),
    mdPath: String(row.md_path ?? ""),
    specialSeat: Number(row.special_seat ?? 0),
    stakeholderOnly: Number(row.stakeholder_only ?? 0),
    timesEvolved: Number(row.times_evolved ?? 0),
    timesRetired: Number(row.times_retired ?? row.times_fired ?? 0),
    timesReinstated: Number(row.times_reinstated ?? 0),
    totalCongresses: Number(row.total_congresses ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  });
}

function readPromptSync(name: string): string {
  const filePath = `${AGENTS_DIR}/${name}.md`;
  try {
    const content = readFileSync(filePath, "utf8");
    const { body } = parseFrontmatter(content);
    return body;
  } catch (e) {
    console.warn(`[persona] readPromptSync: failed to read ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}


export const personaServiceImpl: ServiceImpl<typeof PersonaService> = {
  async listPersonas(_req: ListPersonasRequest, ctx: HandlerContext): Promise<ListPersonasResponse> {
    requireAuth(ctx);
    const db = openDb();
    try {
      const rows = db.query("SELECT * FROM personas ORDER BY name").all() as Record<string, unknown>[];
      const personas = rows.map((r) => rowToPersona(r));
      return create(ListPersonasResponseSchema, { personas });
    } finally {
      db.close();
    }
  },

  async getPersona(req: GetPersonaRequest, ctx: HandlerContext): Promise<GetPersonaResponse> {
    requireAuth(ctx);
    const db = openDb();
    try {
      const row = db.query("SELECT * FROM personas WHERE name = ?").get(req.name) as Record<string, unknown> | null;
      if (!row) throw new ConnectError(`Persona '${req.name}' not found`, Code.NotFound);
      const prompt = readPromptSync(req.name);
      return create(GetPersonaResponseSchema, { persona: rowToPersona(row, prompt) });
    } finally {
      db.close();
    }
  },

  async createPersona(req: CreatePersonaRequest, ctx: HandlerContext): Promise<CreatePersonaResponse> {
    requireAuth(ctx);
    const now = new Date().toISOString();
    const mdPath = `${AGENTS_DIR}/${req.name}.md`;

    // Write .md file
    const frontmatter = buildFrontmatter({
      display_name: req.displayName || req.name,
      model: req.model || "claude",
      role: req.role,
      title: req.title,
      sex: req.sex,
      congress: req.congress,
      evolves: req.evolves,
      avatar_url: req.avatarUrl,
    });
    writeFileSync(mdPath, `${frontmatter}\n\n${req.prompt ?? ""}`);

    const db = openDb();
    try {
      db.run(
        `INSERT INTO personas
          (name, display_name, model, role, title, sex, congress, evolves,
           special_seat, stakeholder_only, status, md_path, avatar_url,
           prompt_hash, total_congresses, times_evolved, times_retired,
           times_reinstated, last_verdict, last_verdict_date, updated_at)
         VALUES (?,?,?,?,?,?,?,?,0,0,'eligible',?,?,NULL,0,0,0,0,NULL,NULL,?)`,
        [
          req.name,
          req.displayName || req.name,
          req.model || "claude",
          req.role ?? "",
          req.title || null,
          req.sex || null,
          req.congress ? 1 : 0,
          req.evolves ? 1 : 0,
          mdPath,
          req.avatarUrl || null,
          now,
        ]
      );
      const row = db.query("SELECT * FROM personas WHERE name = ?").get(req.name) as Record<string, unknown>;
      return create(CreatePersonaResponseSchema, { persona: rowToPersona(row, req.prompt ?? "") });
    } finally {
      db.close();
    }
  },

  async updatePersona(req: UpdatePersonaRequest, ctx: HandlerContext): Promise<UpdatePersonaResponse> {
    requireAuth(ctx);
    const db = openDb();
    try {
      const row = db.query("SELECT * FROM personas WHERE name = ?").get(req.name) as Record<string, unknown> | null;
      if (!row) throw new ConnectError(`Persona '${req.name}' not found`, Code.NotFound);

      const now = new Date().toISOString();
      const oldStatus = String(row.status ?? "eligible");
      const newStatus = req.status !== undefined ? req.status : oldStatus;

      db.run(
        `UPDATE personas SET
          display_name = COALESCE(?, display_name),
          model = COALESCE(?, model),
          role = COALESCE(?, role),
          title = COALESCE(?, title),
          sex = COALESCE(?, sex),
          congress = COALESCE(?, congress),
          evolves = COALESCE(?, evolves),
          avatar_url = COALESCE(?, avatar_url),
          status = ?,
          updated_at = ?
         WHERE name = ?`,
        [
          req.displayName !== undefined ? req.displayName : null,
          req.model !== undefined ? req.model : null,
          req.role !== undefined ? req.role : null,
          req.title !== undefined ? req.title : null,
          req.sex !== undefined ? req.sex : null,
          req.congress !== undefined ? (req.congress ? 1 : 0) : null,
          req.evolves !== undefined ? (req.evolves ? 1 : 0) : null,
          req.avatarUrl !== undefined ? req.avatarUrl : null,
          newStatus,
          now,
          req.name,
        ]
      );

      // Handle prompt or status update — rewrite .md file in place (no file moves)
      if (req.prompt !== undefined || req.status !== undefined) {
        const mdPath = `${AGENTS_DIR}/${req.name}.md`;

        let existingContent = "";
        try {
          existingContent = readFileSync(mdPath, "utf8");
        } catch {
          // no existing file
        }
        const { meta, body } = parseFrontmatter(existingContent);
        const updatedPrompt = req.prompt !== undefined ? req.prompt : body;

        // Sync status field into frontmatter
        if (req.status !== undefined) {
          meta["status"] = newStatus;
        }

        const frontmatter = buildFrontmatter(meta as Record<string, string>);
        writeFileSync(mdPath, `${frontmatter}\n\n${updatedPrompt}`);
      }

      const updated = db.query("SELECT * FROM personas WHERE name = ?").get(req.name) as Record<string, unknown>;
      const prompt = readPromptSync(req.name);
      return create(UpdatePersonaResponseSchema, { persona: rowToPersona(updated, prompt) });
    } finally {
      db.close();
    }
  },

  async deletePersona(req: DeletePersonaRequest, ctx: HandlerContext): Promise<DeletePersonaResponse> {
    requireAuth(ctx);
    const db = openDb();
    try {
      const row = db.query("SELECT * FROM personas WHERE name = ?").get(req.name) as Record<string, unknown> | null;
      if (!row) throw new ConnectError(`Persona '${req.name}' not found`, Code.NotFound);

      db.run("DELETE FROM personas WHERE name = ?", [req.name]);

      // Delete .md file if it exists
      const mdPath = `${AGENTS_DIR}/${req.name}.md`;
      if (existsSync(mdPath)) {
        unlinkSync(mdPath);
      }

      return create(DeletePersonaResponseSchema, { ok: true, deleted: req.name });
    } finally {
      db.close();
    }
  },

  async postVerdict(req: PostVerdictRequest, ctx: HandlerContext): Promise<PostVerdictResponse> {
    requireAuth(ctx);
    const verdict = (req.verdict ?? "").toUpperCase();
    if (!["RETIRE", "FIRE", "EVOLVE", "RETAIN"].includes(verdict)) {
      throw new ConnectError("Invalid verdict — must be RETIRE, EVOLVE, or RETAIN", Code.InvalidArgument);
    }
    // Normalize legacy FIRE -> RETIRE
    const effectiveVerdict = verdict === "FIRE" ? "RETIRE" : verdict;
    const dateStr = req.date || new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const db = openDb();
    try {
      const row = db.query("SELECT * FROM personas WHERE name = ?").get(req.name) as Record<string, unknown> | null;
      if (!row) throw new ConnectError(`Persona '${req.name}' not found`, Code.NotFound);

      if (effectiveVerdict === "RETIRE") {
        db.run(
          `UPDATE personas SET last_verdict=?, last_verdict_date=?, times_retired=times_retired+1,
            status='meme', updated_at=? WHERE name=?`,
          [effectiveVerdict, dateStr, now, req.name]
        );
        // Update status field in frontmatter to meme using a safe regex
        // substitution — avoids the lossy parseFrontmatter/buildFrontmatter
        // round-trip that would destroy multi-line YAML fields (traits, values, etc.)
        const mdPath = `${AGENTS_DIR}/${req.name}.md`;
        if (existsSync(mdPath)) {
          try {
            const content = readFileSync(mdPath, "utf8");
            const updated = content.replace(/^status:\s*\S+\s*$/m, "status: meme");
            writeFileSync(mdPath, updated);
          } catch {
            // non-fatal — DB is already updated
          }
        }
      } else if (effectiveVerdict === "EVOLVE") {
        db.run(
          `UPDATE personas SET last_verdict=?, last_verdict_date=?, times_evolved=times_evolved+1,
            updated_at=? WHERE name=?`,
          [effectiveVerdict, dateStr, now, req.name]
        );
      } else {
        db.run(
          `UPDATE personas SET last_verdict=?, last_verdict_date=?, updated_at=? WHERE name=?`,
          [effectiveVerdict, dateStr, now, req.name]
        );
      }

      return create(PostVerdictResponseSchema, { ok: true });
    } finally {
      db.close();
    }
  },
};
