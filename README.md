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

## Lenker til crew

| Hvem | URL |
| --- | --- |
| Alle | `https://<app>.vercel.app/` |
| Stagemonitor | `https://<app>.vercel.app/?view=scene` |
| Regi | `https://<app>.vercel.app/?regi` |
| Gjennomgang/prøve | `https://<app>.vercel.app/?t=14:10`, som simulerer klokka fra 14:10 |

## Live-synk (valgfritt, anbefalt)

Uten oppsett virker alt, men GO, forsinkelse og beskjed gjelder bare enheten som trykker (merket **Lokal**).
Slik får alle enheter samme tilstand (merket **Live**):

1. Vercel → prosjektet → **Storage** → legg til **Upstash Redis** (gratisnivå holder). Da settes `KV_REST_API_URL` og `KV_REST_API_TOKEN` automatisk.
2. Legg til miljøvariabelen `ADMIN_PIN` (for eksempel `4821`), så bare regi kan endre. Regi blir spurt om PIN første gang.
3. Redeploy.

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
