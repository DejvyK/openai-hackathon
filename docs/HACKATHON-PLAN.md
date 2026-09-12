# AgentLayer — plán hackathonu

Aktuální doplnění: solo tým David Král. SF portal cutoff je 12. 9. 16:30 PDT / 13. 9. 01:30 CEST, dle handbooku rozhoduje portál. Nové požadavky a způsobilost: [EVENT-REQUIREMENTS.md](submission/EVENT-REQUIREMENTS.md), kompletní odevzdání: [RELEASE-CHECKLIST.md](submission/RELEASE-CHECKLIST.md).

Aktualizováno: 12. 9. 2026. Podklad: koncept a pravidla soutěže vložené uživatelem do konverzace. Po sepsání plánu uživatel zadal přípravu boilerplate a rozdělení práce mezi agenty. Aktuální kostru a spuštění popisuje [README](../README.md), vlastnictví modulů [AGENT-TASKS](AGENT-TASKS.md). Demo scaffold není splněné živé P0.

## 1. Časový rámec a doporučení

Build podle dodaného programu běží **11:15–15:30, tedy 255 minut**. Submission má samostatné okno 15:30–16:00. Přesný čas místní akce je nutné potvrdit podle event page. Předchozí pracovní předpoklad 24–48 hodin tímto neplatí.

Plán počítá konzervativně s jedním vývojářem s AI asistencí. Je ambiciózní a podmíněný rychlým zprovozněním API. Doporučený závazek je **profil → research → skutečný task**. Kontakt + propojený follow-up je preferovaný výsledek, pokud první integrační ověření potvrdí jeho dostupnost.

Nejdůležitější produktový moment: uživatel je na profilu, AgentLayer nabídne odpovídající akci vedle jména a výsledek převede do práce. Prokazatelně fungující jeden průchod má přednost před počtem podporovaných aplikací.

## 2. Poznámky k soutěži

Téma: agent se objeví tam, kde lidé už pracují, komunikují nebo žijí; prostředí musí smysluplně zlepšovat jeho možnosti.

Dodané materiály uvádějí OpenAI jako marquee sponsor a CopilotKit, OpenRouter, Exa, Auth0, Ambiguous AI, Trigger.dev, Mozilla a Google Cloud Run jako sponsory. Použití všech sponsorů není povinné. Aktualizace: event page nyní potvrzuje Best Use of Ambiguous AI (DGX Spark pro tým) a Best Use of CopilotKit. Viz docs/submission/EVENT-REQUIREMENTS.md.

| Hodnoticí kritérium | Co konkrétně ukázat |
| --- | --- |
| Core Requirements & Functionality | Spustit rozšíření na skutečné podporované stránce a otevřít nově vytvořený záznam v Ambiguous AI. |
| Innovation & Theme Alignment | Akce vedle konkrétního profilu, automaticky předvyplněný kontext a zrušení starého návrhu při změně profilu. |
| Technical Execution & Integration | Reálné API, zdroje výzkumu, validace návrhu, ošetření chyb a částečného uložení. |
| Usefulness & Agentic Experience | Uživatel bez přepisování dat dostane použitelný follow-up, může návrh opravit a rozhoduje o uložení. |

Každé kritérium se hodnotí 1–5. Nelze slíbit skóre; tyto důkazy mají podpořit spolehlivou a srozumitelnou prezentaci.

## 3. Rozsah

### P0 — nezbytný dokončený průchod

- Chrome extension načtená lokálně; jeden podporovaný typ profilu.
- Aktivace uživatelem, jedna vložená akce a malá karta přímo u obsahu.
- Extrakce viditelného jména, role, firmy a URL, s možností opravy.
- Research přes Exa a krátký agentní brief se zdroji a návrhem follow-upu.
- Editovatelný návrh a tlačítko Save; skutečný task v Ambiguous AI.
- Viditelný průběh, chyba, možnost opakování a ověřitelný výsledek.
- Změna profilu nesmí ponechat aktivní návrh pro předchozí osobu.

### P1 — přidat pouze po funkčním P0

- CRM kontakt a propojení follow-upu, pokud to dostupné API dovolí a zbývá čas.
- Druhý kontext: vybraný text → research → task nebo note; znovu použít hotový tok. Tím lze lépe ukázat změnu akcí podle prostředí, ale není to podmínka odevzdání.

### Po hackathonu

GitHub adapter, další weby, historie, více workspace, OAuth/onboarding, model routing, plánované úlohy, týmová oprávnění a produkční distribuce extension.

## 4. Technická rozhodnutí pro rychlé MVP

