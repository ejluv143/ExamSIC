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
in
{
  # Node 22 matches `engines.node`; corepack provides the pnpm pinned in `packageManager`.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    corepack.enable = true;
  };
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";

  # Postgres for `apps/rpc` (Drizzle). Data lives in `.devenv/state/postgres`.
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_17;
    listen_addresses = "127.0.0.1";
    port = 5434;
    initialDatabases = [ { name = "examora"; } ];
  };
  env.DATABASE_URL = "postgresql://127.0.0.1:${toString config.services.postgres.port}/examora";
  # The API (apps/rpc) listens here; the web app calls it and forwards /api/auth/* to it.
  env.PORT = "3001";
  env.API_URL = "http://127.0.0.1:3001";
  # Better Auth's public URL is the web app's: browsers never talk to the API directly.
  env.BETTER_AUTH_URL = "http://localhost:3000";

  # S3-compatible storage for question images and students' drawings (apps/rpc, see README). Data lives in
  # .devenv/state/minio and the `examora` bucket is created on start. MinIO allows CORS from any origin by
  # default, so the browser can POST uploads straight to it.
  services.minio = {
    enable = true;
    listenAddress = "127.0.0.1:9000";
    consoleAddress = "127.0.0.1:9001";
    accessKey = "examora";
    secretKey = "examora-secret";
    buckets = [ "examora" ];
  };
  env.S3_BUCKET = "examora";
  env.S3_REGION = "us-east-1";
  env.S3_ENDPOINT = "http://127.0.0.1:9000";
  env.S3_ACCESS_KEY_ID = "examora";
  env.S3_SECRET_ACCESS_KEY = "examora-secret";

  enterShell = loadAuthSecret;

  # `devenv up` starts Postgres, then the API (after migrating and seeding the test and demo accounts),
  # then the web app on http://localhost:3000.
  processes.api = {
    exec = ''
      ${loadAuthSecret}
      pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev:rpc
    '';
    after = [ "devenv:processes:postgres" ];
    ready = {
      http.get = { port = 3001; path = "/health"; };
      period = 1;
      timeout = 180;
    };
  };
  processes.web = {
    # `next dev` reads PORT; keep it off the API's.
    exec = "PORT=3000 pnpm dev:web";
    after = [ "devenv:processes:api" ];
  };
}
