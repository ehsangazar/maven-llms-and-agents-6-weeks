# Lab 2 · Build a Hybrid-Search RAG Pipeline

**module 2 · Context engineering & retrieval**

Chunk a corpus, retrieve with dense embeddings + BM25, fuse the two result
sets, re-rank down to a handful, assemble to a token budget, and refuse to
answer when nothing relevant comes back.

## What you build
- A chunker with sensible overlap
- Dense (vector) + sparse (BM25) retrieval
- Rank fusion, then a re-ranking pass to a few results
- Context assembly under a fixed token budget
- A "no relevant context → refuse" guard

## Where to start
Shared LLM client: [`../../../common/llm.ts`](../../../common/llm.ts).

```
starter/    scaffolding + TODOs
solution/   the worked reference
```

> Worked reference is filled in during the cohort. Session page:
> [hub.gazar.dev/llms-and-agents/lab-hybrid-rag](https://hub.gazar.dev/llms-and-agents/lab-hybrid-rag/)
