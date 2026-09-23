# Magien 2026 – Kjøreplan

Kjøreplan for crew som web-app (Next.js, deployes på Vercel). Åpne på mobil, nettbrett eller skjerm.

## Funksjoner

- **Nå / Neste** øverst: tittel, nedtelling, fremdriftslinje og cues for Lyd, Lys og AV.
- **Standby**: Neste-kortet blinker gult når neste post starter innen 1 minutt.
- **Avdelingsfilter** (Alle / Lyd / Lys / AV): viser bare din cue, og tones ned poster uten cue for deg. Valget huskes på enheten.
- **Tidslinje** gruppert i Dag / Omrigg / Kveld. Ferdige poster skjules (kan vises igjen).
- **Scenevisning**: stor nedtelling for stagemonitor/foredragsholder: grønn, så gul under 2 min, rød under 1 min, og blinker ved overtid.
- **Regi** (show caller):
  - **GO** starter neste post nå. Alle påfølgende tider i blokken justeres automatisk etter faktisk forsinkelse.
  - **Start** på en post i lista hopper til den posten.
  - **±1 min** justerer forsinkelsen manuelt.
  - **Beskjed til crew** vises som gult banner hos alle.
- Skjermen holdes våken, og appen kan legges til på hjemskjermen.
- Appen virker uten nett når den først er lastet, fordi tidene følger klokka på enheten.

## Deploy til Vercel

1. vercel.com → **Add New → Project** → importer `munderhaug/Magien` (Next.js oppdages automatisk). Prosjektet `magien-kjoreplan` i Lumaia-teamet finnes allerede; koble repoet under **Settings → Git** der.
2. **Settings → Deployment Protection**: sett Vercel Authentication til *Standard Protection*, eller slå den av. Da kan crew åpne produksjons-URL-en uten Vercel-innlogging.
3. Hver push til branchen deployer automatisk.

## Lenker til crew

| Hvem | URL |
| --- | --- |
| Alle | `https://magien-kjoreplan-lumaia.vercel.app/` |
| Stagemonitor | `https://magien-kjoreplan-lumaia.vercel.app/?view=scene` |
| Regi | `https://magien-kjoreplan-lumaia.vercel.app/?regi` |
| Gjennomgang/prøve | `https://magien-kjoreplan-lumaia.vercel.app/?t=14:10`, som simulerer klokka fra 14:10 |

## Live-synk (valgfritt, anbefalt)

Uten oppsett virker alt, men GO, forsinkelse og beskjed gjelder bare enheten som trykker (merket **Lokal**).
Slik får alle enheter samme tilstand (merket **Live**):

1. Vercel → prosjektet → **Storage** → legg til **Upstash Redis** (gratisnivå holder). Da settes `KV_REST_API_URL` og `KV_REST_API_TOKEN` automatisk.
2. Legg til miljøvariabelen `ADMIN_PIN` (for eksempel `4821`), så bare regi kan endre. Regi blir spurt om PIN første gang.
3. Redeploy.

## Styring fra Bitfocus Companion

Krever live-synk (Upstash Redis + `ADMIN_PIN`). Alle skjermer oppdateres innen ca. 2 sekunder.
Bruk modulen **Generic HTTP** i Companion med en *GET*-action. Legg gjerne kallet på samme knapp som trigger klippet i Resolume,
så følger kjøreplanen videoene automatisk.

Base: `https://magien-kjoreplan-lumaia.vercel.app/api/control?pin=<ADMIN_PIN>&action=…`

| Knapp | URL-parametre |
| --- | --- |
| GO (start neste post) | `action=go` |
| Start bestemt post | `action=start&id=r08` eller `action=start&n=8` (nr. i lista, 1-basert) |
| Forsinkelse +1 / −1 / nullstill | `action=delay&add=1` · `action=delay&add=-1` · `action=delay&set=0` |
| Slipp GO – følg klokka | `action=release` |
| Beskjed til crew | `action=message&text=Video%20klar` |
| Fjern beskjed | `action=clear` |

PIN kan også sendes som header `x-admin-pin`. Svaret er JSON med `ok` og status.

**Status til knappetekst/variabler:** `GET /api/status` (ingen PIN) gir flat JSON, bl.a. `now_title`, `now_left`
(«4:05», «+0:30» ved overtid), `now_over`, `next_title`, `next_in` («venter» når regi må trykke GO), `next_av`,
`delay_text` og `message`. Poll f.eks. hvert sekund med Generic HTTP sin JSON-funksjon og bruk verdiene som variabler på knappene.

Post-id-er (`r01`–`r43`) står i `data/schedule.json`.

> Vercel: Deployment Protection må være av (eller bruk en *Protection Bypass for Automation*-token som header
> `x-vercel-protection-bypass` i Companion), ellers blir kallene stoppet av Vercel-innlogging.

## Oppdatere kjøreplanen

Når Excel-filen endres:

```bash
pip install openpyxl
python3 scripts/import_xlsx.py sti/til/Kj_replan.xlsx   # skriver data/schedule.json
git commit -am "Oppdatert kjøreplan" && git push      # Vercel deployer på nytt
```

Lagre Excel-filen før import, fordi skriptet leser de utregnede verdiene. Skriptet sorterer postene på klokkeslett og varsler om avvik. Varslene vises også nederst i appen under «Merknader fra Excel».

## Lokalt

```bash
npm install
npm run dev
```
