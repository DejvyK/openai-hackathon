# AgentLayer — Project Concept

**Every app becomes agent-native.**

## Vision

AgentLayer is a browser-based AI layer that turns existing web applications into contextual agent environments without requiring those applications to integrate AI themselves.

It understands the page the user is working on and presents relevant actions beside the content. The environment determines the available actions, the evidence the agent uses, and where the results belong.

On a professional profile, those actions can include researching the person and company, preparing a CRM contact, and creating a follow-up. On a GitHub issue, a future adapter could investigate the reported problem and prepare a work item. Selected text on other supported pages could become a sourced note or research request.

These are directions for the product; the hackathon prototype targets one profile workflow. “Every app” is the vision, not a claim of universal support in the prototype.

## First user and problem

A founder or business development person discovers a relevant person online. Turning that discovery into useful work currently involves copying profile details, searching for the company, taking notes, and entering a follow-up elsewhere.

AgentLayer keeps the profile as the working context and carries its evidence through to the resulting workspace action.

## Hackathon experience

1. Open a supported LinkedIn profile and activate AgentLayer.
2. A compact action appears beside the profile header: **Research & prepare follow-up**.
3. AgentLayer extracts visible name, role, company and profile URL. The user can correct the detected context.
4. The agent uses Exa to research the person and company, checks whether the results match, and prepares a short brief with source links.
5. An inline card shows the brief and an editable proposed contact and follow-up. Unknown facts remain empty; a suggested next step is clearly a suggestion.
6. The user saves the reviewed proposal to Ambiguous AI.
7. AgentLayer shows the actual result and a way to open it in the workspace.

Target outcome: **profile → sourced research → CRM contact + follow-up task**.

Minimum acceptable outcome if contact creation is unavailable: **profile → sourced research → real follow-up task containing the profile reference and research**. This reduced scope must be stated honestly in the demo.

## Why the environment matters

The user does not need to describe the current person, paste the profile, or choose from unrelated tools. The action is attached to the relevant entity, and the proposal retains that entity's source URL. Navigating to a different profile invalidates the previous proposal so it cannot accidentally be saved for the wrong person.

The agent contributes research planning, identity matching, evidence synthesis and a proposed next step. Application code controls which operations are available and executes approved writes. The MVP uses a small set of designed interface components selected by context.

## Proposed architecture

```text
Visible profile + user activation
    → extension: extract context and show inline action
    → backend: validate context and run bounded agent workflow
    → Exa: retrieve research evidence
    → agent: produce sourced brief and action proposal
    → inline review and user save
    → backend: execute Ambiguous AI action
    → inline result + workspace record
```

The implementation plan recommends TypeScript, a Chrome extension and one small backend. OpenAI is the default reasoning integration; OpenRouter is a possible alternative gateway, selected before implementation. Exa supplies research, while Ambiguous AI is the persistent action/workspace destination.

Ori is an optional development/evaluation aid. It is not a dependency of the browser experience. We will not attempt to fit every sponsor into the architecture.

## Success and boundaries

A successful submission demonstrates a real profile-to-workspace flow, explains how the page changes agent behavior, and shows the saved result. It includes useful loading, error and partial-success states.

The hackathon scope excludes universal website support, autonomous outreach, email sending, GitHub issue resolution, a general browser-control agent, a custom CRM, and a production account system.

This document describes intended behavior, not implemented capabilities. The accompanying plan records integration uncertainties and the delivery checkpoints.
