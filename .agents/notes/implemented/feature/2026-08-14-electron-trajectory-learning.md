# Agent Note: Electron Trajectory evidence-based learning mode

Status: implemented

English | [中文](2026-08-14-electron-trajectory-learning.zh.md)

## Problem

Trajectory exposes the event order and raw details of an Agent run, but record tags such as System, Context, Request, Tool, Subtool, and Compacted do not teach a non-engineering user how the agent loop uses them. A learning view must explain observable Agent mechanics without inventing task-specific motives, presenting reasoning content as an authoritative decision record, or claiming access to hidden model reasoning.

## Decision

The Electron [Trajectory presentation layer](2026-08-14-electron-trajectory-localization.md) adds a **Step-by-step learning** toggle. Learning mode marks selectable Request boundaries, timeline steps, and ledger records with hover, focus, and selected states. Clicking or focusing one of them updates three explicit fields for that exact selection: what happened, the relevant Agent concept, and where to verify the statement in the original Trajectory details.

Explanations come from a deterministic catalog keyed only by the rendered kind, index, running state, error state, visible label, and tool name. The panel includes the selected index, status, summary, and tool name when the interface provides them, so selecting `Tool: bash` differs visibly from selecting a model Request. The catalog teaches the relationship among user input, model-visible context, system prompts, model requests, assistant messages, top-level tools, nested Subtools, and context compaction. It does not read or summarize payload contents. A persistent disclaimer states that the panel uses visible events and interface state and neither displays nor guesses hidden model reasoning.

The learning panel remains inside `apps/electron` and does not modify the upstream Trajectory package or session data. Raw Trajectory remains the evidence source; the panel links every explanation back to the details the user can inspect.

## Alternatives considered

**Generate every explanation with an LLM.** Rejected because it would add latency, cost, nondeterministic claims, and another transfer of potentially sensitive trajectory data. The stable record taxonomy already supports the required foundational teaching.

**Present assistant reasoning content as the explanation.** Rejected because recorded reasoning content is model output, not a complete or authoritative account of runtime control flow, and hidden reasoning is unavailable. Users can still inspect recorded reasoning in the original details when the provider supplies it.

**Add the teaching catalog to the upstream Trajectory package.** Rejected because this is a local Electron learning requirement and the user explicitly limited the change to the shell. Keeping the catalog in the managed Electron overlay avoids changing the official Web composition.

## Consequences

A product user can learn core Agent mechanics one real step at a time while retaining a direct path to the original evidence. Explanations are immediate, keyless, reproducible, and independent of the selected Trajectory language.

The catalog explains record classes rather than the unique reason for a particular task action. New upstream record kinds remain available in raw Trajectory but receive no learning card until the Electron catalog classifies them. Focused DOM tests cover selection, failure status, language isolation, and the hidden-reasoning disclaimer; packaged verification repeats the interaction against the built renderer.
