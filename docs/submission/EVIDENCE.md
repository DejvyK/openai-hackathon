# AgentLayer — tvrzení a jejich důkazy

Pracovní list pro finální copy/video. Základní zdroj nynějších výsledků: [DRAFT.md](DRAFT.md) a handoffy A/B/C/D. Tento dokument neopakuje ani neprovádí jejich testy; živé tvrzení se přijímá až po konkrétním důkazu.

| Tvrzení pro porotu | Potřebný důkaz | Kam jej zapsat | Stav |
| --- | --- | --- | --- |
| Agent funguje uvnitř existující stránky | Reálná URL, browser verze, native toolbar, inline UI | A08 + D06 | `done:false` |
| Kontext mění akce | Profil nabídne contact/follow-up, selection nabídne note | J1/J2 záběry stejného buildu | `done:false` |
| Research skutečně používá OpenAI a Exa | Redigovaný run záznam, reálné sources, claim→source | B06; live-evidence/README.md a broad-search-report.json | `done:true` — backend research, G2 |
| Uživatel kontroluje, co se uloží | Upravený návrh, explicitní Save, odpovídající payload/read-back | A05 + C07 | `done:false` |
| Ambiguous vytváří skutečnou práci | Kontakt + linked task + optional note, ID, skutečný read-back | C07 + SC03 | `done:false` |
| Neúspěch nebo retry nemate uživatele | Partial/unknown, stejný requestId, ověření bez duplicit | C06 + D06 | `done:false` |
| Kód lze hodnotit a spustit | Veřejný commit + clean-clone postup a výsledky | SD03 | `done:false` |

Pro každý důkaz uložit: datum, commit, prostředí, vstupní scénář, výsledek, zda jde o fixture nebo live, cestu k bezpečnému screenshotu/záznamu a omezení. Zdrojové evidence ID ukládat lokálně; nepřenášet tokeny a nesouvisející workspace data do veřejného videa/repa.

## Již dostupný dílčí důkaz — backend research

[Research evidence README](../../apps/api/tests/research/live-evidence/README.md) a [broad-search-report.json](../../apps/api/tests/research/live-evidence/broad-search-report.json) obsahují tři zaznamenané živé backend běhy z 12. 9. 2026: Simon Willison, Andrej Karpathy a vybraný text W3C. Vstupy byly připravené ručně, nikoli získané během nahraného ovládání extension. Report uvádí `transport: live`, čas `2026-09-12T19:57:14.340Z` a postupně 3/6/1 claims a 4/4/1 sources.

[Draft validation](../../apps/api/tests/research/live-evidence/draft-validation.json) eviduje tři odpovídající validované návrhy a u všech `workspaceWrites: false`. Je to záznam validace, nikoli uložené workspace objekty nebo důkaz vydání návrhu HTTP serverem. Počty sources neznamenají nezávislé potvrzení: všechny přijaté claims odkazují v daném běhu na `s1`.

Tento podklad lze pravdivě prezentovat jako tři zaznamenané live research běhy. D následně přijal B01–B06 a G2 v delivery plánu. Ostatní produktové gates zůstávají otevřené. Zvlášť zbývá browser-to-workspace důkaz. Aktuální scénář je v [VOICEOVER.md](../production/story/VOICEOVER.md); existence scénáře sama neznamená hotové video.

Další [D report](../../tests/e2e/evidence/live-research-api.json) ověřil skutečné providery přes autentizovaný in-process API handler: profil HTTP 200 za 13 036 ms, ambiguous a žádná přijatá tvrzení; selection HTTP 200 za 7 021 ms s jedním podloženým tvrzením. Zachovat i tento méně úspěšný profilový výsledek. Probe neovládal browser a provedl nula workspace zápisů.

Finální text může používat přítomný čas o kompletních live funkcích jen po přijetí odpovídajícího řádku; dílčí důkazy musí uvádět svůj omezený rozsah. Lokální testy označovat jako lokální/syntetické. Pro video použít větev scénáře, kterou skutečné výsledky podporují.

## Live persistence and repaired optional date

C dokončil výslovně schválené třízáznamové syntetické demo v workspace AgentLayer. [Výsledek](../../apps/api/tests/workspace/live-demo-result.json) dokládá kontakt `beaea8e2-cc41-49cb-8ad0-b84d3d382c64`, navázaný task `978fc28f-2dcb-4ae0-8b87-bbf7dbf90f19` a dokument `eb13605b-a8c3-41ef-bbd2-4f194e438ec0`, všechny načtené zpět. Replay v novém procesu měl nula POST pokusů. Vyvolaná partial chyba byla lokální před odesláním tasku, nikoli výpadek providera. Nešlo o browser průchod ani live research těchto syntetických vstupů.

D found that the approved dueAt null was persisted as an SLA date: [original audit](../../tests/e2e/evidence/optional-date-audit.json). C subsequently fixed the mapping and read-back and restored the exact approved test task to no date: [live repair](../../apps/api/tests/workspace/live-no-date-repair.json). The repair first revalidated the old result as unknown, then used one documented PATCH due_date:null and verified null by GET. Failure retains the known ID and unknown status; it does not create another task. Full browser J1/J2 and record-link acceptance remain separate D gates.

Po zapojení reaktivních HTTP endpointů prošlo 59 API/research/workspace/session testů a 9 kontraktových testů, společný typecheck rovněž prošel. Toto lokální ověření nepokrývá zachování prázdného data v živém provideru ani skutečné přerušení Codex turnu. Codex runner dosud není připojený.

## Ambiguous prize: verified collaboration evidence (SC03)

The approved synthetic integration test created exactly one contact, one linked follow-up and one document: three HTTP 201 responses followed by HTTP 200 read-back. Replaying the same requests in a fresh process made zero POST attempts. Partial failure was injected locally before task dispatch, not observed as a provider outage. Record IDs and raw evidence are linked above. The original date mismatch remains visible in historical evidence and is superseded by the explicit repair report.

The user copied the synthetic note's content, selection and source URL from the open Ambiguous document and confirmed it displays correctly. This is user-observed document UI evidence; it does not establish automated deep-link navigation or contact/task UI display. No screenshot or video capture is claimed.

Suggested evidence-aligned explanation for B/A: ?AgentLayer carries a reviewed action into a shared workspace: a contact, its linked follow-up and a persistent note. In our approved integration test, all three records were created and read back from Ambiguous. Replaying saved requests in a fresh process issued no additional create requests. The user also confirmed that the note displayed correctly. These explicitly synthetic test inputs are separate from live research and full browser-journey evidence.?

The collaboration benefit is traceable workspace work with preserved context, controlled retries and explicit uncertainty. Approval for this test occurred in conversation, not a recorded extension Save flow. Actual review/save footage and confirmed public links remain inputs for A; do not claim a complete prize gate from this API test alone.
