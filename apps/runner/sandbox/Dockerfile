# The sandbox students' code runs in: compilers and runtimes only, nothing else.
# Built by `pnpm --filter @examora/runner build:sandbox`; the runner starts one container per submission.
FROM alpine:3.20

RUN apk add --no-cache python3 build-base openjdk21-jdk nodejs coreutils \
        php83 php83-pdo_sqlite php83-sqlite3 php83-mbstring php83-ctype php83-tokenizer \
        php83-dom php83-xml php83-xmlwriter php83-fileinfo php83-phar php83-openssl php83-iconv composer \
    && rm -rf /var/cache/apk/*

# Laravel's database layer (query builder, Eloquent) for PHP questions that come with tables.
# Installed while building; students' code never has network access.
RUN mkdir -p /opt/laravel && cd /opt/laravel \
    && COMPOSER_HOME=/tmp/composer composer require --no-interaction --no-progress --prefer-dist \
        illuminate/database:^11.0 illuminate/events:^11.0 \
    && rm -rf /tmp/composer

ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk \
    PATH=/usr/lib/jvm/java-21-openjdk/bin:$PATH \
    HOME=/tmp

COPY judge.sh prelude.js laravel.php seed.php /judge/
RUN chmod 0555 /judge/judge.sh && chmod 0444 /judge/prelude.js /judge/laravel.php /judge/seed.php

USER 65534:65534
ENTRYPOINT ["/judge/judge.sh"]
