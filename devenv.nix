{ pkgs, lib, config, ... }:

let
  # BETTER_AUTH_SECRET signs login sessions. Generated once per machine and kept in
  # .devenv/state (gitignored), so no secret is committed.
  loadAuthSecret = ''
    secret_file="${config.devenv.state}/auth-secret"
    if [ ! -s "$secret_file" ]; then
      mkdir -p "$(dirname "$secret_file")"
      (umask 077 && ${lib.getExe pkgs.openssl} rand -base64 32 > "$secret_file")
    fi
    export BETTER_AUTH_SECRET="$(cat "$secret_file")"
  '';

  database = "examinus";

  # devenv may move Postgres off its configured port when that port is taken (PGPORT carries the port it
  # actually got), so the URL follows PGPORT instead of the configured number. A URL already in the environment
  # (e.g. Neon, see README "Database") wins over the local Postgres.
  loadDatabaseUrl = ''
    export DATABASE_URL="''${DATABASE_URL:-postgresql://127.0.0.1:$PGPORT/${database}}"
  '';

  # `initialDatabases` only runs when the data directory is first made, so a Postgres state from before the database
  # got its name (or that lost it) wouldn't have it. Only for the local Postgres.
  ensureLocalDatabase = ''
    if [ "$DATABASE_URL" = "postgresql://127.0.0.1:$PGPORT/${database}" ]; then
      ${config.services.postgres.package}/bin/psql -h 127.0.0.1 -p "$PGPORT" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname = '${database}'" | grep -q 1 \
        || ${config.services.postgres.package}/bin/createdb -h 127.0.0.1 -p "$PGPORT" ${database}
    fi
  '';

  # Development-only credentials for the local Garage bucket. Garage key ids are "GK" + 24 hex digits and secrets
  # 64 hex digits; fixed values keep the S3_* variables below static.
  s3 = {
    bucket = "examinus";
    keyName = "examinus";
    accessKeyId = "GK0e5a0a00e5a0a00e5a0a00e";
    secretAccessKey = "e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e";
  };

  # The API's Dragonfly (see `processes.dragonfly`); a REDIS_URL already in the environment wins.
  loadRedisUrl = ''
    export REDIS_URL="''${REDIS_URL:-redis://127.0.0.1:${toString dragonflyPort}}"
  '';

  # The machine's address on the local network, for using the app from a phone on the same Wi-Fi: the web app at
  # http://$DEV_LAN_IP:3000. Browsers there reach the API's WebSocket (PUBLIC_API_URL) and the Garage bucket
  # (S3_PUBLIC_ENDPOINT) directly, and the API must accept that origin (LIVE_ALLOWED_ORIGINS: the live WebSocket
  # and Better Auth's origin check). DEV_LAN_IP already in the environment wins (several interfaces, VPN); without
  # a network the app still works at localhost.
  loadLanAddress = ''
    if [ -z "''${DEV_LAN_IP:-}" ]; then
      ${if pkgs.stdenv.hostPlatform.isLinux
        then ''DEV_LAN_IP="$(${pkgs.iproute2}/bin/ip -4 route get 1.1.1.1 2>/dev/null | ${pkgs.gawk}/bin/awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }')"''
        else ''DEV_LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"''}
    fi
    export DEV_LAN_IP="''${DEV_LAN_IP:-127.0.0.1}"
    export PUBLIC_API_URL="http://$DEV_LAN_IP:3001"
    export S3_PUBLIC_ENDPOINT="http://$DEV_LAN_IP:3910"
    export LIVE_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://$DEV_LAN_IP:3000"
  '';

  # Dragonfly (Redis protocol): the API's cache and event channels. nixpkgs only builds it from source (its BSL
  # licence keeps it out of the binary cache, which means an hour-long compile), so this uses the official release
  # binary. Releases exist for Linux only; on macOS run `docker compose up dragonfly` and set REDIS_URL.
  dragonflyPort = 6390;
  dragonflyVersion = "1.39.0";
  dragonfly = pkgs.stdenv.mkDerivation {
    pname = "dragonfly-bin";
    version = dragonflyVersion;
    src = pkgs.fetchurl (
      {
        x86_64-linux = {
          url = "https://github.com/dragonflydb/dragonfly/releases/download/v${dragonflyVersion}/dragonfly-x86_64.tar.gz";
          hash = "sha256-gfiM/QCWxVDkFacAyX61v2Btsd9hBswDWE6Hj9eqEmo=";
        };
        aarch64-linux = {
          url = "https://github.com/dragonflydb/dragonfly/releases/download/v${dragonflyVersion}/dragonfly-aarch64.tar.gz";
          hash = "sha256-UqFOiM2L2dCGo6R5S4y05g7+jixh+02eo/FBvNJ5guM=";
        };
      }.${pkgs.stdenv.hostPlatform.system}
    );
    sourceRoot = ".";
    nativeBuildInputs = [ pkgs.autoPatchelfHook ];
    buildInputs = [ pkgs.zlib pkgs.stdenv.cc.cc.lib ];
    installPhase = ''
      install -Dm755 dragonfly-* $out/bin/dragonfly
    '';
  };

  # Grafana with Prometheus, Tempo and Loki (grafana/otel-lgtm, the same image as docker compose's `otel-lgtm`), with
  # the Examinus dashboards and alerts. Runs in Docker: there is no Nix package of the bundle. Grafana on
  # http://127.0.0.1:3300 (admin / admin); OTLP on 4317 (gRPC) and 4318 (HTTP).
  lgtmImage = "grafana/otel-lgtm:0.36.0";
  lgtmContainer = "examinus-devenv-otel-lgtm";
  grafanaPort = 3300;
  otlpHttpPort = 4318;
  provisioning = "/otel-lgtm/grafana/conf/provisioning";

  # The API and the web app send traces, metrics and logs to it; an endpoint already in the environment wins.
  loadOtel = ''
    export OTEL_EXPORTER_OTLP_ENDPOINT="''${OTEL_EXPORTER_OTLP_ENDPOINT:-http://127.0.0.1:${toString otlpHttpPort}}"
    export OTEL_RESOURCE_ATTRIBUTES="''${OTEL_RESOURCE_ATTRIBUTES:-deployment.environment=dev}"
  '';
in
{
  # Node 22 (with npm) for the web app and drizzle-kit.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
  };
  # Bun runs the API (apps/rpc).
  packages = [ pkgs.bun ];

  # Postgres for `apps/rpc` (Drizzle). Data lives in `.devenv/state/postgres`.
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_18;
    listen_addresses = "127.0.0.1";
    port = 5434;
    initialDatabases = [ { name = database; } ];
  };
  # DATABASE_URL: see loadDatabaseUrl (enterShell and the api process).
  # The API (apps/rpc) listens here; the web app calls it and forwards /api/auth/* to it.
  env.PORT = "3001";
  env.API_URL = "http://127.0.0.1:3001";
  # Better Auth's public URL is the web app's: browsers never talk to the API directly.
  env.BETTER_AUTH_URL = "http://localhost:3000";
  # The web app and the API listen on every interface, so a phone on the same network can open the app at the
  # machine's address (see loadLanAddress for the URLs this needs). Postgres and Dragonfly stay on loopback.
  env.HOST = "0.0.0.0";

  # S3-compatible storage for question images and students' drawings (apps/rpc, see README): Garage, with data in
  # .devenv/state/garage. On start it creates the bucket, imports the key above with read and write on it, and
  # sets CORS so the browser can POST uploads straight to it and read signed images. The S3 API is on 3910 (or the
  # next free port), clear of Garage's default 3900 used by other projects.
  services.garage = {
    enable = true;
    # On every interface: browsers upload to and read from the bucket directly (see loadLanAddress).
    s3Address = "0.0.0.0:3910";
    adminAddress = "127.0.0.1:3913";
    buckets = [ s3.bucket ];
    afterStart = ''
      # By id, not name: Garage never reuses a key id, so a key imported under another name (it was "examora")
      # can't be imported again.
      if ! $GARAGE key info ${s3.accessKeyId} &>/dev/null; then
        $GARAGE key import --yes -n ${s3.keyName} ${s3.accessKeyId} ${s3.secretAccessKey}
      fi
      $GARAGE bucket allow --read --write --owner ${s3.bucket} --key ${s3.accessKeyId}
      # Garage's CLI can't set CORS; the S3 API can. Any origin is fine for a local development bucket.
      AWS_ACCESS_KEY_ID=${s3.accessKeyId} AWS_SECRET_ACCESS_KEY=${s3.secretAccessKey} \
        ${lib.getExe pkgs.awscli2} s3api put-bucket-cors \
          --endpoint-url ${config.env.S3_ENDPOINT} --region ${config.services.garage.region} \
          --bucket ${s3.bucket} \
          --cors-configuration '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD","POST","PUT"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]}'
      echo "Garage bucket '${s3.bucket}' is ready for key '${s3.keyName}'."
    '';
  };
  # The module starts Garage's internal RPC port at 3901, which another project's Garage may hold; keep it beside ours.
  processes.garage.ports.rpc.allocate = lib.mkForce 3911;
  env.S3_BUCKET = s3.bucket;
  env.S3_REGION = config.services.garage.region;
  env.S3_ENDPOINT = "http://127.0.0.1:3910";
  env.S3_ACCESS_KEY_ID = s3.accessKeyId;
  env.S3_SECRET_ACCESS_KEY = s3.secretAccessKey;

  # The API's cache and event channels (see README "Cache (Dragonfly)"). Nothing in it needs to survive a restart, so
  # no snapshots. A REDIS_URL already in the environment wins (e.g. Dragonfly from docker compose on macOS).
  processes.dragonfly = lib.mkIf pkgs.stdenv.hostPlatform.isLinux {
    exec = "${dragonfly}/bin/dragonfly --bind 127.0.0.1 --port ${toString dragonflyPort} --dbfilename= --proactor_threads 2 --logtostderr";
    ready.exec = "${lib.getExe pkgs.redis} -p ${toString dragonflyPort} ping";
  };

  enterShell = loadAuthSecret + loadDatabaseUrl + loadRedisUrl + loadLanAddress + loadOtel;

  processes.grafana = {
    exec = ''
      if ! ${pkgs.docker-client}/bin/docker info >/dev/null 2>&1; then
        echo "Grafana needs Docker, which isn't running. Start Docker, then restart this process." >&2
        exit 1
      fi
      # A container left from an earlier run that didn't stop cleanly.
      ${pkgs.docker-client}/bin/docker rm -f ${lgtmContainer} >/dev/null 2>&1 || true
      root=${config.devenv.root}/observability/grafana
      # --rm and the signal proxy stop and remove the container when devenv stops this process.
      exec ${pkgs.docker-client}/bin/docker run --rm --name ${lgtmContainer} \
        -p 127.0.0.1:${toString grafanaPort}:3000 \
        -p 127.0.0.1:4317:4317 \
        -p 127.0.0.1:${toString otlpHttpPort}:4318 \
        -v "$root/provisioning/dashboards/examinus-dashboards.yaml:${provisioning}/dashboards/examinus-dashboards.yaml:ro" \
        -v "$root/provisioning/alerting/examinus-alerts.yaml:${provisioning}/alerting/examinus-alerts.yaml:ro" \
        -v "$root/dashboards:/examinus/dashboards:ro" \
        ${lgtmImage}
    '';
    ready = {
      http.get = { port = grafanaPort; path = "/api/health"; };
      period = 2;
      timeout = 180;
    };
  };

  # `devenv up` starts Postgres, then the API, then the web app on http://localhost:3000. Migrations are not applied
  # here: run `npm run db:migrate` after pulling new ones.
  processes.api = {
    exec = ''
      ${loadAuthSecret}
      ${loadDatabaseUrl}
      ${loadRedisUrl}
      ${loadLanAddress}
      ${ensureLocalDatabase}
      ${loadOtel}
      npm install && npm run dev:rpc
    '';
    # The Garage configure task finishes once the bucket, key and CORS are set up.
    after = [ "devenv:processes:postgres" "devenv:garage:configure" ] ++ lib.optional pkgs.stdenv.hostPlatform.isLinux "devenv:processes:dragonfly";
    ready = {
      http.get = { port = 3001; path = "/health"; };
      period = 1;
      timeout = 180;
    };
  };
  processes.web = {
    # The dev server (vite.config.ts) reads PORT; keep it off the API's.
    exec = ''
      ${loadLanAddress}
      ${loadOtel}
      echo "Web app on the network: http://$DEV_LAN_IP:3000"
      PORT=3000 npm run dev:web
    '';
    after = [ "devenv:processes:api" ];
  };
}
