#!/usr/bin/env python3
"""Launch Claude CLI, auto-dismiss dev-channel prompt, transparent pty proxy."""
import pty, os, sys, time, select, struct, fcntl, termios, signal

AGENTS_DB = "/mnt/data/data/agents.db"

def _record_agent_spawn(session_id: str) -> None:
    """Insert a row into agents.db for this session. Non-fatal on any error."""
    try:
        import sqlite3
        conn = sqlite3.connect(AGENTS_DB)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id              TEXT PRIMARY KEY,
                task_id         TEXT,
                session_id      TEXT,
                started_at      INTEGER,
                completed_at    INTEGER,
                status          TEXT DEFAULT 'in_progress',
                input_tokens    INTEGER DEFAULT 0,
                output_tokens   INTEGER DEFAULT 0,
                cost_usd        REAL DEFAULT 0.0,
                model           TEXT,
                output_file     TEXT
            )
            """
        )
        started_at = int(time.time())
        conn.execute(
            """
            INSERT OR IGNORE INTO agents (id, started_at, status)
            VALUES (?, ?, 'in_progress')
            """,
            (session_id, started_at),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[launch-claude] Warning: could not record spawn in agents.db: {e}", file=sys.stderr)

# Mark any previously in_progress agents as stale (bot restart = they're dead)
try:
    import sqlite3 as _sqlite3
    _db = _sqlite3.connect(AGENTS_DB)
    _db.execute("UPDATE agents SET status='stale' WHERE status='in_progress'")
    _db.commit()
    _db.close()
except Exception as _e:
    print(f"[launch-claude] Warning: could not mark stale agents: {_e}", file=sys.stderr)

cmd = "/home/clungus/.local/bin/claude"
#cmd = "/home/clungus/.local/share/claude/versions/2.1.87"
args = [
    cmd,
    "--debug",
    "--dangerously-skip-permissions",
#    "--dangerously-load-development-channels", "plugin:discord-clungus@inline",
    "--dangerously-load-development-channels", "server:omni",
#    "--model", "qwen/qwen3.6-plus:free",
#    "--model", "minimax/minimax-m2.7",
    "--model", "sonnet",
    "--resume", "38879609-c8bd-47f5-af26-6210d2de543c"
]

# Extract session ID from --resume arg (the value after "--resume")
_session_id = None
for _i, _a in enumerate(args):
    if _a == "--resume" and _i + 1 < len(args):
        _session_id = args[_i + 1]
        break
if _session_id:
    _record_agent_spawn(_session_id)

pid, fd = pty.fork()

if pid == 0:
    # Child: exec claude
    os.execvp(cmd, args)
    sys.exit(1)

# Parent: transparent proxy between terminal and claude's pty

# Forward window size
def set_winsize():
    try:
        ws = fcntl.ioctl(sys.stdin.fileno(), termios.TIOCGWINSZ, b'\x00' * 8)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, ws)
    except Exception:
        pass

set_winsize()
signal.signal(signal.SIGWINCH, lambda *_: set_winsize())

# Put our stdin in raw mode so keypresses pass through
old_attrs = termios.tcgetattr(sys.stdin.fileno())
try:
    raw = termios.tcgetattr(sys.stdin.fileno())
    raw[0] = 0  # iflag
    raw[1] = 0  # oflag
    raw[3] = 0  # lflag
    raw[6][termios.VMIN] = 1
    raw[6][termios.VTIME] = 0
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, raw)

    entered = False
    start = time.time()
    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    while True:
        try:
            r, _, _ = select.select([fd, stdin_fd], [], [], 0.5)
        except (select.error, InterruptedError):
            continue

        if fd in r:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(stdout_fd, data)

        if stdin_fd in r:
            try:
                data = os.read(stdin_fd, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(fd, data)

        # After 5s, send Enter to dismiss the prompt, then initial message
        if not entered and time.time() - start > 5:
            os.write(fd, b"\r")
            time.sleep(5)
            os.write(fd, b"you have awoken\r")
            entered = True

finally:
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, old_attrs)
    os.waitpid(pid, 0)
