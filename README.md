# InterviewPro — V1.1

## What's new in V1.1
- **332 offline questions** (was 98), based on research into what Java, DevOps, Kafka, Elasticsearch, Azure and DSA interviews ask in 2025–26.
- **New areas:** DSA (32 questions, asked verbally: approach plus complexity), **Kafka** (15, including KRaft, rebalancing, exactly-once, lag), **Elasticsearch** (10), **Azure** (22: Entra ID, RBAC vs Policy, networking, Key Vault, Bicep, AKS, Azure Pipelines, landing zones, cost), plus DevOps tool knowledge (GitHub Actions, GitLab CI, Jenkins, Argo CD, Helm/Kustomize, Argo Rollouts, Prometheus/Thanos/Mimir, OpenTelemetry, Loki vs ELK, Vault, Kyverno/Gatekeeper, Trivy/Checkov/Gitleaks, SLSA/Sigstore, Terraform/OpenTofu/Pulumi/Crossplane, Karpenter, Istio, Nexus/Artifactory, SonarQube, Backstage).
- **Managerial scenario questions** (20) for Senior and Lead: missed sprints, underperformers, conflict, pushing back on stakeholders, tech debt vs features, incident communication, hiring, build vs buy, on-call burnout, monolith modernisation. In a Technical + HR interview at Senior or Lead level, most HR slots go to these.
- **Topic picker:** choose which categories to be interviewed on. All categories are selected by default; there are Select all and Clear buttons, and the setup screen shows how many questions match.
- Kafka, Elasticsearch and the easier DSA questions are shared by both roles; Azure is DevOps-only.

Realistic mock interviews with an on-screen interviewer, for **web**, **Android tablets** and **iPad**.
One codebase: a dependency-free web app (`www/`), installable as a PWA, and wrapped with **Capacitor 7** for the app stores.

Roles: **Java Backend Developer** and **DevOps Engineer**, plus shared Kafka, Elasticsearch, DSA, HR and managerial questions.

---

## What it does

| Step | What happens |
|---|---|
| 1. Pick role | Java Backend or DevOps |
| 2. Set up | Name, **position** (Junior → Lead/Architect), **years of experience**, format (Technical + HR / Technical only), length (5 / 8 / 12), **topic categories** (all by default), interviewer, speech accent, follow-ups, recording |
| 3. Device check | Camera preview, mic level meter, speech-recognition and voice availability, test voice |
| 4. Interview room | Video-call layout. The interviewer's **animated face** speaks each question (lip-sync, blinking, eye movement, nods while listening), with captions. You answer by **voice (live transcription)** or typing. Repeat, skip, pause, end, camera/mic/caption toggles, per-question timer, transcript log |
| 5. Follow-ups | Thin answer (<40% key points) → the interviewer asks you to elaborate on a missed concept. Strong answer (≥75%) → deeper follow-up question (max 2 per interview) |
| 6. Report | Overall score, technical knowledge, communication, verdict, score by topic, strengths, what to practise, per-question breakdown (your answer, covered/missed key points, coaching tips, model answer), session recording playback/download, save as PDF |
| 7. History | Past sessions and score trend, stored on the device |

Everything runs **offline on the device**: no server, no API keys, video is never uploaded.

## Offline question bank

`www/js/data/questions-*.js` holds **332 questions**:

| Type | Count |
|---|---|
| Technical concept / scenario / design | 255 / 22 / 20 |
| Managerial scenarios (Senior/Lead) | 20 |
| Behavioural + intro | 15 |

Technical questions available per role and level (including shared Kafka, Elasticsearch and DSA):

| Role | Entry | Mid | Senior | Lead |
|---|---|---|---|---|
| Java Backend | 55 | 120 | 89 | 32 |
| DevOps | 53 | 122 | 92 | 35 |

