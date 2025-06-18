{ inputs }:
{
  pkgs,
  lib,
  config,
  ...
}:

let
  cfg = config.services.send-discord;

  server = import ./package.nix {
    pkgs = pkgs;
    inputs = inputs;
  };
in

{

  options.services.send-discord = {
    enable = lib.mkEnableOption "Discord Sendmail Service";
    webhookUrlFile = lib.mkOption {
      type = lib.types.path;
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 14000;
      description = "Port for the Discord webhook dispatcher service.";
    };
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [
      (final: prev: {
        sendmail = final.writeShellApplication {
          name = "sendmail";
          runtimeInputs = [
            final.jq
            final.curl
          ];
          runtimeEnv.WEBHOOK_URL_FILE = cfg.webhookUrlFile;
          runtimeEnv.PORT = toString cfg.port;
          text = ''
            set -x
            stdin=$(cat)
            if [ -z "$stdin" ]; then
              echo "No input provided. Exiting."
              exit 0
            fi
            content=$(printf "%s" "$stdin" | jq --raw-input --slurp --raw-output '@json')
            webhook_url=$(cat "$WEBHOOK_URL_FILE")
            exec curl \
              --request POST \
              --url "http://127.0.0.1:$PORT" \
              --silent \
              --show-error \
              --fail \
              --header 'Content-Type: application/json' \
              --header "X-Discord-Webhook-Url: $webhook_url" \
              --data "{ \"content\": $content }"
          '';
        };
      })
    ];

    environment.systemPackages = [
      pkgs.sendmail
    ];

    services.mail.sendmailSetuidWrapper = {
      program = "sendmail";
      source = "${pkgs.sendmail}/bin/sendmail";
      setuid = false;
      setgid = false;
      owner = "root";
      group = "root";
    };

    systemd.services.discord-sendmail = {
      wantedBy = [ "multi-user.target" ];
      serviceConfig.Type = "notify";
      environment.PORT = toString cfg.port;
      script = ''
        exec ${lib.getExe server} --port "$PORT"
      '';
    };
    systemd.tmpfiles.rules = [
      "d /var/lib/discord-webhook-dispatcher/message_db 0700 root root"
    ];
  };

}
