# GitHub source and Sites publication

## Canonical source

The canonical project is **[jonathanjie/sofa-arcade](https://github.com/jonathanjie/sofa-arcade)**, default branch **`main`**. Keep the full game collection, shared platform code, art, tests, local launcher, and design documents together in this public repository. Future sessions should begin with this repository and reconcile its latest changes before editing.

The existing public website remains hosted by ChatGPT Sites:

| Item | Value |
| --- | --- |
| GitHub repository | `jonathanjie/sofa-arcade` |
| Canonical branch | `main` |
| Public website | https://sofa-kingdoms-jon-lydia.jon-marinachain.chatgpt.site/ |
| Sites project ID | `appgprj_6afefbec09788191b3615027f614b989` |
| Runtime | Cloudflare Worker with D1 binding `DB` |
| Tracked hosting configuration | `.openai/hosting.json` |

GitHub supplies version control. Sites supplies the current production deployment and database. A GitHub push does **not** automatically publish the website. No automatic GitHub-to-Sites deployment connection is established by this migration, and the Sites repository has not been natively rebound to GitHub. Its managed Git history remains a deployment mirror.

GitHub Pages alone cannot run the current Worker/D1 multiplayer backend. Moving hosting later requires a compatible room service, data migration decisions, and verification of joins, actions, authorization, and reconnects. The optional Mac host is documented separately in [LAN.md](LAN.md).

## Start a session from GitHub

1. Clone or open the canonical repository. Inspect the current branch, working tree, and remotes before making changes. A clone for development should use GitHub as `origin`; do not infer the repository from a reused workspace folder name.
2. Fetch the latest GitHub state. On a clean `main`, fast-forward to `origin/main`. If there are existing edits or divergent commits, preserve them on their branch and reconcile intentionally; do not reset, discard, or force-push them.
3. Read [../AGENTS.md](../AGENTS.md), [../README.md](../README.md), [HANDOFF.md](HANDOFF.md), and the relevant game design document. Inspect current code when documents and implementation differ.
4. Use a task branch, such as `feature/gravity-orchard` or `fix/room-reconnect`. Keep one coherent feature or shared-platform change per branch.
5. Follow the [build rules](../AGENTS.md#authoring-and-checks). Keep machine-specific settings outside tracked source.

Basic first-time development setup:

```sh
git clone https://github.com/jonathanjie/sofa-arcade.git
cd sofa-arcade
git switch -c feature/gravity-orchard
```

Use the authenticated GitHub connector or an authorized Git client for pushes and PRs. Never place tokens in remote URLs, command arguments, committed files, screenshots, or handoff documents. Public source should contain code and assets, not room databases, credential caches, private account state, or deployment secrets.

## Parallel game development

Use the [parallel development guide](PARALLEL_DEVELOPMENT.md) for ownership, room adapters, private projections and simultaneous commitments. Coordinate dependency manifests, hosting configuration and migrations with the integrator.

Open a PR with the concrete player problem, implemented behavior, meaningful verification, and any remaining limitation. Include TV and phone screenshots for affected interface flows. Reconcile updated `main` through ordinary merges or rebases appropriate to the branch; avoid rewriting a shared branch. Never force-push `main` or replace another session's work to resolve a conflict.

## Generate and verify before the GitHub commit

Follow the [project checks](../AGENTS.md#authoring-and-checks) and [release inventory and reproduction steps](LOCAL_RELEASE.md#delivery-inventory-and-publicprivate-boundary). Review the complete candidate, including generated files, before integration. A CI result covers only the checks its workflow declares.

## Publish the same reviewed source through Sites

A release has two source references: the canonical GitHub commit and the Sites deployment-mirror commit. Their commit hashes can differ because they have different histories. **Their tracked Git trees must match**, including paths, blob content, file modes, and deletions.

Use separate checkouts:

- A canonical GitHub checkout, with the exact reviewed release commit available and a clean working tree.
- A dedicated Sites deployment checkout opened through the installed Sites skill's source workflow. This checkout preserves Sites' repository history, identity, and authentication mechanism.

Do not repoint the Sites checkout's repository to GitHub and assume Sites will accept the new history. Do not continue feature development only in the deployment mirror. If a deployment check reveals a source problem, fix it in GitHub and repeat the release from the new reviewed commit.

### Release sequence

1. **Pin the GitHub source.** Fetch and verify the selected commit, its review status, and its exact tracked tree. Check for newer changes that should be reconciled before release. Record the selected full SHA.
2. **Open the existing Site.** Read the installed Sites skill, fetch the exact project above, verify its current public audience, obtain fresh short-lived source credentials, and open its latest managed source through the prescribed helper with the credential passed through its prescribed stdin. Retain the helper's complete opening result.
3. **Prepare the mirror.** Review the Sites checkout for uncommitted edits or newer deployment changes. Preserve and reconcile any changes absent from GitHub before replacing tracked content. Material differences require resolution; the GitHub instruction is not permission to discard work.
4. **Transfer the tracked snapshot.** Populate the mirror from the reviewed GitHub commit while preserving file types and executable modes. Account for deleted paths: remove only previously tracked source paths that are absent from the chosen GitHub snapshot, after reviewing the difference. Never erase `.git`, local credentials, runtime databases, local environment files, or other untracked checkout state. Do not copy GitHub's `.git` directory into the mirror. Use a reviewed file manifest rather than a blanket directory wipe.
5. **Preserve hosting identity.** The chosen source must retain the existing project ID, D1 binding, migrations, and public audience. Investigate a mismatch rather than inventing a replacement Site or changing access. Apply hosting/runtime secrets through their supported configuration mechanism; keep them outside Git.
6. **Build and package through Sites.** Follow the current skill's source workflow, passing the complete opening result, fresh credential through the prescribed hidden input, remaining checks/build commands, and archive destination. Let the helper prepare Git, build, commit/push the deployment mirror, and produce its verified archive.
7. **Verify equality.** Compare the final mirror's tracked tree to the pinned GitHub tree. Prefer equal Git tree IDs; otherwise verify every tracked path, mode, and blob ID and resolve any difference. Generated assets or configuration changed by the build must be reconciled in canonical GitHub source before publication, not silently left as a production-only change.
8. **Save and deploy the exact result.** Use the helper-returned project ID, mirror commit SHA, and unchanged archive. Save the version, then deploy that saved version through the appropriate current-audience operation. Resume an existing attempt instead of creating duplicate deployments.
9. **Record the outcome.** Verify a successful deployment result and production URL. Record the GitHub SHA, Sites SHA, shared tree ID, version, and deployment identity in the release/PR record or other established handoff location. Do not claim deployment success from a GitHub push or a local build alone.

No copy script or CI deployment pipeline is supplied by these instructions. Use the installed tool contracts and inspected repository state for the actual transfer. If a helper or hosting surface changes, update this workflow after verifying the replacement; do not work around access controls.

## What another session needs

For code work, share the GitHub repository, branch/commit, relevant game design document, and the task's intended file ownership. For publication, the session also needs authorized Sites access and the existing project identity above. All ongoing source changes belong in GitHub even when Sites remains the deployment mechanism.

Before saying that work is available for handoff, verify the pushed GitHub commit and the required files—including binary art and generated local bundle—on the remote repository. Before saying it is live, verify the Sites deployment separately.
