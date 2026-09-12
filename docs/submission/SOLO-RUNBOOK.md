# AgentLayer — solo delivery

Jediný lidský člen týmu: **David Král**. Agenti jsou vývojové nástroje; v přihlášce ani prezentaci se nepočítají jako další soutěžící.

Oficiální stránka dodaná Davidem: https://sf.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon

Produktové úkoly, vlastnictví souborů a acceptance zůstávají v [DELIVERY-PLAN.json](../DELIVERY-PLAN.json). Tento dokument doplňuje organizaci práce pro jednoho člověka; nemění stav implementace.

## Čtyři nezávislé pracovní role

| Role | Hlavní odpovědnost | Souběžně připravit k odevzdání | Předání |
| --- | --- | --- | --- |
| A — browser | Kontext stránky a inline UI | Scénář a seznam záběrů | Skutečný průchod UI, záběry a omezení |
| B — research | Research se zdroji a shoda identity | Anglický pitch, popis, kontrola tvrzení | Doložená tvrzení a finální text |
| C — workspace | Kontakt, navázaný task a poznámka | Důkazy Ambiguous integrace, social draft | Identifikátory výsledků, ověření zápisů a návrh postu |
| D — integrace | Sdílené kontrakty, integrace, QA | Repo, checklist a kompletace submission | Jedna konzistentní verze kódu, textů a odkazů |

Každá role pracuje ve svém přiděleném rozsahu. Změny společných rozhraní slučuje D. Scénáře, texty a checklisty mohou vznikat před dokončením integrace; tvrzení o úspěchu a finální video až podle skutečného výsledku.

David soustředí pozornost na produktová rozhodnutí, přístupy k účtům, kontrolu finálního dema a odevzdání. Průběžné technické předávání řeší role D, aby čtyři pracovní proudy nevyžadovaly čtyři souběžné lidské kontroly.

## Pořadí dokončení

- `done:false` — Potvrdit přístup Davida k týmové přihlášce a deadline konkrétní registrace. Samotný odkaz na SF akci nepotvrzuje účast v SF.
- `done:false` — Dokončit a ověřit hlavní cestu profil → research → kontakt + follow-up. Druhou cestu vybraný text → poznámka ponechat v cílovém produktu a prezentovat jen po ověření.
- `done:false` — Zastavit přidávání funkcí a předat ověřený commit s popisem omezení.
- `done:false` — Podle tohoto commitu dokončit anglický popis a natočit dvouminutové video.
- `done:false` — Připravit veřejný repozitář a ověřit jeho reprodukovatelnost; doplnit veřejnou video URL.
- `done:false` — Doplnit Davidovu social platformu/účet, ověřit požadované tagy a připravit konkrétní post k publikaci.
- `done:false` — Ověřit veřejné odkazy, vyplnit portál a získat potvrzení odevzdání.

Předběžný harmonogram pro 4 h 15 min build okno: první 15 minut kontrakty a přístupy, dalších 120 minut paralelní práce, 60 minut integrace, posledních 60 minut stabilizace a záznam dema. Submission okno chránit pro odkazy a formulář. Jde o plán rozpočtu času, nikoli tvrzení o zbývajícím čase právě teď.

## Hotovo znamená

Funkční doložené demo, veřejný kód, pravdivý popis, dvouminutové video, veřejný social post a potvrzení portálu. Vytvořený draft sám o sobě neuzavírá odpovídající úkol. Podrobná evidence a finální pole jsou v [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

Pravidla a dříve zaznamenané časy viz [EVENT-REQUIREMENTS.md](EVENT-REQUIREMENTS.md). Opakovaný automatický fetch stránky a portálu v tomto průchodu vrátil HTTP 403; aktuální deadline proto nebyl znovu potvrzen.
