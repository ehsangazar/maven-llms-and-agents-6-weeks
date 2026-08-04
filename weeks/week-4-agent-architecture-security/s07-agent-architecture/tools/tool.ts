/**
 * S7 · a tool is a contract, so make the contract a type.
 *
 * A "tool" is just a function the model is allowed to ask for by name. The
 * model never runs it. The model writes down a name and some arguments, your
 * code decides whether to run it, runs it, and hands back a string.
 *
 * That gap between "asked for" and "ran" is the whole design surface, and it is
 * where four rules live:
 *
 *   1. The arguments are untrusted. Validate them, every time.
 *   2. Failure is data, not an exception. A thrown error kills the run; a
 *      returned error message lets the model try something else.
 *   3. The result is context, and context costs money. Bound it.
 *   4. Every tool declares its effect (read / write / irreversible), because
 *      that is what decides whether a replay is free or an incident.
 *
 * Nothing here calls a model, so all of it is testable with no API key.
 */
import { z } from "zod";

/**
 * What running this tool does to the world. This single field drives the
 * durability rules in `../durability/checkpoint.ts`.
 *
 *   read          nothing changes. Replaying it is free.
 *   write         something changes, but running it twice with the same
 *                 idempotency key is safe.
 *   irreversible  money moves, an email goes out, a record dies. Replaying it
 *                 is an incident, so it needs a key AND an audit log.
 */
export type Effect = "read" | "write" | "irreversible";

/** Everything a tool learns about the caller. Never taken from the model. */
export interface ToolContext {
  tenantId: string;
  userId: string;
}

export interface ToolSpec<A extends z.ZodTypeAny> {
  /** snake_case, short, and unmistakable. The model picks by this name. */
  name: string;
  /** Prompt text. The model reads this to decide when to call the tool. */
  description: string;
  /** The argument contract. Narrow types here are narrow privileges later. */
  schema: A;
  effect: Effect;
  /** Cap on the observation handed back. Defaults to 2000 characters. */
  maxChars?: number;
  run: (args: z.infer<A>, ctx: ToolContext) => Promise<string>;
}

/** A tool with its argument type erased, so a registry can hold a mixed list. */
export interface Tool {
  name: string;
  description: string;
  effect: Effect;
  maxChars: number;
  jsonSchema: Record<string, unknown>;
  parse: (raw: unknown) => { ok: true; args: unknown } | { ok: false; message: string };
  invoke: (args: unknown, ctx: ToolContext) => Promise<string>;
}

/** What the loop puts back into the history. Always a string, always bounded. */
export interface ToolResult {
  ok: boolean;
  observation: string;
  /** True when the model can fix this itself by calling again differently. */
  retryable: boolean;
  truncated: boolean;
  effect: Effect;
}

const NAME_RE = /^[a-z][a-z0-9_]{2,39}$/;
const DEFAULT_MAX_CHARS = 2000;

/**
 * Build a tool. The checks here are deliberately loud: a badly named or
 * undocumented tool is a bug you want at import time, not at 2am when the model
 * picks the wrong one.
 */
export function defineTool<A extends z.ZodTypeAny>(spec: ToolSpec<A>): Tool {
  if (!NAME_RE.test(spec.name)) {
    throw new Error(
      `defineTool: "${spec.name}" is not a usable tool name. ` +
        `Use snake_case, 3 to 40 characters, starting with a letter.`,
    );
  }
  if (spec.description.trim().length < 10) {
    throw new Error(
      `defineTool(${spec.name}): the description is the only thing the model reads ` +
        `when choosing this tool. Write a real sentence.`,
    );
  }

  const maxChars = spec.maxChars ?? DEFAULT_MAX_CHARS;

  return {
    name: spec.name,
    description: spec.description,
    effect: spec.effect,
    maxChars,
    jsonSchema: describeSchema(spec.schema),
    parse(raw) {
      const parsed = spec.schema.safeParse(raw);
      if (parsed.success) return { ok: true, args: parsed.data };
      return { ok: false, message: formatIssues(parsed.error) };
    },
    async invoke(args, ctx) {
      return spec.run(args as z.infer<A>, ctx);
    },
  };
}

/** Turn zod issues into a sentence a model can act on, not a stack trace. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * A tiny, dependency-free description of the argument shape, in the format the
 * chat APIs want. Real projects use `zod-to-json-schema`; this keeps the repo
 * honest about what is actually being sent to the model.
 */
function describeSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const unwrapped = schema instanceof z.ZodObject ? schema : null;
  if (!unwrapped) return { type: "object" };

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(unwrapped.shape as Record<string, z.ZodTypeAny>)) {
    properties[key] = describeField(value);
    if (!value.isOptional()) required.push(key);
  }

  return { type: "object", properties, required };
}

function describeField(field: z.ZodTypeAny): Record<string, unknown> {
  if (field instanceof z.ZodOptional || field instanceof z.ZodDefault) {
    return describeField(field._def.innerType as z.ZodTypeAny);
  }
  if (field instanceof z.ZodEnum) {
    return { type: "string", enum: [...(field.options as string[])] };
  }
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodBoolean) return { type: "boolean" };
  return { type: "string" };
}

export interface Registry {
  /** What you paste into the prompt. Sorted, so the prompt prefix stays cacheable. */
  catalogue(): Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  names(): string[];
  get(name: string): Tool | undefined;
  /** Run a tool by name. NEVER throws: every failure comes back as a ToolResult. */
  call(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * The registry is the allow-list. If a tool is not in here, the model cannot
 * reach it, whatever it writes in its output.
 */
export function createRegistry(tools: Tool[]): Registry {
  const byName = new Map<string, Tool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) throw new Error(`createRegistry: duplicate tool "${tool.name}"`);
    byName.set(tool.name, tool);
  }

  const sorted = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    catalogue() {
      return sorted.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.jsonSchema,
      }));
    },
    names() {
      return sorted.map((tool) => tool.name);
    },
    get(name) {
      return byName.get(name);
    },
    async call(name, rawArgs, ctx) {
      const tool = byName.get(name);

      // Hallucinated tool name. Say so, and list what does exist: the model can
      // recover from this on the next step if you tell it enough.
      if (!tool) {
        return {
          ok: false,
          retryable: true,
          truncated: false,
          effect: "read",
          observation:
            `error: no tool named "${name}". ` +
            `Available tools: ${sorted.map((t) => t.name).join(", ")}.`,
        };
      }

      const parsed = tool.parse(rawArgs);
      if (!parsed.ok) {
        return {
          ok: false,
          retryable: true,
          truncated: false,
          effect: tool.effect,
          observation: `error: invalid arguments for ${name}. ${parsed.message}`,
        };
      }

      try {
        const raw = await tool.invoke(parsed.args, ctx);
        return { ...bound(raw, tool.maxChars), ok: true, retryable: false, effect: tool.effect };
      } catch (err) {
        // The tool itself blew up. That is still an observation, not the end of
        // the run: a dead dependency should not delete the last nine steps.
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          retryable: true,
          truncated: false,
          effect: tool.effect,
          observation: `error: ${name} failed. ${message}`,
        };
      }
    },
  };
}

/** Bound the observation, and say so, so the model knows it is seeing a slice. */
function bound(text: string, maxChars: number): { observation: string; truncated: boolean } {
  if (text.length <= maxChars) return { observation: text, truncated: false };
  const marker = `\n[truncated: ${text.length - maxChars} more characters]`;
  return { observation: text.slice(0, maxChars) + marker, truncated: true };
}
