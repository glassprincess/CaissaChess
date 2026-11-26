# Changes

## 1.5.2

- Fixed offline puzzle repetition: bundled and cached puzzles share persisted shuffled cycles per rating.
- Trainer checkmates now play the end sound and show mate/winner animations once; select chevrons sit inside their borders.
- Arrows start off on upgrade; later explicit choices persist. Added a shared vibration toggle.
- Added 800 Elo, reduced 1200 to skill 1, removed the duplicate 3500 preset.
- PGN entry is visible immediately; Paste reads the browser or Android clipboard and preserves input on failure.
- Added 20 opening families: 70 opening families, 616 opening lines, plus 11 mating lessons.
- Opening moves use full-strength before/after engine grades, never automatic book badges.
- Debounced public Masters continuations and example game PGN import, with saved offline data and no account requirement.

## 1.5.1

- GitHub update checks: version, short bilingual notes, full release link, ABI-specific APK and persistent opt-out.
- 600 offline puzzles plus anonymous online Lichess puzzles, validated cache and offline fallback.
- Trainer setup locks during a run; full-width start, concise labels, move history and direct retries without solution spoilers. Two failed attempts still allow credit; the third or help forfeits it. Removed UCI entry.
- Unlimited premove queues, projected pieces and whole-queue cancellation on an illegal move.
- Clock-aware bot search budgets and uninterrupted opponent move animations.
- Eleven basic mating lessons in a new Checkmates filter, with Russian and English notes.
- Theme-colored queen, settings focus spacing and equal aligned action buttons.

## 1.5.0

- Mixed offline trainer: 60 Lichess puzzles, engine feedback, practice, sprint and survival.
- Classic, Gruvbox and Catppuccin themes; four Lichess piece sets with previews.
- Three hints per game, each with an arrow, best-move badge and target tint.
- Double arrows jump five full moves across all history views.
- Subtle move colors and a distinct animated great-move badge.
- Random extra thinking time for bots in timed games, charged to the bot clock.
- Separated, bordered Cancel button in settings.

## 1.4.1

- Added capture.mp3 for captures and sound when stepping through opening lines.
- Premoves visibly place the piece on a softly red future square. Pending moves
  can be cancelled and are validated after the bot replies; recaptures, promotion
  and castling are supported. A fast bot reply no longer interrupts a held piece.
- Installed the selected queen and laurel icon, including APK PNG fallbacks,
  adaptive/themed launcher artwork, header and startup screen.

## 1.4.0

- Russian and English throughout the app, including opening plans and move explanations.
- Supplied Chess.com sounds for start, moves, check, castling, promotion,
  premoves, low time and game end; volume control and mute.
- Resignation confirmation, color-specific timeout badges and delayed result
  windows after the end sound and vibration plus 1.5 seconds.
- Reopen the game report from the board. Completed reviews open immediately;
  an active review continues in the analysis view without restarting.
- Tighter header alignment, more room above Start, centered license/source
  links and separated result buttons.
- Three optional Caissa SVG concepts in `docs/branding/`; the installed knight stays.

## 1.3.0

- Caissa name and green knight; APK PNG icon fallbacks.
- Bot presets, chess clocks, resignation and postgame accuracy/performance.
- Check haptics, volume slider and full-strength hints.
- Fixed check-square gaps and touch promotion dialog dismissal.

## 1.2.0

- Faster batch analysis, per-side move counts and cached evaluations.
- Piece movement, result badges, game-history navigation and opening lessons.
- 50 opening families, 395 variations and optional Lichess continuations.
