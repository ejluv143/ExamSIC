#!/bin/sh
# Runs inside the sandbox. /work (read-only) holds the source file and tests/<n>.in.
# Compiles if needed, runs the program on each test with a time limit, and prints:
#   @@COMPILE <base64 errors>           when compiling fails (then stops), or for each test:
#   @@TEST <n> <exit code>
#   @@OUT <base64 stdout>   @@ERR <base64 stderr>
LANGUAGE="$1"
LIMIT="${2:-2}"
cd /tmp || exit 1
mkdir -p /tmp/build

emit() { printf '@@%s ' "$1"; head -c "$3" "$2" 2>/dev/null | base64 | tr -d '\n'; echo; }
compile() { timeout -s KILL 30 "$@" 2>/tmp/compile.txt || { emit COMPILE /tmp/compile.txt 8000; exit 0; }; }

case "$LANGUAGE" in
  python) RUN="python3 -I -B /work/main.py" ;;
  javascript) RUN="node --max-old-space-size=200 /judge/prelude.js /work/main.js" ;;
  c) compile gcc -O2 -std=c17 -o /tmp/build/prog /work/main.c -lm; RUN=/tmp/build/prog ;;
  cpp) compile g++ -O2 -std=c++17 -o /tmp/build/prog /work/main.cpp; RUN=/tmp/build/prog ;;
  # With tables (/work/database.sql), PHP answers get Laravel's DB facade and Eloquent on a fresh SQLite copy.
  php)
    if [ -f /work/database.sql ]; then
      RUN="php -d display_errors=stderr -d memory_limit=256M -d auto_prepend_file=/judge/laravel.php /work/main.php"
    else
      RUN="php -d display_errors=stderr -d memory_limit=256M /work/main.php"
    fi ;;
  java) compile javac -J-Xmx256m -d /tmp/build /work/Main.java; RUN="java -Xmx200m -Xss64m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -cp /tmp/build Main" ;;
  *) echo "@@COMPILE $(printf 'Unknown language' | base64)"; exit 0 ;;
esac

for f in /work/tests/*.in; do
  [ -e "$f" ] || continue
  n=$(basename "$f" .in)
  # Each test starts from the original tables, whatever the last one changed.
  if [ -f /work/database.sql ]; then
    rm -f /tmp/db.sqlite
    timeout -s KILL 10 php /judge/seed.php /work/database.sql /tmp/db.sqlite 2>/tmp/seed.txt || { emit COMPILE /tmp/seed.txt 8000; exit 0; }
  fi
  # SIGKILL on timeout: exit code 137. Output lands in /tmp (a small tmpfs), so endless printing can't fill the disk.
  timeout -s KILL "$LIMIT" $RUN <"$f" >/tmp/out 2>/tmp/err
  code=$?
  # Anything the program left running (forked children) dies before the next test. This script is
  # PID 1, which kill -1 skips.
  kill -9 -1 2>/dev/null
  echo "@@TEST $n $code"
  emit OUT /tmp/out 65536
  emit ERR /tmp/err 4000
done
