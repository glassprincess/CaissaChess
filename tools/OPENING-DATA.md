# Opening lesson sources

The packaged Russian and English guides work offline. The 1.5.2 expansion adds
20 families and 171 lesson entries, including Grob, Fried Liver, Halloween and
Stafford. Existing lesson IDs and mating positions are preserved.

Names and source PGNs come from the CC0 dataset at
https://github.com/lichess-org/chess-openings. Teaching text is original. Source
PGNs describe named positions; their inclusion is not a claim that every move is
sound. Additional teaching continuations are explicitly labeled in each entry's
`source` field. They illustrate alternatives, including inaccurate defenses.

To regenerate from a clean checkout, download the five official TSV files to a
temporary directory and pass that directory to the generator. In PowerShell:

```powershell
$openingData = Join-Path $env:TEMP 'caissa-opening-source'
New-Item -ItemType Directory -Force -Path $openingData | Out-Null
foreach ($volume in 'a','b','c','d','e') {
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/lichess-org/chess-openings/master/$volume.tsv" -OutFile (Join-Path $openingData "$volume.tsv")
}
node tools/expand-opening-guides-152.js $openingData
node tests/opening-lessons.js
node tests/openings-english.js
```

The script checks every source and authored PGN with the same legal-move parser
used by the app before writing either language. Repeating it with the same TSV
files produces the same output. The committed catalog uses the 3,865 source rows
recorded on 2026-11-23 in `opening-guides.json`'s source metadata. New upstream
rows may change selected continuations and consequently the test totals; review
those data changes before publishing. For exact reproduction, retain those five
TSVs. `build-opening-english.js` preserves the additional bilingual lessons and
rejects stale translations when their PGNs change.
