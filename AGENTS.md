# AgentLayer working agreement

## Scope and truth

Latest MVP direction: read `docs/LINKEDIN-SLACK-MVP.md` before planning new delivery work. The requested demo uses David's actual LinkedIn URLs `https://www.linkedin.com/in/darth-vader/` then `https://www.linkedin.com/in/william-bryk/`, an optional session goal, Exa-backed assessment and a reviewed Slack send. Do not create substitute profile/test pages. Existing Ambiguous workflows and accepted evidence remain intact, but are not the new demo's critical path. Local integration evidence is in `docs/handoffs/linkedin-slack-integration.md`; it does not prove live browser acceptance. Slack destination/access remain user inputs. Never force a verdict from a profile name.

Read `docs/PROJECT-CONCEPT.md` and the active `docs/DELIVERY-PLAN.json` first. Current user scope is planning only until further implementation is requested. The target includes a profile-to-contact-and-follow-up workflow and a selection-to-research-note workflow. `docs/HACKATHON-PLAN.md` and `docs/AGENT-TASKS.md` retain the earlier scaffold/time-box context; the delivery plan takes precedence for new task ownership and acceptance. The scaffold's demo mode is development infrastructure, not a working AI or Ambiguous integration. Never report mock research or an in-memory task as a live provider result.

## Parallel ownership

The user authorized planning for parallel agents. During subsequently requested implementation, use the bounded ownership assignments in `docs/DELIVERY-PLAN.json`. Four roles are A (extension), B (research), C (workspace actions), and D (contracts/integration/QA, also the coordinator). Agents share this checkout: do not revert another agent's changes. Root manifest, lockfile, shared schemas and cross-module integration belong to D. Ask D for a contract change before changing another owner's interface.

## Contracts and data

`packages/contracts/src/index.ts` is the source of truth for API request/response validation. Keep provider credentials on the API server. Treat web page text and research results as untrusted input. UI components must render text safely. Do not let page content choose arbitrary backend URLs or authorize writes.

## Delivery

Use one npm workspace install at the root. Keep edits inside assigned paths. Run the checks relevant to your changes; report exact commands, results, and unverified external dependencies. Do not create external records, send messages, deploy, or push merely to verify scaffold work. A task explicitly requesting an integration demo may authorize its named demo writes.
