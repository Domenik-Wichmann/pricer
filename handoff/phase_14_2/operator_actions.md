# Operator Actions

## Purpose
Phase 14.2 is implemented in code. Human review decisions can now be recorded internally, but they are not automatically applied to canonical product grouping yet.

## Ordered steps
1. Use the human decision helper only for reviewed queue fingerprints where an operator has inspected the evidence.
2. Keep review notes concise and evidence-based so later application audits can explain why a human decision outranks an LLM decision.
3. Do not treat `merge` or `distinct` human decisions as live canonical state until Phase 14.3 defines the controlled application layer.
4. Before Phase 14.3, review a real sample of `reviewed_human`, `adjudicated_llm`, and `pending` queue records.
