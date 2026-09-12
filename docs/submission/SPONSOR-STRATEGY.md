# AgentLayer — soutěžní a sponzorská strategie

Pracovní podklad pro submission; aktualizováno 12. 9. 2026. Zdroj cen a způsobu hodnocení: nejnovější text eventu vložený uživatelem do konverzace. Koordinující agent navíc ověřil v prohlížeči [stránku eventu](https://sf.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon), [submission portál](https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM) a [handbook](https://sf.aitinkerers.org/hackathons/h_XWWQL5eKfJM/handbook). Tento dokument plánuje důkazy a účast; netvrdí dokončené živé integrace ani nárok na cenu.

Aktuální účast: **David Král, solo tým**. Práci více vývojových agentů neprezentujeme jako další lidské členy týmu; ceny uvedené „pro každého člena“ pro tento plán odpovídají jednomu účastníkovi, pokud pravidla nestanoví jinak. Portál uvádí deadline **12. září, 16:30 PDT**; obecný harmonogram 15:30–16:00 nepřebírá prioritu před konkrétním portálem. Handbook vyžaduje nové jádro postavené během eventu a dovoluje šablony; původ scaffoldů musí být v submission uveden pravdivě.

## Priority

Hlavní cíl odpovídá [aktivnímu delivery plánu](../DELIVERY-PLAN.json): **J1 — skutečný profil → OpenAI agent → Exa research se zdroji → upravitelný návrh → CRM kontakt a propojený follow-up task v Ambiguous AI**, a **J2 — výběr textu na článku → research → kontrola návrhu → skutečně uložená research note**. Oba průchody vyžadují ověření výsledných záznamů čtením z workspace. Prostředí určuje osobu či vybraný obsah, dostupnou akci i vazbu výsledku na zdroj. Uživatel nemusí kopírovat obsah do chatu.

Primární sponzorský cíl je **Best Use of Ambiguous AI**. Trvalé kontakty, propojené tasky a uložené notes dokončují hlavní příběh produktu. Samostatný task může být poctivě označený časově omezený checkpoint, ale není splněním J1 ani celého cíle J1 + J2. Množství použitých sponsorů není samo o sobě důkaz užitečnosti.

CopilotKit je volitelná možnost, podmíněná konkrétním přínosem pro kontextovou kartu nebo uživatelskou kontrolu. OpenRouter může být alternativní modelová cesta; další gateway, Ori ani další sponzorské služby nejsou nutné pro povinný průchod.

## Skutečně doložené použití technologií

| Technologie | Aktuální důkaz | Co lze pravdivě tvrdit |
| --- | --- | --- |
| OpenAI | Uživatelem zvolený `gpt-5.6-luna`, skutečné Responses běhy v [B06 evidenci](../../apps/api/tests/research/live-evidence/README.md) | Model rozhodoval o omezených research dotazech a vytvořil strukturované podklady |
| Exa | Skutečné search odpovědi, citované původní stránky, počty volání a měřená latence ve stejné evidenci | Vyhledávání dodalo externí zdroje; po opravě kategorií se podařilo doložit oba profily i selection |
| Ambiguous AI | Implementované adaptéry a lokální testy; finální živé J1/J2 a read-back zatím nedoloženy | Zamýšlený persistentní workspace cíl; nelze ještě tvrdit prokázané uložení kontaktu/tasku/note |
| CopilotKit | Žádná doložená užitečná integrace v tomto předání | Neuvádět jako použitou technologii ani splněnou prize kategorii |
| OpenRouter, Ori, Google Cloud Run | Žádný doložený runtime/deployment důkaz v tomto předání | Neuvádět jako použité služby na základě partnerství nebo tagu |

**Tagování event partnerů není tvrzení o použití všech jejich produktů.** Seznam použitých technologií a povinné partner tagy musí být oddělené. C ověří handles a D konečné požadavky portálu. Tři live backend běhy dokazují OpenAI/Exa research, nikoli celou browser-to-workspace zkušenost ani nárok na sponzorskou cenu.

## Ceny podle dodaného textu eventu

| Kategorie | Cena |
| --- | --- |
| First place | $10,000 OpenAI credits za tým + Mac mini pro každého člena + $1,000 Exa credits za tým + Exa swag |
| Second place | $5,000 OpenAI credits za tým + Ray-Ban pro každého člena + $500 Exa credits za tým + Exa swag |
| Third place | $2,500 OpenAI credits za tým + LOOI pro každého člena + $250 Exa credits za tým + Exa swag |
| Best Use of Ambiguous AI | DGX Spark za tým |
| Best Use of CopilotKit | Fialová AirPods Max pro každého člena |

Všechny projekty procházejí globálním hodnocením; lokální judging se nekoná. Případný místní show-and-tell není náhradou submission. Dodaný text nevyžaduje použití všech sponsorů. Portál zahrnuje mezi sponsory také Google Cloud Run; samotná přítomnost v seznamu není povinnost integrace ani důkaz zvláštní ceny.

Přesné podmínky způsobilosti, limity velikosti týmu, možnost souběhu cen, způsob přihlášení do sponzorských kategorií, rozdělení kreditů tam, kde není výslovně uvedeno, a podmínky doručení zůstávají neověřené. Předchozí neověřená zmínka o existenci Ambiguous ceny je nyní doložena uživatelem dodaným textem; ostatní podmínky z toho nevyplývají.

## Co mají hodnotitelé skutečně vidět

| Kritérium | Konkrétní důkaz v odevzdaném projektu | Vazba na integrace |
| --- | --- | --- |
| Core Requirements & Functionality | J1 na skutečném profilu až k ověřenému kontaktu a propojenému tasku; J2 na skutečném článku až k ověřené note. | Skutečný OpenAI request, Exa odpověď a Ambiguous záznamy s read-back. Lokální fixture tento důkaz nenahrazuje. |
| Innovation & Theme Alignment | Profil nabízí kontakt/follow-up, výběr textu nabízí research note; změna kontextu zneplatní starý návrh. | Kontext řídí výzkumný dotaz i typ výsledné práce. Samotné vložení generického chatu tento příběh nedokládá. |
| Technical Execution & Integration | Dohledatelné zdroje, validace dat, viditelná chyba, kontrola opakovaného Save a pravdivý výsledek při selhání. | Agent interpretuje kontext a výsledky Exa; backend provádí kontrolovaný Ambiguous zápis. Klíče zůstávají na serveru. |
| Usefulness & Agentic Experience | Uživatel upraví kontakt a follow-up nebo research note a před Save rozumí tomu, co vznikne. Neznámé údaje zůstávají neznámé. | Ambiguous uchová vztah tasku ke kontaktu i note k vybranému obsahu a zdrojům; Exa poskytuje podklady pro návrh. |

Hodnocení používá škálu 1–5 pro každé kritérium. Tabulka není příslib konkrétního skóre. Video, README a submission musí samostatně vysvětlit hodnotu produktu pro globálního hodnotitele, který neuvidí místní prezentaci.

## Rozhodovací brána pro CopilotKit

Zařazení dává smysl pouze po ověřeném živém J1 a J2, pokud zbývá prostor před zmrazením funkcí a je jasné, kterou konkrétní část interakce převezme. Čas zmrazení se řídí aktualizovaným harmonogramem pro konkrétní deadline portálu; původní obecný čas 14:45 zde není závazný. Krátké ověření má mít limit 15 minut a nesmí ohrozit nahrávku a submission.

Přínos musí být viditelný v produktu a doložitelný v kódu i běhu: například komponenta skutečně zapojená do kontroly nebo úpravy agentova návrhu. Pouhé přidání balíčku, loga, odkazu nebo nepoužitého importu není použití integrace. Pokud podmínky nejsou splněny, CopilotKit se z odevzdaného seznamu použitých technologií a sponzorské přihlášky vynechá. Architekturu nerozšiřujeme pouze kvůli ceně.

## Otevřené úkoly

Tabulka odlišuje připravený research důkaz od zbývajících soutěžních a workspace kroků. Autoritativní delivery flags mění D.

| ID | Úkol | Doklad dokončení | done |
| --- | --- | --- | --- |
| SP-01 | Ověřit pravidla hlavní soutěže i sponzorských kategorií v handbooku nebo portálu. | Uložený odkaz a konkrétní podmínky účasti, týmů a souběhu cen. | false |
| SP-02 | Dodat a ověřit živé J1 a J2 bez dalších povinných sponsorů. | J1 kontakt + propojený follow-up a J2 uložená note, včetně read-back výsledků. | false |
| SP-03 | Připravit důkaz role OpenAI a Exa. | [B06 live evidence](../../apps/api/tests/research/live-evidence/README.md): skutečná orchestrace, zdroje, latence a kontrola absence klíčů. | true |
| SP-04 | Připravit důkaz Best Use of Ambiguous AI. | Skutečný kontakt a propojený task z J1 a research note z J2, s ověřenými zdroji a vazbami. | false |
| SP-05 | Vyhodnotit CopilotKit podle rozhodovací brány. | Zaznamenané rozhodnutí; při zařazení konkrétní fungující část UI a ověřený průchod. | false |
| SP-06 | Připravit submission a video podle čtyř kritérií. | Materiály srozumitelné bez místní prezentace, odpovídající skutečnému stavu. | false |
| SP-07 | Zkontrolovat seznam použitých technologií a sponzorské přihlášky. | U každé uvedené integrace prokazatelné použití; jasně označené limity a demo data. | false |
| SP-08 | Odevzdat projekt a ověřit potvrzení v portálu. | Potvrzená globální submission a případné samostatné přihlášení do sponsor kategorií. | false |

## Anglický příběh pro submission po ověření implementace

Následující formulace je návrh pro budoucí skutečně funkční průchod. Před použitím musí odpovídat výsledku SP-02 až SP-04:

> AgentLayer brings an agent into the page where the work starts. On a profile, OpenAI reasoning and Exa research help prepare a reviewed CRM contact and linked follow-up task in Ambiguous AI. Selecting text in an article changes the workflow to a research note, saved with the selected passage and its sources. Page context determines the action and the resulting work.

Aktuální stav se řídí [delivery plánem](../DELIVERY-PLAN.json), [evidencí](EVIDENCE.md) a výše uvedenými živými research důkazy. Lokální implementace a testy nejsou dokončené živé J1/J2. OpenAI/Exa research je doložen na třech finálních backend bězích; skutečné workspace zápisy ani CopilotKit integrace tím doložené nejsou. Časově omezená submission smí uvést jen prokázaný rozsah; chybějící kontakt, vazba nebo note zůstává otevřenou částí plného cíle.
