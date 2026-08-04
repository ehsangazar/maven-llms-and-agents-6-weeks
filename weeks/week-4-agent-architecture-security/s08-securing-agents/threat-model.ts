/**
 * S8 · your threat model, printed. No API key.
 *
 * Edit the `SYSTEM` object to describe your own agent and run it again. The
 * output is the shape Project 3 asks for: where untrusted content enters, what
 * each tool could be abused to do, whether you have all three legs of the
 * lethal trifecta, which layer covers which risk, and what you are choosing to
 * accept.
 *
 * Run it:
 *   npm run lab weeks/week-4-agent-architecture-security/s08-securing-agents/threat-model.ts
 */
import { lethalTrifecta } from "./privilege/capability.ts";
import { PAYLOADS, coverage } from "./redteam/corpus.ts";
import { admit, pin, type ServerManifest } from "./supply-chain/servers.ts";
import { checkUrl, type EgressPolicy } from "./egress/outbound.ts";

type Effect = "read" | "write" | "irreversible";

interface ToolRow {
  name: string;
  effect: Effect;
  worstCase: string;
  /** Which of the five layers you have actually implemented for this tool. */
  layers: string[];
}

const kb: ServerManifest = {
  server: "kb.internal",
  version: "1.2.0",
  tools: [{ name: "search_kb", description: "Search the internal knowledge base for an article." }],
};

const SYSTEM = {
  name: "Order support agent",

  untrustedInputs: [
    "the customer's message",
    "ticket notes written by anyone with a support link",
    "knowledge base articles returned by search_kb",
  ],

  tools: [
    { name: "lookup_order", effect: "read", worstCase: "reads one order the caller already owns", layers: ["capability scope"] },
    { name: "read_refund_policy", effect: "read", worstCase: "reveals a public policy", layers: [] },
    {
      name: "issue_refund",
      effect: "irreversible",
      worstCase: "money leaves the account, to an order the attacker chose",
      layers: ["capability scope", "taint on untrusted input", "human approval bound to arguments"],
    },
  ] satisfies ToolRow[],

  trifecta: {
    privateData: true,
    untrustedContent: true,
    externalCommunication: true,
  },

  egress: {
    allowedHosts: ["docs.acme.example"],
    secrets: [],
  } satisfies EgressPolicy,

  // Servers whose tools this agent loads, and what you pinned at review time.
  servers: [kb],
  policy: { allowedServers: ["kb.internal"], pins: [pin(kb)] },

  accepting:
    "a tainted run can still produce a wrong ANSWER. We accept that: it is a quality " +
    "problem measured by evals in Week 5, not a breach.",
};

const line = (label: string, value: string) => console.log(`${label.padEnd(24)} ${value}`);

console.log(`\n== Threat model · ${SYSTEM.name} ==\n`);

// 1 · Where hostile text can enter.
line("1 · untrusted inputs", `${SYSTEM.untrustedInputs.length} entry points`);
for (const input of SYSTEM.untrustedInputs) line("", `- ${input}`);

// 2 · What each tool could be abused to do.
console.log("");
line("2 · tools", `${SYSTEM.tools.length}`);
for (const tool of SYSTEM.tools) {
  const uncovered = tool.effect !== "read" && tool.layers.length === 0;
  line(`   ${tool.name}`, `${tool.effect} · ${tool.worstCase}`);
  line("", `  layers: ${tool.layers.join(", ") || (uncovered ? "NONE, fix this first" : "none needed")}`);
}

// 3 · The trifecta.
console.log("");
const verdict = lethalTrifecta(SYSTEM.trifecta);
line("3 · lethal trifecta", verdict.exposed ? `EXPOSED: ${verdict.legs.join(" + ")}` : "not exposed");
line("   advice", verdict.advice);

// 4 · Where data may go.
console.log("");
line("4 · egress", `allow-list: ${SYSTEM.egress.allowedHosts.join(", ")}`);
for (const url of ["https://docs.acme.example/refunds", "https://evil.example/p?d=x", "http://169.254.169.254/"]) {
  const decision = checkUrl(url, SYSTEM.egress);
  line("", `  ${decision.allowed ? "allow" : "deny "} ${url}  (${decision.reason})`);
}

// 5 · The tools you did not write.
console.log("");
const admitted = admit(SYSTEM.servers, SYSTEM.policy);
line("5 · supply chain", `${admitted.admitted.length} admitted, ${admitted.blocked.length} blocked`);
for (const block of admitted.blocked) line("", `  blocked ${block.server}: ${block.reason}`);
for (const warning of admitted.warnings) line("", `  warn ${warning.server}: ${warning.detail}`);

// 6 · Proof, rather than confidence.
console.log("");
line("6 · red-team suite", `${PAYLOADS.length} payloads`);
for (const [category, n] of Object.entries(coverage())) line("", `  ${category}: ${n}`);

// 7 · Residual risk, named.
console.log("");
line("7 · accepting", SYSTEM.accepting);

console.log("\nEvery line above is a sentence you can defend in Project 3.\n");
