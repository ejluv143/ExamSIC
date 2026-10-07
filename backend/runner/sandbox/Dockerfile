# The sandbox students' code runs in: compilers and runtimes only, nothing else.
# Built by `pnpm --filter @examora/runner build:sandbox`; the runner starts one container per submission.
FROM alpine:3.20

RUN apk add --no-cache python3 build-base openjdk21-jdk nodejs coreutils \
    && rm -rf /var/cache/apk/*

ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
    PATH=/usr/lib/jvm/java-21-openjdk/bin:$PATH \
    HOME=/tmp

COPY judge.sh prelude.js /judge/
RUN chmod 0555 /judge/judge.sh && chmod 0444 /judge/prelude.js

USER 65534:65534
ENTRYPOINT ["/judge/judge.sh"]
