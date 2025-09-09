{
  nixConfig.allow-import-from-derivation = false;

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  inputs.treefmt-nix.url = "github:numtide/treefmt-nix";
  inputs.systemd-notify-fifo.url = "github:aabccd021/systemd-notify-fifo";

  outputs =
    { self, ... }@inputs:
    let

      overlays.default = (
        final: prev: {
          senddiscord = import ./package.nix {
            pkgs = final;
            inputs = inputs;
          };
        }
      );

      nixosModules.default = import ./nixosModules.nix;

      pkgs = import inputs.nixpkgs {
        system = "x86_64-linux";
        overlays = [
          inputs.systemd-notify-fifo.overlays.default
        ];
      };

      senddiscord = import ./package.nix { pkgs = pkgs; };

      test = import ./test {
        pkgs = pkgs;
        senddiscord = senddiscord;
      };

      treefmtEval = inputs.treefmt-nix.lib.evalModule pkgs {
        programs.nixfmt.enable = true;
        programs.biome.enable = true;
        programs.biome.formatUnsafe = true;
        programs.biome.settings.formatter.indentStyle = "space";
        programs.biome.settings.formatter.lineWidth = 100;
        programs.shfmt.enable = true;
        settings.global.excludes = [ "LICENSE" ];
      };

      formatter = treefmtEval.config.build.wrapper;

      update-npm-deps = pkgs.writeShellApplication {
        name = "update-npm-deps";
        text = ''
          nix run github:aabccd021/bun3nix install @types/bun superstruct > ./npm_deps.nix
        '';
      };

      npm_deps = import ./npm_deps.nix { pkgs = pkgs; };

      typeCheck = pkgs.runCommand "typeCheck" { } ''
        cp -Lr ${npm_deps}/lib/node_modules ./node_modules
        cp -Lr ${./src} ./src
        cp -L ${./tsconfig.json} ./tsconfig.json
        ${pkgs.typescript}/bin/tsc
        touch $out
      '';

      lintCheck = pkgs.runCommand "lintCheck" { } ''
        cp -Lr ${npm_deps}/lib/node_modules ./node_modules
        cp -Lr ${./src} ./src
        cp -L ${./tsconfig.json} ./tsconfig.json
        touch $out
      '';

      scripts.prefmt = pkgs.writeShellApplication {
        name = "prefmt";
        runtimeInputs = [ pkgs.biome ];
        text = ''
          biome check --vcs-enabled=false --fix --unsafe
        '';
      };

      packages =
        test
        // scripts
        // {
          senddiscord = senddiscord;
          tests = pkgs.linkFarm "tests" test;
          formatting = treefmtEval.config.build.check self;
          formatter = formatter;
          typeCheck = typeCheck;
          lintCheck = lintCheck;
          update-npm-deps = update-npm-deps;
        };

    in

    {

      packages.x86_64-linux = packages // {
        gcroot = pkgs.linkFarm "gcroot" packages;
      };

      checks.x86_64-linux = packages;
      formatter.x86_64-linux = formatter;

      overlays = overlays;
      nixosModules = nixosModules;

    };
}
