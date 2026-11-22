# Keep the guide current from CI

When your tests, PRDs or diagrams change, the flows HeyPointer serves should change with them, with no one rebuilding the app or restarting the server. CI does it in two commands:

```bash
heypointer scan .                                   # writes .heypointer/kb.json (read-only, offline)
heypointer publish --server https://heypointer.example.com   # uploads it
```

`publish` replaces the calling tenant's **scanned** knowledge base: a tenant admin key publishes to that tenant only, and the platform key publishes to the `default` tenant. Flows people added through the console or `heypointer flows` (published authored flows) are kept.



## What `heypointer publish` does

```bash
export HEYPOINTER_API_KEY=...                       # a tenant admin key (heypointer keys create --name ci --scope admin), never a flag
heypointer publish --server https://heypointer.example.com [--kb .heypointer/kb.json] [--dry-run] [--json]
```

| | |
|---|---|
| Server | `--server`, else `HEYPOINTER_SERVER`. There is no default: publishing changes what users are served, so the target is always named. https only (http is allowed for localhost). |
| Key | `HEYPOINTER_API_KEY` only. A `--api-key` flag is refused. The key is sent in one `Authorization` header, never printed (it is also scrubbed from anything the server echoes back), and redirects are not followed so it cannot be sent to another host. A remote server with no key set is refused before any request. |
| File | `--kb`, default `.heypointer/kb.json`. Checked locally first with the server's own rules: valid JSON, the contract schema, a consistent graph, at least one flow, at most 32 MiB. |
| `--dry-run` | Does all the checks above, prints what would be sent, and sends nothing. Needs no key or server. |
| Result | `Published <kbId> to <host>: N nodes, ...` or `Already up to date`. The same content twice changes nothing. |
| Exit codes | `0` published, unchanged or dry run. `1` error or refused. `2` no knowledge base file (run `scan` first). |

The server refuses, with a message that says what to fix:

| Status | Code | Meaning |
|---|---|---|
| 401 | `unauthorized` | Wrong or missing key. Repeated failures from one address are rate limited. |
| 409 | `embedder_mismatch` | The file's embedder is not the server's. See "Embedder" below. |
| 409 | `conflict` | A scanned workflow id equals a published flow. Rename it, or unpublish that flow. |
| 413 | `payload_too_large` | Over 32 MiB. Scan fewer files with `--exclude`. |
| 422 | `scanner_too_old` | The file came from an older scanner than the server's. Upgrade the CLI and scan again. |

A refused publish changes nothing: the server keeps serving what it had.

## GitHub Actions

The repository ships a composite action, `.github/actions/heypointer-publish`, and a workflow template, [`docs/ci/heypointer.yml.example`](ci/heypointer.yml.example).

1. Install the `heypointer` CLI from npm into your project as a dev dependency (`npm install --save-dev @heypointerhq/cli`), so `npm ci` installs it. The CLI is a built package: its source is not in the public repository, and it is not published yet, so until it is, install it from the tarball you were given. The action runs `npx --no-install heypointer`, which only uses an installed copy. It never downloads one, because an unpinned `npx heypointer` could fetch an unrelated package.
2. Copy `.github/actions/heypointer-publish/` and the template into your repository.
3. Set a repository **variable** `HEYPOINTER_SERVER` and a **secret** `HEYPOINTER_API_KEY`.

| Input | Default | |
|---|---|---|
| `server-url` | empty | Server origin. |
| `api-key` | empty | The server's API key, from a secret. |
| `working-directory` | `.` | What to scan. |
| `dry-run` | `false` | Scan and validate, send nothing. The only mode allowed on pull requests. |
| `required` | `true` | `true` fails when `server-url` is empty. `false` skips with a notice, for repositories that have not set the server up yet. |
| `cli-command` | `npx --no-install heypointer` | How to run the CLI. |

The action fails closed. It refuses to run when:

- the event is `pull_request` or `pull_request_target` and `dry-run` is not `true`;
- `server-url` is empty (unless `required: "false"`);
- `server-url` is not https (localhost excepted);
- `api-key` is empty for a remote server;
- `working-directory` does not exist.

The key reaches only the publish step, as an environment variable. It is never in a command line, and the scan step never sees it. Inputs are passed through `env`, never interpolated into shell text.

### The safe pattern

- **Publish only from the default branch, after merge.** Pull requests run `dry-run: "true"`: they prove the flows still scan, with no secret. This is what the template does.
- **Never give the key to code you have not reviewed.** Do not use `pull_request_target`, and do not publish from a fork. Fork pull requests do not receive secrets anyway; keep it that way.
- **Keep the key an Actions secret** (or an environment secret on `heypointer-production` with a required reviewer if a person should approve each publish). Create a dedicated tenant admin key for CI (`heypointer keys create --name ci --scope admin`) so you can revoke it without touching anyone's login; it can manage that tenant's flows and client ids as well as publish, so treat it like a password. Do not use the platform key in CI.
- **One publish at a time.** The template's `concurrency` group serialises runs; the server also applies publishes one after another.
- **Pin third-party actions** (`actions/checkout`, `actions/setup-node`) to a full commit SHA once you have chosen versions, and use `persist-credentials: false` on checkout.
- **Review what scanning reads.** `scan` is read-only and offline: it never runs your code. Changes to tests, PRDs and diagrams change what users are told, so review them like any other change.

## Embedder

A knowledge base carries vectors made by one embedder, and the server must use the same one to compare user questions with them. `heypointer scan` always uses the offline hash embedder (`hash-v1-512`), which is also the server's default in offline mode and in the Docker image. A server configured with an OpenRouter embedder answers `embedder_mismatch` (409) and says so. Until the scan can use that embedder, point CI at a server that runs the hash embedder, or use `POST /api/ingest` on the server for sources it can read itself.

## Not covered

- Who published what: with user accounts enabled the audit log records knowledge-base publishes (and key, client and flow changes) with the key that made them; without accounts there is only the server's request log (the route and status, never the body or the key).
- No staged rollout, per-branch knowledge bases or one-click rollback: the previous `kbId` is in the response, and publishing the old scan again restores it.
- Publishing is for one server instance. With several instances behind a load balancer, each would need the upload.
- Only the web-and-mobile flows your sources describe are scanned; nothing here deploys the server or the app.
