{
  nixConfig.allow-import-from-derivation = false;

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  inputs.treefmt-nix.url = "github:numtide/treefmt-nix";

  outputs =
    { self, ... }@inputs:
    let

      nixosModules.default = import ./nixosModules.nix;

      pkgs = inputs.nixpkgs.legacyPackages.x86_64-linux;

      treefmtEval = inputs.treefmt-nix.lib.evalModule pkgs {
        programs.nixfmt.enable = true;
        programs.shfmt.enable = true;
        programs.prettier.enable = true;
        programs.shellcheck.enable = true;
        settings.formatter.shellcheck.options = [
          "-s"
          "sh"
        ];
      };

    in

    {

      checks.x86_64-linux.formatting = treefmtEval.config.build.check self;
      formatter.x86_64-linux = treefmtEval.config.build.wrapper;
      nixosModules = nixosModules;

    };
}
