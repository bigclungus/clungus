---
name: invoke-persona
description: Invoke a named persona from the bigclungus-meta agents directory and get their response
---

Invoke a named persona and get their response to a prompt.

## Usage

/invoke-persona <persona-name> <question or prompt>

## What to do

1. Look for the persona file at:
   - `/home/clungus/work/bigclungus-meta/agents/active/<persona-name>.md`
   - `/home/clungus/work/bigclungus-meta/agents/fired/<persona-name>.md`

2. If not found, list available personas from both directories and tell the user.

3. Parse the persona file:
   - Strip the YAML frontmatter (everything between the first and second `---` delimiters)
   - The system prompt is everything after the second `---`
   - Note the `display_name` and whether they're active or in `fired/` (severance)

4. Run the persona via Claude CLI:
   ```bash
   echo "<question>" | claude -p "<system_prompt>" --output-format text
   ```

5. Format the response:
   - If active: `**<display_name>**:\n\n<response>`
   - If in severance: `**<display_name>** (from severance):\n\n<response>`

6. If responding via Discord (this is a Discord bot session), post the response via the Discord reply tool. Otherwise output it directly.

## Available personas (as of 2026-03-26)
- `critic` → Pippi the Pitiless (active)
- `architect` → Kwame the Constructor (ineligible — fired 2026-03-25)
- `ux` → Yuki the Yielding (active)
- `chairman` → Ibrahim the Immovable (moderator)
- `spengler` → Spengler the Doomed (active)
- See `/home/clungus/work/bigclungus-meta/agents/` for full roster
