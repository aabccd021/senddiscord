{ pkgs, discord-webhook-dispatcher }:
let

  testServer = pkgs.runCommandLocal "test-server" { } ''
    ${pkgs.bun}/bin/bun build ${./mock-discord-webhook.ts} \
      --compile \
      --minify \
      --sourcemap \
      --bytecode \
      --outfile program
    mkdir -p "$out/bin"
    mv program "$out/bin/mock-discord-webhook"
  '';

  mkTest =
    name:
    pkgs.runCommandLocal "test-${name}" {
      env.TEST_FILE = "${./.}/${name}.sh";
      buildInputs = [
        pkgs.curl
        pkgs.systemd-notify-fifo-server
        pkgs.jq
        testServer
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
    "success-4"
    "success-3"
    "reset-after-1-success"
  ];

in
normalTests
