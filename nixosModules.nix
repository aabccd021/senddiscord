{
  pkgs,
  lib,
  config,
  ...
}:

let
  cfg = config.services.senddiscord;

  senddiscord = pkgs.writeShellApplication {
    name = "senddiscord";
    text = builtins.readfile ./senddiscord.sh;
    runtimeInputs = [
      pkgs.curl
      pkgs.jq
    ];
  };

  sendmail = pkgs.writeShellApplication {
    name = "sendmail";
    text = "cat >> /var/lib/senddiscord/messages.txt";
  };

in

{

  options.services.senddiscord = {
    enable = lib.mkEnableOption "Send Discord Webhook Dispatcher";
    webhookUrlFile = lib.mkOption {
      type = lib.types.path;
    };
  };

  config = lib.mkIf cfg.enable {

    services.mail.sendmailSetuidWrapper = {
      program = "sendmail";
      setuid = false;
      setgid = false;
      owner = "root";
      group = "root";
      source = lib.getExe sendmail;
    };

    systemd.services.senddiscord = {
      wantedBy = [ "multi-user.target" ];
      serviceConfig.Type = "notify";
      environment.WEBHOOK_URL_FILE = cfg.webhookUrlFile;
      script = lib.getExe senddiscord;
    };

    systemd.tmpfiles.rules = [
      "d /var/lib/senddiscord 0700 root root"
    ];

  };

}
