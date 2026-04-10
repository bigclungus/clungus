#!/usr/bin/env python3
"""Launch Claude CLI, auto-dismiss dev-channel prompt, transparent pty proxy."""
import pty, os, sys, time, select, fcntl, termios, signal

AGENTS_DB = "/mnt/data/data/agents.db"

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
args = [
    cmd,
    "--debug",
    "--dangerously-skip-permissions",
    "--dangerously-load-development-channels", "server:omni",
    "--model", "sonnet",
    "--resume", "38879609-c8bd-47f5-af26-6210d2de543c"
]

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
    except OSError:
        pass  # stdin may not be a tty (e.g. piped); ioctl failure is expected

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
