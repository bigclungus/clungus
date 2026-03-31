#!/usr/bin/env python3
"""Launch Claude CLI, auto-dismiss dev-channel prompt, transparent pty proxy."""
import pty, os, sys, time, select, struct, fcntl, termios, signal

#cmd = "/home/clungus/.local/bin/claude"
cmd = "/home/clungus/.local/share/claude/versions/2.1.87"
args = [
    cmd,
    "--debug",
    "--dangerously-skip-permissions",
#    "--dangerously-load-development-channels", "plugin:discord-clungus@inline",
    "--dangerously-load-development-channels", "server:omni",
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

        # After 15s, send Enter to dismiss the prompt, then initial message
        if not entered and time.time() - start > 15:
            os.write(fd, b"\r")
            time.sleep(5)
            os.write(fd, b"you have awoken\r")
            entered = True

finally:
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, old_attrs)
    os.waitpid(pid, 0)
