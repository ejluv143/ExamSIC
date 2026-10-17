#!/bin/sh
# Runs inside the sandbox. /work (read-only) holds the source file (and database.sql for PHP questions with tables);
# the test inputs come on stdin, one base64 line per test, in order.
# Compiles if needed, runs the program on each test with a time limit, and prints:
#   @@COMPILE <base64 errors>           when compiling fails (then stops), or for each test:
#   @@TEST <n> <exit code>
#   @@OUT <base64 stdout>   @@ERR <base64 stderr>
LANGUAGE="$1"
LIMIT="${2:-2}"
# Seconds to re-create the tables before each test (PHP questions with tables).
SEED_LIMIT="${3:-10}"
cd /tmp || exit 1
# Students' code (compiling and running) drops to this uid:gid with su-exec, so it runs as a different user than
# this script, which stays root as PID 1. The result channel is this script's stdout; a different, unprivileged
# user cannot reopen our stdout through /proc or signal us, so it can't forge or hide @@ result lines (issue #18).
STUDENT="65534:65534"
# What this script writes stays its own; the program gets what it needs through open file descriptors.
umask 077

# The inputs go to a folder only this script can read. Each test's program gets its own input on stdin and can't list
# or read the others, hidden ones included (issue #19).
mkdir /tmp/tests
TESTS=0
while IFS= read -r line; do
  printf '%s' "$line" | base64 -d >"/tmp/tests/$TESTS.in" || exit 1
  TESTS=$((TESTS + 1))
done
exec </dev/null

# /tmp itself (the tmpfs, mode 0755) isn't writable by students' code: the compiler gets /tmp/build and each test a
# fresh /tmp/run, and nothing else there survives from one test to the next.
mkdir /tmp/build && chmod 0777 /tmp/build
export HOME=/tmp/build TMPDIR=/tmp/build

emit() { printf '@@%s ' "$1"; head -c "$3" "$2" 2>/dev/null | base64 | tr -d '\n'; echo; }
# umask 022: the build must be readable for the copy into /tmp/bin below.
compile() { (umask 022; timeout -s KILL 30 su-exec "$STUDENT" "$@") 2>/tmp/compile.txt || { emit COMPILE /tmp/compile.txt 8000; exit 0; }; }

case "$LANGUAGE" in
  python) RUN="python3 -I -B /work/main.py" ;;
  javascript) RUN="node --max-old-space-size=200 /judge/prelude.js /work/main.js" ;;
  c) compile gcc -O2 -std=c17 -o /tmp/build/prog /work/main.c -lm; RUN=/tmp/bin/prog ;;
  cpp) compile g++ -O2 -std=c++17 -o /tmp/build/prog /work/main.cpp; RUN=/tmp/bin/prog ;;
  # With tables (/work/database.sql), PHP answers get Laravel's DB facade and Eloquent on a fresh SQLite copy.
  php)
    if [ -f /work/database.sql ]; then
      RUN="php -d display_errors=stderr -d memory_limit=256M -d auto_prepend_file=/judge/laravel.php /work/main.php"
    else
      RUN="php -d display_errors=stderr -d memory_limit=256M /work/main.php"
    fi ;;
  # -XX:-UsePerfData: the JVM would otherwise want /tmp/hsperfdata_<user>.
  java) compile javac -J-Xmx256m -J-XX:-UsePerfData -d /tmp/build /work/Main.java; RUN="java -Xmx200m -Xss64m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:-UsePerfData -cp /tmp/bin Main" ;;
  *) echo "@@COMPILE $(printf 'Unknown language' | base64)"; exit 0 ;;
esac

# The program runs from a root-owned copy of the build that it can't change: a file of its own there could carry
# state from one test to the next.
mkdir /tmp/bin && cp -R /tmp/build/. /tmp/bin/ 2>/tmp/compile.txt && chmod -R a+rX /tmp/bin && chmod 0 /tmp/build ||
  { emit COMPILE /tmp/compile.txt 8000; exit 0; }
export HOME=/tmp/run TMPDIR=/tmp/run

n=0
while [ "$n" -lt "$TESTS" ]; do
  # A fresh, empty folder for this test: the program's working directory, HOME and TMPDIR.
  mkdir /tmp/run && chmod 0777 /tmp/run && cd /tmp/run || exit 1
  # Each test starts from the original tables, whatever the last one changed.
  if [ -f /work/database.sql ]; then
    timeout -s KILL "$SEED_LIMIT" su-exec "$STUDENT" php /judge/seed.php /work/database.sql /tmp/run/db.sqlite 2>/tmp/seed.txt || { emit COMPILE /tmp/seed.txt 8000; exit 0; }
  fi
  # SIGKILL on timeout: exit code 137. Output lands in /tmp (a small tmpfs), so endless printing can't fill the disk.
  timeout -s KILL "$LIMIT" su-exec "$STUDENT" $RUN <"/tmp/tests/$n.in" >/tmp/out 2>/tmp/err
  code=$?
  # Anything the program left running (forked children) dies before the next test. This script is
  # PID 1, which kill -1 skips.
  kill -9 -1 2>/dev/null
  echo "@@TEST $n $code"
  emit OUT /tmp/out 65536
  emit ERR /tmp/err 4000
  # Clear what the program left, as its user (who owns all of it). Anything that won't go is locked away: the folder
  # is root's, so the next test can't get into it.
  cd /tmp
  su-exec "$STUDENT" sh -c 'chmod -R u+rwx /tmp/run/* /tmp/run/.[!.]* /tmp/run/..?*; rm -rf /tmp/run/* /tmp/run/.[!.]* /tmp/run/..?*' 2>/dev/null
  rmdir /tmp/run 2>/dev/null || { chmod 0 /tmp/run && mv /tmp/run "/tmp/left-$n"; }
  n=$((n + 1))
done
