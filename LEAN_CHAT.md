# Chat and web-search build

This fork now has a permanent lean chat surface. No environment flag is needed.

## Retained

- Provider/model selection, conversation history, branching, editing, and streaming.
- Web search, its credential dialog, citations, and search-result attachments.
- Direct attachments, including image picker, paste, drag/drop, and previews.
- Ordinary Markdown, code copying, math, and Mermaid diagrams.
- Account settings, authentication, and shared conversations.

Existing provider-supported attachment types and upload limits are preserved. Files
are no longer routed to code execution, file search, OCR, or MCP from the composer.
Prompt management remains available at its existing URL, but its data provider no
longer mounts on ordinary chat pages.

## Removed from the active frontend

- Agent marketplace/builders, skills navigation, and MCP management controls.
- Code execution, artifacts, skills, memory, and file-search composer controls.
- Command popovers and unused badge editing/dragging machinery.
- Artifact editors/previews and MCP interactive-resource rendering, including in shares.
- Per-code-block execution state, tool subscriptions, result navigation, and Run buttons.
- MCP startup prefetching and the sidebar's duplicate chat/form providers.

Saved tool selections and model-spec defaults are projected to `web_search` only
before persistence/submission. Explicitly disabled search stays disabled. Historical
tool output remains readable as text/downloads instead of launching interactive UIs.

## Backend boundary

`packages/api/src/app/lean.ts` applies before config setup and after database override
resolution. Agent capabilities are restricted to `web_search`; explicit empty lists
remain empty. Existing provider/search credentials and configuration are preserved.
Deployment-skill loading and GitHub skill-sync startup are removed. Stale artifact
selections cannot inject artifact instructions when that capability is disabled.

The shared agents execution engine is retained because ordinary provider chat and
built-in web search use it. MCP manager/registry and reconnect scaffolding remain
because shared chat code still depends on their initialization. This is not a removal
of every backend MCP module or route. No conversations, user documents, uploaded
files, database volumes, or deployment services are deleted.

## Build verification

Build and redeploy **both** the backend packages and frontend using the normal build
pipeline. A frontend-only deployment does not apply the backend capability policy.

```sh
npm run build
```

The production frontend build fails if rendered modules from Sandpack, Monaco, or
MCP UI reappear. It emits `client/dist/lean-build.json` with JavaScript sizes excluding
locale chunks. To compare two production build directories:

```sh
node client/scripts/compare-builds.cjs <before-dist> <after-dist>
```

These are emitted bundle-size measurements, not browser CPU time, initial-transfer
measurements, or proof that a particular long-conversation stall is fixed. Test the
same long conversation after deployment and distinguish text-only scrolling from
image loading and streaming. Browser smoke tests with synthetic API responses do
not verify live provider calls, search services, or upload persistence.
