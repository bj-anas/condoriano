# Condoriano

A voice assistant for BDO. Say "Hoy Condoriano" (or tap the mic), and talk to it
like a friend on a call. It answers from the knowledge base in `knowledge-base/`. Static web app,
no backend: each player brings their own free Gemini API key.

## Run it locally

```bash
pnpm install
pnpm dev
```

Open the printed URL in **Chrome or Edge** (the wake word and the turn-based fallback use the
browser's speech recognition). Use a headset.

- `pnpm test`: knowledge base loading and wake word matching tests
- `pnpm test:kb`: checks that the knowledge base loads
- `pnpm build`: type-check and build to `dist/`

## Using it

- **First visit:** enter your name and paste a Gemini key (free from
  [Google AI Studio](https://aistudio.google.com/apikey)). The key is checked with a free request
  and stored only in this browser. A Groq key is an optional backup.
- **To Start:** say "Hoy Condoriano" or tap the mic. Condoriano greets you first.
- **Stop it talking:** press **Pause** (in real-time mode you can also just talk over it).
- **Hang up:** say "bye", tap the red button, or stay silent (the timeout is in Settings).
- **Screenshots:** drag and drop, paste with Ctrl+V anywhere, or tap **Screenshot**. In Chrome or
  Edge you can also pick the BDO screenshot folder in Settings. New Print Screen shots then reach
  Condoriano automatically during a call.
- **Free limit reached:** a warning appears with a **Change model** button. In Auto mode it
  switches to the next model on its own and tells you which one.

## Models

| Model | Voice | Screenshots |
|---|---|---|
| Gemini 3.8 Live | Real-time (interruptible) | Yes |
| Gemini 3.8 Flash | Turn-based | Yes |
| Gemini 3.5 Flash-Lite | Turn-based | Yes |
| Groq · Qwen 3.8 27B | Turn-based | Yes |
| Groq · GPT-OSS 20B | Turn-based | **No** (the app says so and won't send) |

**Auto** starts with Gemini Live. If its limit is hit, it moves to turn-based mode. There,
screenshots and harder questions go to Flash and simple ones go to Flash-Lite. Groq comes last,
if you added a key.

Turn-based mode uses the browser's speech recognition for your voice and the browser's speech
synthesis for Condoriano's, so it costs one API request per question. Model ids were checked on
2026-10-16; update `src/ai/models.ts` when Google or Groq retire one.

## Knowledge base

`knowledge-base/` is bundled at build time (as its own chunk, loaded when a call starts) and
searched in the browser: MiniSearch over `##` sections, with light plural stemming, table rows
weighted lower than prose, and the glossary and synonyms used to widen each question.

- `skill.md`: the system prompt (`{user_name}`, `{kb_version}`, `{language}` are filled in)
- `glossary.md`: `| slang | official name | meaning |` tables (PEN, FS, AP...), searchable and used
  to expand questions
- `synonyms.md`: everyday phrasing → game words ("come back" → recovery), used only to expand
  questions
- `<category>/<page>.md`: one folder per section of the [official NA/EU wiki](https://www.naeu.playblackdesert.com/en-US/Wiki),
  one note per wiki page (20 folders, 367 notes, about 3,000 sections, built on 2026-10-16). Notes are written as short facts in our own words (no copied text),
  keeping official names and numbers exactly, with the page URL and its "last edited" date in the
  frontmatter.

Every file needs `category`, `patch_date` and `sources` frontmatter, and every `##` section must make
sense on its own (it is searched and sent to the model alone).

## Known limits

- **Wake word:** it uses the browser's speech recognition with fuzzy matching, because Porcupine
  and openWakeWord both need a custom-trained model for "Hoy Condoriano". The browser's speech
  service hears the mic while it listens. Turn it off in Settings if you prefer the mic button.
  `src/wake/listener.ts` is the one place to swap in a real wake-word engine.
- **iPhone and iPad:** Safari doesn't support speech recognition on iOS (and every iPhone
  browser, Chrome and Firefox included, runs on Safari's engine). The wake word and the
  turn-based models (Flash, Flash-Lite, Groq) all rely on it, so only **Gemini 3.8 Live** is
  supported on iOS. Start calls with the mic button.
