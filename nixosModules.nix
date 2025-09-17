{
  pkgs,
  lib,
  config,
  ...
}:

let
  cfg = config.services.senddiscord;

  server = import ./package.nix { pkgs = pkgs; };

  sendmail = pkgs.writeShellApplication {
    name = "sendmail";
    runtimeInputs = [
      pkgs.jq
      pkgs.curl
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
in

{

  options.services.senddiscord = {
    enable = lib.mkEnableOption "Send Discord Webhook Dispatcher";
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

    services.mail.sendmailSetuidWrapper = {
      program = "sendmail";
      source = "${sendmail}/bin/sendmail";
      setuid = false;
      setgid = false;
      owner = "root";
      group = "root";
    };

    systemd.services.senddiscord = {
      wantedBy = [ "multi-user.target" ];
      serviceConfig.Type = "notify";
      environment.PORT = toString cfg.port;
      script = ''
        exec ${lib.getExe server} --port "$PORT"
      '';
    };
    systemd.tmpfiles.rules = [
      "d /var/lib/senddiscord/message_db 0700 root root"
    ];
  };

}