Categories in the picker:
- **Java:** DSA 32 · Core Java & OOP 17 · Kafka 13 · Spring & Spring Boot 12 · Concurrency 11 · Elasticsearch 8 · Databases & Caching 7 · Java 8+ Features 7 · Microservices 7 · System Design & Architecture 7 · Collections 6 · JVM & Performance 6 · Spring Data & JPA 6 · Testing & Observability 6 · Design Patterns 5 · REST & API Design 5 · Security 4 · Troubleshooting 3
- **DevOps:** Azure 22 · Kubernetes 22 · DSA 20 · CI/CD & Git 14 · Kafka 11 · Observability & SRE 11 · Linux & Scripting 10 · Cloud (AWS) 8 · Docker 8 · IaC & Config Management 8 · Networking 8 · DevSecOps & Code Quality 7 · Elasticsearch 7 · Platform Engineering 5 · GitOps & Helm 4 · Troubleshooting 3

Each question has: topic, applicable levels, type (intro / concept / scenario / design / behavioural), 3–6 **key points** with keyword synonyms, a **model answer** and a **follow-up**.

**Selection** (`engine/select.js`): draws from the levels of the chosen *position* and the candidate's *experience* (e.g. 3 yrs applying for Senior → Mid + Senior questions), keeps only the selected categories (widening to nearby levels if a category is thin), prefers the position level, spreads questions round-robin across categories, orders fundamentals → scenarios → design, avoids recently-asked questions, and is deterministic for a given seed.

**Scoring** (`engine/score.js`):
- *Technical (70%)* — share of key points covered. Matching tolerates speech-to-text output: stemming (caching = cache), split/joined words (hash code = hashCode), symbols (O(1), N+1, kill -9). Full marks need all points, or all but one when there are 5+.
- *Communication (30%)* — answer length, filler words (um, uh, basically, you know…), structure signposts (because, for example, first…), speaking pace (90–190 words/min).
- "I don't know" answers get zero technical marks and capped communication marks.

To add questions, use the compact `Q(id, topic, 'EMSL', type, question, keyPoints, modelAnswer, followUp, { cat, roles })` helper in `data/kp.js`. Add a file and register it in `data/questions.js`; map new topics to a category in `GROUPS`. To add a role, add it in `data/meta.js`. The tests enforce the schema and accuracy rules below.

## Live web version (GitHub Pages)

Every push to `main` runs the unit tests and deploys `www/` to GitHub Pages (`.github/workflows/pages.yml`):
**https://rahul576.github.io/interview-prep/**

One-time setup: in the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Run the web version locally

```bash
npm start            # http://localhost:5173 (zero-dependency static server)
```
Use Chrome, Edge or Safari for voice answers (Firefox has no speech recognition, so it falls back to typing). Camera/mic need `localhost` or HTTPS. When hosted over HTTPS, the service worker caches everything for offline use and the app can be installed as a PWA.

Any static host works (Netlify, Vercel, S3, Nginx): deploy the `www/` folder.

## Build the Android and iOS (tablet) apps

Prerequisites: Node 20+, Android Studio (Android), Xcode 16+ on a Mac (iOS).

```bash
npm install
npm run cap:add      # creates android/ and ios/, then patches permissions
npm run android      # opens Android Studio → Run / Build APK or AAB
npm run ios          # opens Xcode → pick an iPad simulator or device → Run
```
After changing anything in `www/`, run `npm run cap:sync`.

