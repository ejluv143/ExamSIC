{ pkgs, lib, config, ... }:

let
  # SESSION_SECRET signs the login cookie. Generated once per machine and kept in
  # .devenv/state (gitignored), so no secret is committed.
  loadSessionSecret = ''
    secret_file="${config.devenv.state}/session-secret"
    if [ ! -s "$secret_file" ]; then
      mkdir -p "$(dirname "$secret_file")"
      (umask 077 && ${lib.getExe pkgs.openssl} rand -base64 32 > "$secret_file")
    fi
    export SESSION_SECRET="$(cat "$secret_file")"
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

  # Postgres for `backend/api` (Drizzle). Data lives in `.devenv/state/postgres`.
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_17;
    listen_addresses = "127.0.0.1";
    port = 5434;
    initialDatabases = [ { name = "examora"; } ];
  };
  env.DATABASE_URL = "postgresql://127.0.0.1:${toString config.services.postgres.port}/examora";

  enterShell = loadSessionSecret;

  # `devenv up` starts Postgres and the web app on http://localhost:3000.
  processes.web.exec = ''
    ${loadSessionSecret}
    pnpm install && pnpm dev:web
  '';
}
