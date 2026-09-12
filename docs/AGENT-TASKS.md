# Rozdělení práce mezi agenty

Aktuální autoritativní plán je [DELIVERY-PLAN.json](DELIVERY-PLAN.json). Obsahuje čtyři samostatné role A/B/C/D, cílové průchody, úkoly s `done: false`, přesné vlastnictví, závislosti a podmínky dokončení. Níže je původní rozdělení pro vznik boilerplate; při rozdílu v názvu agenta či vlastnictví platí nový plán.

## Zvolený základ

Používáme strukturu npm workspaces, oficiální WXT React/TypeScript starter pro extension a malý Hono Node server. Nevytváříme vlastní extension bundler ani nekopírujeme velkou aplikaci s chatem, účty a databází.

- [WXT React starter — GitHub](https://github.com/wxt-dev/wxt/tree/main/templates/react), MIT. Inicializace: `npx wxt@latest init apps/extension --template react --pm npm`.
- [WXT inline UI / ShadowRoot](https://wxt.dev/guide/essentials/content-scripts.html) — vzor pro vložení komponenty do stránky.
- [Hono Node starter — GitHub](https://github.com/honojs/starter/tree/main/templates/nodejs), MIT. Backend drží malou strukturu odpovídající tomuto starteru; není potřeba celý další framework.
- [Oficiální Chrome samples](https://github.com/GoogleChrome/chrome-extensions-samples), Apache-2.0 — reference pro browser API, nikoli druhý základ projektu.

WXT řeší build a vývoj rozšíření. Hono poskytuje HTTP rozhraní. Kontextové chování, agent a workspace akce jsou naše produktová práce. Při převzetí dalšího kódu zachovat jeho licenci.

## Struktura a vlastnictví

```text
apps/
  extension/       Agent A: browser, kontext, inline React UI, background transport
  api/             Agent B: HTTP API, orchestrace a provider adaptéry
packages/
  contracts/       Koordinátor: Zod schémata a TypeScript typy
docs/              Koordinátor; Agent C vlastní jen své QA poznámky
```

| Agent | Vlastnictví | První úkol | Akceptace |
| --- | --- | --- | --- |
| Koordinátor | root config, lockfile, contracts, README, integrace | Založit workspace, zmrazit kontrakty, instalovat a spojit změny | Jeden install, build a typecheck pro celek; ověřený API listener. |
| A — extension | `apps/extension/**` | WXT starter, aktivace na stránce, editable kontext, research/review/save karta | Vložená karta na testovacím profilu; správné stavy a zrušení starého návrhu po navigaci. |
| B — agent/backend | `apps/api/**` | Hono API, autentizace, validace, demo tok; následně OpenAI + Exa | Reálný brief se zdroji po napojení klíčů; chybějící integrace nikdy tiše nepřejde na demo. |
| C — ověření | `docs/QA-NOTES.md`, později vyhrazené `tests/e2e/**` | Reprodukční postup pro načtení extension a průchod; test chyb a změny profilu | Oddělený důkaz scaffold/demo a živých integrací, stručné bug reporty s reprodukcí. |

Maximálně čtyři současně včetně koordinátora. Agent C začne ověřovat hotové části, jakmile jsou dostupné. Zápisy do stejných souborů neparalelizovat.

## Pořadí dalších implementací

1. Koordinátor zmrazí kontrakty; A a B pracují souběžně na demo toku. Ten umožňuje ladit UI bez klíčů.
2. B nahradí pouze research adaptér skutečným OpenAI agentem s Exa nástrojem. A mezitím ověří skutečný profil a doplní cílenou extrakci. C ověřuje UI a chybové scénáře.
3. B dokončí research a předá koordinátorovi `apps/api/src/adapters/ambiguous.ts` jako výhradní vlastnictví pro Ambiguous integraci. Tento soubor nevytvářet souběžně dvěma agenty. Koordinátor ověří skutečné task schéma a read-back v určeném demo workspace, až to bude součástí zadané integrační práce.
4. Spojit živý tok, provést jeden skutečný průchod, opravit chyby, připravit video. Kontakt/CRM teprve potom.

Žádný agent nemá blokovat všechny ostatní čekáním na API klíč. Současně demo režim nesmí být prezentován jako dokončené P0.

## Předávací kontrakt

Autoritativní schémata jsou v `packages/contracts/src/index.ts`.

| Rozhraní | Vstup / výstup |
| --- | --- |
| `GET /ready` | Dostupnost lokálního serveru, režim a stav integrací; žádná tajemství. |
| `POST /api/research` | `ResearchRequest` → `ResearchBrief` |
| `POST /api/tasks` | `CreateTaskRequest` → `TaskResult` |
| API chyba | `{ "error": "readable message" }` a odpovídající HTTP status |

`contextId` váže výsledek ke konkrétnímu kontextu. `requestId` identifikuje pokus o zápis a při opakování zůstává stejný. `mode: demo | live` musí přežít celý tok až do UI. V demo režimu `url: null` znamená, že žádný externí workspace záznam neexistuje.

## Prompt pro spuštění dalšího agenta

Předej mu konkrétní řádek vlastnictví z tabulky, cíl, schémata a požadovaný důkaz. Například:

> Vlastníš pouze apps/extension. Nejsi v checkoutu sám, nepřepisuj změny ostatních. Napoj inline kartu na existující API podle packages/contracts. Neinstaluj balíčky na rootu a neměň lockfile. Uživatel musí vidět demo/live režim, chybu a editovatelný návrh. Ověř build a popiš skutečně provedený browser průchod. Změnu kontraktu nejprve domluv s koordinátorem.

Odevzdání každého agenta: změněné soubory, co funguje, co zbývá, provedené kontroly, blokující závislosti. Nepředávat pouze obecný seznam doporučení.
