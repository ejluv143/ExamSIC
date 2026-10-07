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

  # Postgres for `apps/api` (Drizzle). Data lives in `.devenv/state/postgres`.
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_17;
    listen_addresses = "127.0.0.1";
    port = 5434;
    initialDatabases = [ { name = "examora"; } ];
  };
  env.DATABASE_URL = "postgresql://127.0.0.1:${toString config.services.postgres.port}/examora";
  env.BETTER_AUTH_URL = "http://localhost:3000";

  enterShell = loadAuthSecret;

  # `devenv up` starts Postgres, applies migrations, seeds the demo accounts and serves the web app
  # on http://localhost:3000.
  processes.web = {
    exec = ''
      ${loadAuthSecret}
      pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev:web
    '';
    process-compose.depends_on.postgres.condition = "process_healthy";
  };
}
