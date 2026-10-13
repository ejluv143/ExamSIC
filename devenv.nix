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

  # S3-compatible storage for question images and students' drawings (apps/rpc, see README): Garage, with data in
  # .devenv/state/garage. On start it creates the bucket, imports the key above with read and write on it, and
  # sets CORS so the browser can POST uploads straight to it and read signed images. The S3 API is on 3910 (or the
  # next free port), clear of Garage's default 3900 used by other projects.
  services.garage = {
    enable = true;
    s3Address = "127.0.0.1:3910";
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
          --endpoint-url ${config.env.GARAGE_S3_ENDPOINT} --region ${config.services.garage.region} \
          --bucket ${s3.bucket} \
          --cors-configuration '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD","POST","PUT"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]}'
      echo "Garage bucket '${s3.bucket}' is ready for key '${s3.keyName}'."
    '';
  };
  # The module starts Garage's internal RPC port at 3901, which another project's Garage may hold; keep it beside ours.
  processes.garage.ports.rpc.allocate = lib.mkForce 3911;
  env.S3_BUCKET = s3.bucket;
  env.S3_REGION = config.services.garage.region;
  env.S3_ENDPOINT = config.env.GARAGE_S3_ENDPOINT;
  env.S3_ACCESS_KEY_ID = s3.accessKeyId;
  env.S3_SECRET_ACCESS_KEY = s3.secretAccessKey;

  # The API's cache and event channels (see README "Cache (Dragonfly)"). Nothing in it needs to survive a restart, so
  # no snapshots. A REDIS_URL already in the environment wins (e.g. Dragonfly from docker compose on macOS).
  processes.dragonfly = lib.mkIf pkgs.stdenv.isLinux {
    exec = "${dragonfly}/bin/dragonfly --bind 127.0.0.1 --port ${toString dragonflyPort} --dbfilename= --proactor_threads 2 --logtostderr";
    ready.exec = "${lib.getExe pkgs.redis} -p ${toString dragonflyPort} ping";
  };

  enterShell = loadAuthSecret + loadDatabaseUrl + loadRedisUrl;

  # `devenv up` starts Postgres, then the API (after migrating),
  # then the web app on http://localhost:3000.
  processes.api = {
    exec = ''
      ${loadAuthSecret}
      ${loadDatabaseUrl}
      ${loadRedisUrl}
      ${ensureLocalDatabase}
      npm install && npm run db:migrate && npm run dev:rpc
    '';
    # The Garage configure task finishes once the bucket, key and CORS are set up.
    after = [ "devenv:processes:postgres" "devenv:garage:configure" ] ++ lib.optional pkgs.stdenv.isLinux "devenv:processes:dragonfly";
    ready = {
      http.get = { port = 3001; path = "/health"; };
      period = 1;
      timeout = 180;
    };
  };
  processes.web = {
    # The dev server (vite.config.ts) reads PORT; keep it off the API's.
    exec = "PORT=3000 npm run dev:web";
    after = [ "devenv:processes:api" ];
  };
}