**Frontend:** Chrome Manifest V3, TypeScript, content script a izolované styly vložené karty (navrženě Shadow DOM). Jednoduché pevné komponenty; adaptér určí kontext a povolené akce. Chrome dokumentuje přístup content scriptů k DOM a jejich izolovaný běhový svět. [Dokumentace](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

**Backend:** jeden malý TypeScript proces, lokálně pro demo. Klíče pouze na backendu v prostředí. Extension komunikuje přes background/service worker; lokální backend ověřuje párovací token, omezuje povolené volání a přijímá validovaný kontext. Přenos na server začíná akcí uživatele, nikoli plošným sběrem otevřených stránek.

**Agent:** výchozí návrh je OpenAI Agents SDK s jediným agentem a výzkumným nástrojem. SDK slouží k orchestrace modelu a nástrojů. Pokud starter kit z briefingu nabízí rychlejší ověřenou cestu, použít ji. [OpenAI Docs](https://developers.openai.com/api/docs/guides/agents/sdk)

**OpenRouter:** alternativní modelová cesta, nikoli druhý povinný runtime. Podporuje tool calling; nástroje vykonává aplikace. Vybrat jednu cestu během prvních 20 minut, případnou kompatibilitu se SDK ověřit krátkým testem. [Dokumentace](https://openrouter.ai/docs/guides/features/tool-calling)

**Exa:** jeden cílený research osoby a firmy; začít malým počtem výsledků. Agent může podle shody identity dotaz upravit, ale omezit počet tool calls a celkový čas. Výstupy musí zachovat URL zdrojů. Search API je veřejně dokumentované; klíč a funkční odpověď zatím nebyly ověřeny. [Dokumentace](https://exa.ai/docs/reference/search)

**Ambiguous AI:** action backend. Následný průzkum boilerplate získal [veřejnou OpenAPI specifikaci](https://app.ambiguous.ai/api/openapi.json): `POST /api/tasks` vyžaduje title (max. 255 znaků), podporuje description a contact_id a vrací `{task}`. Specifikace obsahuje také `POST /api/crm/contacts`. Konkrétní oprávnění, vytvoření a načtení záznamu v demo workspace zatím nebyly otestovány. Podrobnosti pro dalšího agenta jsou v `apps/api/src/adapters/README.md`; žádný živý adaptér zatím není implementovaný.

**Ori:** oficiální repozitář OpenRouter popisuje Ori jako harness pro coding agenty. Proto ho plán nezařazuje do produktového runtime. Případné evaly až po funkčním demu. [Oficiální popis](https://github.com/OpenRouterTeam/skills/blob/main/skills/install-ori-harness/SKILL.md)

Minimální datový tok: `PageContext → ResearchBrief → ActionProposal → ActionResult`. Kontext obsahuje URL a identifikátor verze; brief obsahuje tvrzení se zdroji; proposal obsahuje editovatelné položky; result obsahuje skutečná ID a stav každého zápisu.

Agent interpretuje kontext, vybírá výzkumný dotaz, hodnotí shodu osoby a navrhuje další krok. Backend validuje data a vykonává povolené zápisy po Save. Obsah webu je důkazní materiál, nemůže sám autorizovat nástroje nebo měnit instrukce. Nevymýšlet e-mail ani jiné chybějící údaje.

## 5. Harmonogram: 255 minut

| Čas | Práce | Výstup / rozhodovací bod |
| --- | --- | --- |
| 11:15–11:35 | Ověřit klíče a dostupný starter kit; reálný modelový request, Exa dotaz a vytvoření + načtení tasku v demo workspace. Prověřit kontakt. | Zvolená jediná modelová cesta a potvrzený workspace zápis. |
| 11:35–12:15 | Kostra extension + backendu; extrakce jednoho skutečného profilu; inline tlačítko/karta. | Uživatel vidí správné jméno a firmu přímo na stránce. |
| 12:15–13:00 | Agent + Exa, strukturovaný brief, zdroje, návrh follow-upu. | Živý profil vede ke skutečnému research výsledku. |
| 13:00–13:40 | Review, Save a Ambiguous zápis; ID a otevření výsledku. | Hotový P0 od začátku do konce. |
| 13:40–14:15 | Chyby, opakované kliknutí, změna profilu, chybějící údaje; kontakt pouze pokud je integrace jasná. | Spolehlivý hlavní tok a pravdivé stavy. |
| 14:15–14:45 | Ověření na třech profilech, opravy UI, záloha demo scénáře. | Zmrazení funkcí ve 14:45. |
| 14:45–15:30 | Finální průchod, nahrávka, README se spuštěním, anglický popis a submission podklady. | Materiály připravené před koncem build okna. |
| 15:30–16:00 | Vyplnit portál, ověřit odkazy a odevzdání. | Potvrzená submission. |

Pokud budou dva lidé: jeden vlastní extension/UI a druhý backend/integrace. Datové rozhraní domluvit na začátku. Ušetřený čas nejdřív použít na ověření a demo, potom na P1; harmonogram nepředpokládá zdvojnásobení rychlosti.

## 6. Pravidla pro zmenšení rozsahu

- **11:35:** nejasné CRM API → pokračovat taskem s profilem a briefem; kontakt odložit. Pokud nefunguje žádný Ambiguous zápis, vyžádat podporu sponsora a omezit diagnostiku na dalších 15 minut. Při trvalé nedostupnosti dodat research + export návrhu a výslovně uvést, že action integrace chybí; není to splněné P0.
- **12:15:** nestabilní LinkedIn DOM → použít výběr viditelného textu na reálném profilu a explicitně aktivovanou kartu. Pokud je nepřístupný celý web, přejít na dostupný veřejný profil; změnu uvést v demu. Lokální fixture je testovací pomůcka, není důkaz živé LinkedIn integrace.
- **13:40:** nedokončený průchod → zrušit P1 a veškerý další scope. Dokončit task a základní chyby.
- **14:45:** žádné nové funkce; pouze blokující opravy, ověření a příprava submission.

Pokud vznikne kontakt a selže task, UI ukáže částečný úspěch a opakuje pouze task. Po timeoutu zápisu nejprve zjistit, zda záznam vznikl; neopakovat slepě a nevytvářet duplicity. Držet identifikátor pokusu a vrácená ID alespoň pro aktuální demo session; produkční garance přes restart je další práce.

## 7. Hotovo znamená

- [ ] Extension funguje na skutečné podporované stránce bez úprav dané aplikace.
- [ ] Tři různé profily vedou ke správnému kontextu; chybějící firma se nevymýšlí.
- [ ] Exa dodá živé výsledky; tvrzení v briefu lze přiřadit ke zdrojům a nejasná identita je označena.
- [ ] Uživatel může upravit návrh a před Save nevzniká workspace záznam.
- [ ] Save vytvoří skutečný task; ověřeno načtením nebo otevřením v Ambiguous AI.
- [ ] Opakované kliknutí nevytvoří dva souběžné zápisy; částečná chyba není hlášena jako úplný úspěch.
- [ ] Přechod na jiný profil během researchu nezobrazí starý výsledek u nové osoby.
- [ ] Výpadek API vede ke srozumitelné chybě; obsah stránky nemůže vyvolat nepovolený zápis.
- [ ] Klíče nejsou v extension bundle, DOM ani repozitáři.
- [ ] README popisuje spuštění a skutečné limity; demo používá pravdivě označená živá data nebo zálohu.

Automatizované kontroly soustředit na extrakci uložených vzorků, validaci návrhu a stav zápisu/retry. Hlavní důkaz je jeden živý end-to-end průchod, ne samotné unit testy. Požadované artefakty jsou potvrzené: title, popis, public GitHub, dvouminutové video a public social s partner tagy.

## 8. Demo a anglický pitch

Submission video má dvě minuty; viz docs/submission/VIDEO-PLAN.md. Ukázat profil, kontextovou akci, research se zdroji, krátkou editaci follow-upu, Save a skutečný záznam. Zmínit rozsah podporovaných stránek. Záložní nahrávku úspěšného živého průchodu jasně označit jako nahrávku.

> AgentLayer brings an agent directly into the page where you work. On a supported professional profile, it understands the person and company, researches relevant information with Exa, and prepares a sourced follow-up. You review the proposal and save it to Ambiguous AI without copying context into a chatbot. The page determines what the agent knows, which actions it offers, and what the resulting work refers to.

Pro submission doplnit pouze skutečně dokončené funkce, použitý model/provider, spuštění, limity a důkaz integrací. Připravit projektový popis a odkazy; veřejnost repozitáře je povinná; formulářové detaily ověřit v portálu.

## 9. Zbývající informace

Velikost týmu; místní event page a přesné termíny; handbook a pravidla předem připraveného kódu; dostupné klíče/kredity; přístup k demo workspace; formát submission. Kostra byla následně připravena na výslovnou žádost uživatele. Její způsobilost pro soutěž závisí na pravidlech předem připraveného kódu; přístup k externím účtům zatím nebyl potvrzen.
