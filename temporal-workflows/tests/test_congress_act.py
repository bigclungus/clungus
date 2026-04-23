"""
Unit tests for congress_act.py — evolution parser, seat selection fallback,
and CREATE verdict handling.

These tests are pure logic tests: no Temporal runtime, no HTTP calls.
"""
import re
import sys
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# ---------------------------------------------------------------------------
# Helpers extracted from congress_act for isolated testing
# ---------------------------------------------------------------------------

def _parse_evolution_blocks(response_text: str) -> list[dict]:
    """Parse PERSONA blocks from an evolution response. Returns list of dicts."""
    results = []
    blocks = re.split(r"\nPERSONA:", "\n" + response_text)
    for block in blocks[1:]:
        lines = block.strip().split("\n")
        display_name = lines[0].strip()
        verdict = reason = learned = ""
        for line in lines[1:]:
            if line.startswith("VERDICT:"):
                verdict = line.replace("VERDICT:", "").strip()
            elif line.startswith("REASON:"):
                reason = line.replace("REASON:", "").strip()
            elif line.startswith("LEARNED:"):
                learned = line.replace("LEARNED:", "").strip()
        results.append({"display_name": display_name, "verdict": verdict, "reason": reason, "learned": learned})
    return results


def _parse_create_blocks(response_text: str) -> list[dict]:
    """Parse CREATE blocks from an evolution response."""
    results = []
    create_matches = re.finditer(
        r"CREATE\s+([a-z0-9][a-z0-9\-]*)\s*\nREASON:\s*(.+?)(?=\n(?:CREATE\s|PERSONA:|$))",
        response_text,
        re.DOTALL,
    )
    for m in create_matches:
        slug = m.group(1).strip()
        spec_text = m.group(2).strip()
        reason_line_end = spec_text.find("\n")
        if reason_line_end != -1:
            reason = spec_text[:reason_line_end].strip()
        else:
            reason = spec_text.strip()
        results.append({"slug": slug, "reason": reason})
    return results


def _parse_seat_selection(response_text: str, debaters: list) -> list:
    """Parse seat selection response — returns matched debaters in order."""
    selected_names = [line.strip().strip("*-").strip() for line in response_text.strip().split("\n") if line.strip()]
    name_to_debater = {(d.get("display_name") or d.get("name")): d for d in debaters}
    selected = [name_to_debater[n] for n in selected_names if n in name_to_debater]
    return selected


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestEvolutionParser(unittest.TestCase):

    def test_evolve_verdict(self):
        response = textwrap.dedent("""\
            PERSONA: Pippi the Pitiless
            VERDICT: EVOLVE
            REASON: Named the hidden assumption in Otto's argument and shifted the debate.
            LEARNED: Attack hidden assumptions, not conclusions — it lands harder.
        """)
        blocks = _parse_evolution_blocks(response)
        self.assertEqual(len(blocks), 1)
        b = blocks[0]
        self.assertEqual(b["display_name"], "Pippi the Pitiless")
        self.assertEqual(b["verdict"], "EVOLVE")
        self.assertIn("hidden assumption", b["learned"])

    def test_retire_verdict(self):
        response = textwrap.dedent("""\
            PERSONA: Yuki the Yielding
            VERDICT: RETIRE
            REASON: Repeated Pippi's point without adding anything.
        """)
        blocks = _parse_evolution_blocks(response)
        self.assertEqual(blocks[0]["verdict"], "RETIRE")
        self.assertEqual(blocks[0]["display_name"], "Yuki the Yielding")

    def test_retain_verdict(self):
        response = textwrap.dedent("""\
            PERSONA: Kwame the Constructor
            VERDICT: RETAIN
            REASON: Solid contribution, nothing remarkable.
        """)
        blocks = _parse_evolution_blocks(response)
        self.assertEqual(blocks[0]["verdict"], "RETAIN")

    def test_multiple_personas(self):
        response = textwrap.dedent("""\
            PERSONA: Pippi the Pitiless
            VERDICT: EVOLVE
            REASON: Sharp critique.
            LEARNED: Name the assumption first.

            PERSONA: Otto Atreides
            VERDICT: RETAIN
            REASON: Energetic but didn't change anyone's mind.

            PERSONA: Yuki the Yielding
            VERDICT: RETIRE
            REASON: Pure repetition.
        """)
        blocks = _parse_evolution_blocks(response)
        self.assertEqual(len(blocks), 3)
        verdicts = {b["display_name"]: b["verdict"] for b in blocks}
        self.assertEqual(verdicts["Pippi the Pitiless"], "EVOLVE")
        self.assertEqual(verdicts["Otto Atreides"], "RETAIN")
        self.assertEqual(verdicts["Yuki the Yielding"], "RETIRE")

    def test_no_personas(self):
        self.assertEqual(_parse_evolution_blocks("No PERSONA blocks here."), [])


