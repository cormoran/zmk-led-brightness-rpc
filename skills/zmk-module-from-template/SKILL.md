---
name: zmk-module-from-template
description: Create and initialize a new GitHub repository from cormoran's zmk-module-template-with-custom-studio-rpc template. Use when asked to create, bootstrap, or start a new ZMK module repository that uses the unofficial custom ZMK Studio RPC protocol, including setting Git remotes, resetting main to the template branch, pushing to origin, creating an implementation branch, and then following the cloned repository's AGENTS.md initialization checklist.
---

# ZMK Module From Template

Use this skill to create a new ZMK module repository from `git@github.com:cormoran/zmk-module-template-with-custom-studio-rpc.git`.

The bootstrap operation is intentionally scripted because GitHub repository creation, remote rewiring, branch reset, and first push are fragile when repeated manually.

## Workflow

1. Collect the new repository name and, when not provided, infer the owner as `cormoran`, visibility as `public`, template branch as `main+custom-studio-protocol`, and implementation branch as `codex/init-<repo-name-without-zmk-prefix>`.
2. Confirm or infer that GitHub CLI `gh` and SSH Git access are available.
3. Run `scripts/bootstrap_zmk_module.py` from this skill. Prefer `--dry-run` first when the target repo name or destination is not obvious.
4. Move the working directory to the newly cloned repository.
5. Read the new repository's `AGENTS.md` and complete its Initialization section for the requested module. The placeholder replacement itself is scripted: run `python3 scripts/init_module.py --namespace <author> --module <feature>` inside the new repository, fix any leftover it reports (re-check with `--verify-only`), then finish the manual steps it prints (README rewrite, running the firmware and web test suites).
6. Remove only the Initialization section from the new repository's `AGENTS.md` after the template placeholders are fully replaced. Do not delete this reusable skill.
7. Follow the repository's development rules: commit at milestones, run required checks, create a PR to origin when origin is cormoran's repository, monitor CI, and fix failures or merge conflicts.

## Bootstrap Script

Run from any directory. By default, the clone destination is `../<repo-name>` relative to the current working directory:

```bash
python3 /path/to/zmk-module-from-template/scripts/bootstrap_zmk_module.py \
  --repo zmk-feature-example \
  --owner cormoran \
  --visibility public \
  --branch codex/init-example
```

Useful options:

- `--repo`: New repository name, required.
- `--owner`: GitHub owner or organization for the new repo, default `cormoran`.
- `--visibility`: `public`, `private`, or `internal`. The script defaults to
  `private`, so pass `--visibility public` explicitly (the workflow above
  infers `public` when the user does not say otherwise).
- `--branch`: Implementation branch to create after pushing `main`.
- `--destination`: Clone destination. Default is `../<repo>`.
- `--template-url`: Template SSH URL. Default is cormoran's template repository.
- `--template-ref`: Template branch or ref. Default is `main+custom-studio-protocol`.
- `--dry-run`: Print commands without making changes.

The script performs:

1. `gh repo create <owner>/<repo>` as an empty GitHub repository.
2. `git clone <template-url> <destination>`.
3. Rename the cloned template remote to `template`.
4. Add `origin` as `git@github.com:<owner>/<repo>.git`.
5. Reset local `main` to `template/<template-ref>`.
6. Push `main` to `origin`.
7. Create and check out the implementation branch.

## Initialization Guidance

Do not duplicate the template repository's full initialization checklist in this skill. The cloned repo's `AGENTS.md` is the source of truth for placeholder replacement, module naming, proto paths, firmware artifacts, tests, README content, and project-specific development rules.

When the user asks to implement the module immediately after bootstrapping, continue in this order after reading `AGENTS.md`:

1. Proto definition.
2. Firmware handler.
3. Web UI.

Remember the template-specific nanopb rules from `AGENTS.md`, especially setting `has_<field> = true` for sub-message fields and avoiding 64-bit proto fields when `CONFIG_ZMK_STUDIO` is enabled.
