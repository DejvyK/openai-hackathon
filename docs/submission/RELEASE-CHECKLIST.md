# AgentLayer — submission balíček a finální odevzdání

Stav: připravené lokální podklady; **nic není tímto dokumentem publikované nebo odevzdané**. Autoritativní úkoly SA/SB/SC/SD jsou v [DELIVERY-PLAN.json](../DELIVERY-PLAN.json). Každý zdejší finální výstup zůstává `done:false`, dokud není ověřený.

## Přehled artefaktů

| Pole | Připravený obsah / místo | Chybí pro dokončení | Stav |
| --- | --- | --- | --- |
| Project title | AgentLayer | Vložit a ověřit v portálu | `done:false` |
| Team | David Král — solo builder | Potvrdit tým/přijetí v portálu | `done:false` |
| Written description | [DRAFT.md](DRAFT.md) | Finální claim audit podle živých výsledků | `done:false` |
| Public GitHub | Kandidát z remote: https://github.com/DejvyK/openai-hackathon | Finální SHA, public visibility, clean-clone proof | `done:false` |
| Two-minute video | [VIDEO-PLAN.md](VIDEO-PLAN.md) | Natočit, exportovat, nahrát, ověřit URL | `done:false` |
| Public social post | [SOCIAL-POST.md](SOCIAL-POST.md) | Účet, handles, finální text, publikace, permalink | `done:false` |
| Evidence | [EVIDENCE.md](EVIDENCE.md) | Živé důkazy a návaznost na stejný commit | `done:false` |
| Portal | https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM | Týmový formulář, submission ID a potvrzení | `done:false` |

Repozitář byl následně otevřen bez přihlášení přes Playwright: GitHub zobrazuje **Public**, dva commity a starší scaffold README. Veřejnost je tedy doložená, ale finální lokální změny nejsou tímto ověřené jako publikované. SD03 zůstává otevřený do ověření finálního SHA.

## Čtyři agenti a jeden lidský týmový člen

- **A:** scénář a nahrávka UI, export dvouminutového videa (SA01–SA02).
- **B:** anglický popis, claim audit, sponsor strategie (SB01–SB03).
- **C:** social draft, správné handles a Ambiguous evidence (SC01–SC03).
- **D:** pravidla, repo, nahrané odkazy, portál a finální audit (SD01–SD06).

Scénář, popis, tagy a checklist lze připravovat souběžně s implementací. Nahrávání úspěšné live cesty čeká na její skutečné ověření. Publikace čeká na konkrétní finální text/obsah, účet a odpovídající zadání; do té doby musí být připravený reviewovatelný výstup.

## Repo — SD02/SD03

Lokální dílčí audit 12. 9. 2026: branch `main`, HEAD `bf17302a0a75273f2f639e3408b8c1e35d580747`, dva dosažitelné commity, necommitnuté změny. `node tests/e2e/release-audit.mjs` zkontroloval 131 kandidátních souborů a dosažitelné commit diffy; aktuálně nakonfigurované credential hodnoty nebyly nalezeny. `.env` je ignorovaný a nesledovaný. Report `.agentlayer/release-audit.json` neobsahuje hodnoty klíčů. Rozsah je pouze přesná shoda aktuálně známých hodnot, nikoli obecný audit všech tajemství/soukromých dat. Finální clean-clone a publikace stále chybí; SD02/SD03 nejsou tímto hotové.

- `done:false` — Zapsat přesnou branch a commit SHA, zahrnout pouze zamýšlené změny.
- `done:false` — Prověřit publikované soubory i historii na klíče a neveřejná data; žádné hodnoty secretů do reportu.
- `done:false` — README má setup, `.env.example` bez hodnot, spuštění, testy, architekturu, omezení a správné demo/live rozlišení.
- `done:false` — Zachovat licence a původ starteru; uvést, co David vytvořil během hackathonu.
- `done:false` — Reprodukce z čistého checkoutu/profilu projde dokumentovanými kroky.
- `done:false` — Připravený finální commit publikovat v autorizovaném rozsahu; případnou změnu visibility řešit výslovně.
- `done:false` — Otevřít repo/README/kód bez přihlášení, uložit public URL a SHA.

## Video a social — SA02/SD04/SC02

- `done:false` — Nahrávka ukazuje skutečnou funkci a odpovídá ověřenému commitu; cuts nezastírají výpadek nebo simulaci.
- `done:false` — Export má dvě minuty a je čitelný/slyšitelný; formát a hosting odpovídají portálu.
- `done:false` — Video link funguje bez našeho přihlášení a přehraje se celé.
- `done:false` — Social přesně popisuje hotové funkce, používá Davida jako autora a neprezentuje agenty jako členy lidského týmu.
- `done:false` — Ověřit handles na zvolené platformě pro požadované event partnery včetně aktuálního portalového seznamu.
- `done:false` — Publikovat finální zadaný post; ověřit veřejný permalink a předat jej D.

## Portál — SD01/SD05/SD06

- `done:false` — Ověřit přihlášení, přijetí, tým AgentLayer / David Král a přesný formulář.
- `done:false` — Znovu přečíst týmový deadline. SF portál při ověření: **12. 9. 16:30 PDT / 13. 9. 01:30 CEST**; interní target 16:00 PDT.
- `done:false` — Vyplnit title, written description, public repo, two-minute video a social post plus skutečná další pole formuláře.
- `done:false` — Pokud existuje samostatná sponsor nominace, vyplnit Ambiguous podle skutečného přínosu; CopilotKit pouze po ověřené integraci.
- `done:false` — Zkontrolovat preview a všechny odkazy; finální odeslání provést v konkrétně zadaném rozsahu.
- `done:false` — Uložit submission ID/URL, čas a confirmation; následně otevřít odevzdaný projekt a zkontrolovat obsah.

## Finální záznam

```yaml
done: false
project: AgentLayer
team_members: [David Král]
repository_url: https://github.com/DejvyK/openai-hackathon
commit_sha: null
video_url: null
video_duration_seconds: null
social_platform: null
social_account: null
social_url: null
submission_url: null
submission_id: null
submitted_at: null
public_links_verified: false
```

Pokud termín předběhne plný cíl, odevzdat lze jen pravdivě popsaný funkční rozsah. Produktové J1/J2/gates tím automaticky nepřecházejí do done. Široký plán ani lokální fixture nenahradí ostré demo.
