/**
 * PATTERN 3 — Parallelization (voting variant).
 *
 * Run the same judgement N times concurrently and aggregate. Useful when a
 * single call is noisy: majority vote is steadier than one opinion, and the
 * calls are independent so they cost you latency once, not N times.
 *
 * Run it:  npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/03-parallelization.ts
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";

const Verdict = z.object({ safe: z.boolean(), reason: z.string() });

async function moderate(content: string, votes = 5): Promise<boolean> {
  // Fan out. Promise.all runs them concurrently — wall-clock ~= one call.
  const results = await Promise.all(
    Array.from({ length: votes }, () =>
      extract(
        [
          { role: "system", content: "Is this content safe to publish? A little randomness is fine." },
          { role: "user", content },
        ],
        Verdict,
        "verdict",
        { temperature: 1 }, // spread the votes so aggregation means something
      ),
    ),
  );

  const safeCount = results.filter((r) => r.safe).length;
  console.log(`Votes: ${safeCount}/${votes} say safe`);
  return safeCount > votes / 2; // majority
}

console.log("Decision:", (await moderate("Free money!! click here now")) ? "PUBLISH" : "BLOCK");
