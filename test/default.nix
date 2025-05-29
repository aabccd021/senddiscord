{ pkgs, discord-webhook-dispatcher }:
let

  mkTest =
    name:
    pkgs.runCommandLocal "test-${name}" {
      env.TEST_FILE = "${./.}/${name}.sh";
      buildInputs = [
        pkgs.curl
        pkgs.systemd-notify-fifo-server
        discord-webhook-dispatcher
      ];
    } (builtins.readFile ./test.sh);

  mapTests =
    names:
    builtins.listToAttrs (
      builtins.map (name: {
        name = "test-" + name;
        value = mkTest name;
      }) names
    );

  normalTests = mapTests [
    "success"

  ];

in
normalTests