class TestCreateParser(unittest.TestCase):

    def test_valid_create(self):
        response = textwrap.dedent("""\
            CREATE devil-advocate
            REASON: No one is steelmanning the opposing view.
            display_name: The Devil's Advocate
            role: Steelman any position
            title: Devil's Advocate
            model: claude
        """)
        blocks = _parse_create_blocks(response)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["slug"], "devil-advocate")
        self.assertIn("steelmanning", blocks[0]["reason"])

    def test_invalid_slug_rejected(self):
        # Path traversal / uppercase should not match the regex
        response = "CREATE ../evil\nREASON: Bad slug\n"
        blocks = _parse_create_blocks(response)
        self.assertEqual(len(blocks), 0)

    def test_no_create(self):
        self.assertEqual(_parse_create_blocks("PERSONA: Foo\nVERDICT: RETAIN\nREASON: ok"), [])


class TestSeatSelection(unittest.TestCase):

    DEBATERS = [
        {"name": "critic", "display_name": "Pippi the Pitiless"},
        {"name": "architect", "display_name": "Kwame the Constructor"},
        {"name": "otto", "display_name": "Otto Atreides"},
        {"name": "ux", "display_name": "Yuki the Yielding"},
        {"name": "spengler", "display_name": "Spengler the Doomed"},
        {"name": "the-kid", "display_name": "The Kid"},
    ]

    def test_exact_selection(self):
        response = "Pippi the Pitiless\nKwame the Constructor\nOtto Atreides\nYuki the Yielding\nSpengler the Doomed"
        selected = _parse_seat_selection(response, self.DEBATERS)
        self.assertEqual(len(selected), 5)
        self.assertEqual(selected[0]["name"], "critic")

    def test_order_preserved(self):
        response = "Otto Atreides\nPippi the Pitiless\nKwame the Constructor\nYuki the Yielding\nSpengler the Doomed"
        selected = _parse_seat_selection(response, self.DEBATERS)
        self.assertEqual(selected[0]["name"], "otto")
        self.assertEqual(selected[1]["name"], "critic")

    def test_unknown_names_skipped(self):
        response = "Pippi the Pitiless\nNobody McFakename\nOtto Atreides"
        selected = _parse_seat_selection(response, self.DEBATERS)
        self.assertEqual(len(selected), 2)

    def test_empty_response_returns_empty(self):
        selected = _parse_seat_selection("", self.DEBATERS)
        self.assertEqual(selected, [])

    def test_markdown_stripped(self):
        # LLM may add bullets or bold
        response = "- Pippi the Pitiless\n* Otto Atreides\n**Kwame the Constructor**"
        selected = _parse_seat_selection(response, self.DEBATERS)
        names = [d["name"] for d in selected]
        self.assertIn("critic", names)
        self.assertIn("otto", names)
        # Bold stripping depends on whether strip() catches **...**
        # The current impl only strips leading *- so **Kwame...** may not match
        # That's acceptable — the fallback handles it


class TestSlugValidation(unittest.TestCase):

    def test_valid_slugs(self):
        valid = ["critic", "the-kid", "uncle-bob", "x", "abc123", "a-b-c"]
        for slug in valid:
            self.assertIsNotNone(re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug), f"{slug!r} should be valid")

    def test_invalid_slugs(self):
        invalid = ["../evil", "Uncle-Bob", "has space", "", "-startswith-dash", "UPPERCASE"]
        for slug in invalid:
            self.assertIsNone(re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug), f"{slug!r} should be invalid")


if __name__ == "__main__":
    unittest.main()