`scripts/patch-native.mjs` (run automatically) adds:
- **Android**: `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, optional camera/mic features, and `<queries>` for the speech-recognition and TTS services (required on Android 11+).
- **iOS**: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, all four iPad orientations, and multitasking support.

Native plugins: `@capacitor-community/text-to-speech` (interviewer voice + word timing for lip-sync) and `@capacitor-community/speech-recognition` (on-device dictation). The app picks them up automatically on device and uses the Web Speech API in browsers.

App icons and splash: `resources/icon.png` and `resources/splash.png`. Generate all native sizes with `npx @capacitor/assets generate`.

> If `npm install` reports a peer-dependency mismatch for the community plugins, install the versions that match Capacitor 7: `npm i @capacitor-community/speech-recognition@latest @capacitor-community/text-to-speech@latest`.

## Tests

```bash
npm test             # 34 unit tests (node:test, no dependencies)
npm run test:e2e     # browser end-to-end tests (needs: npm i -D playwright && npx playwright install chromium)
```

**Accuracy and correctness checks**
- **Question bank**: 300+ questions, unique IDs, valid levels and types, 3–6 key points each, model answer of at least 50 words, follow-up phrased as a question, shared questions declare their roles. Each role × level has at least 25 technical questions; Senior and Lead each have at least 15 managerial scenarios; no managerial questions at Entry or Mid. All requested categories (DSA, Kafka, Elasticsearch, Azure, ...) exist with at least 3 questions each.
- **Every model answer scores 100% of its own key points** (all 332 questions) and ≥ 85 overall.
- **Discrimination**: a model answer from a different topic scores below 60% technical in **99.06%** of 29,652 cross-topic pairs. The test fails below 97%.
- **Matching**: stemming, phrase matching, prefix matching, split/joined words, no partial-word false positives (e.g. "pod" does not match "podcast").
- **Scoring**: empty < short < partial < full ordering; transcribed speech still matches; filler words and pace affect only communication; "I don't know" handling; weighted summary maths.
- **Selection**: across every role × position × experience × length × format combination, checks the count, no duplicates, correct role and level, intro first, category diversity, determinism, and avoiding recent questions. Topic filter: only chosen categories are asked, every chosen category is represented, and thin categories widen levels without leaving the category. Azure never appears in Java interviews. Managerial scenarios appear for Senior/Lead only.
- **Conversation flow**: greeting by name, elaborate-prompt on weak answers (and a better score after it), deep follow-ups capped at 2 and never on the last question, skip, follow-ups disabled, ending early.
- **Native patcher**: Android manifest and Info.plist get each entry exactly once, stay well-formed XML (xmllint), and running it twice changes nothing.
- **End-to-end** (headless Chromium with a fake camera and mic): complete interviews on desktop, iPad landscape and portrait, Android tablet and phone. Checks that all topics are selected by default, that the Continue button is disabled when none are selected, that a custom topic selection is respected, that Senior interviews include a managerial scenario, that the questions shown match role and level, each per-question and overall score on screen equals an independent recomputation, model answers score ≥ 80, there is no horizontal scrolling at any size, history is saved, and there are no console errors. Also covers pause (timer frozen), resume and ending early.

Latest results and screenshots: `test-results/`.

## Project layout

```
www/                      the app (served as-is; also Capacitor webDir)
  index.html, manifest.webmanifest, sw.js, css/app.css, icons/
  js/main.js              screens: home, setup, device check, room, report, history
  js/ui/avatar.js         animated SVG interviewer (visemes, blink, gaze, head motion)
  js/engine/              text matching, scoring, question selection, interview session flow
  js/services/            speech (web + native), camera/recording, local storage
  js/data/                roles, levels, interviewers, question banks
scripts/                  serve.mjs, patch-native.mjs, icons.mjs
tests/unit, tests/e2e     test suites
capacitor.config.json     app id com.interviewpro.app (change before publishing)
```

## Known limits of V1
- Scoring is keyword/concept based, not an LLM: it checks whether you covered the expected concepts and how you communicated. It does not judge whether a sentence is logically correct (e.g. negations). The report says this.
- The interviewer is an animated illustration, not photoreal video. Voice quality depends on the voices installed on the device.
- On the native apps the microphone goes to speech recognition, so session recordings there are video-only.
- Session recordings are kept only until you leave the report page (download to keep them).

## Ideas for V2
LLM-based evaluation and dynamic follow-ups (optional, online), resume/JD-based questions, more roles (Frontend, Data, QA, PM), company-style rounds, coding round with an editor, photoreal avatar video, accounts and cloud sync.
