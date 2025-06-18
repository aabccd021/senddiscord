{ inputs }:
{ lib, ... }:
{
  options.services.senddiscord = {
    enable = lib.mkEnableOption "Discord sendmail service";
    webhookUrl = lib.mkOption {
      type = lib.types.str;
      description = "The Discord webhook URL to send messages to.";
    };
  };

  nixpkgs.overlays = [
    (
      final: prev:
      let
        package = import ./package.nix {
          pkgs = final;
          inputs = inputs;
        };
      in
      {
        senddiscord = package;
        sendmail = final.writeShellApplication {
          name = "sendmail";
          runtimeInputs = [
            final.curl
            final.jq
          ];
          text = ''
            stdin=$(cat)
            content=$(echo "$stdin" | jq -R -s .)
            exec curl \
              --request POST \
              --url http://localhost:13000/ \
                            --silent \
              --show-error \
              --fail \
              --header 'Content-Type: application/json' \
              --header 'X-Discord-Webhook-Url: http://localhost:3001' \
              --data "{
                \"content\": $content
              }"
          '';
        };
      }
    )
  ];

}
