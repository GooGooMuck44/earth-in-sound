# Earth in Sound — Claude upgrade prompt

You are our senior frontend engineer, interaction designer, audio engineer, and science communicator. Work in the existing Earth in Sound repository and implement a cohesive upgrade.

Repository: https://github.com/GooGooMuck44/earth-in-sound
Guide: https://docs.google.com/document/d/1mSOxplyht5kii8GcCnFaGA-vMHIAVypjl4N6PobnaYQ/edit?tab=t.0

## Purpose

Help people hear their place in a changing planet. Make NASA data understandable, personal, and worth exploring. Prioritize a polished listening experience, transparent science, and features that work from end to end.

Our preferences: short titles, human language, minimal interface text, beautiful Earth colours, clear controls, and a memorable demonstration. Keep the name Earth in Sound.

## Inspect before building

Read repository instructions, README, developer guide, source, and tests. Check branch state and remote PRs; preserve relevant work from the reliability/accessibility PR and NASA validation PR. Their statuses may have changed. Preserve local changes and use a feature branch.

Read the supplied participant guide. If inaccessible, say so. Verify the official challenge title and current submission requirements. The guide contains inconsistent dates; do not invent deadlines or treat local guidance as verified global rules. Use [CONFIRM OFFICIAL CHALLENGE] if the selected challenge is unknown, while continuing independent work.

Keep TypeScript, Vite, Tone.js, uPlot, static hosting, bundled records, and offline support unless a specific limitation requires a change. Avoid an unnecessary framework migration, backend, login, or paid service.

## Design

Make the app feel like a small instrument for Earth: ocean depth, forest green, water blue, warm sunlight, and quiet surfaces.

Starting tokens:
- Background #06141B
- Surface #0D232D
- Raised surface #14323D
- Text #F1F7F5
- Secondary #A9C3C8
- Green #58D6A2
- Water #69BDF2
- Sun #F3CD78
- Coral #F28F79
- Ice #C6EAF2
- Border #294550

Refine these after checking actual contrast. Preserve scientific map colormaps. Use colour consistently, never as the only indicator.

Use readable typography, tabular numbers, consistent spacing, restrained motion, and an original Earth/wave mark. Keep the main listening action in the first viewport. Avoid oversized marketing sections, constant particles, excessive glow, and grids of generic feature cards.

Navigation can use Planet, Poles, My Place, Events, and Scan. Controls can use Play, Compare, Mix, Save, Share, Data, and About. Prefer useful messages such as “Loading Dhaka…” and “Saved data.” Explain real substitutions: “Playing London instead” must identify the actual fallback.

Keep long explanations in optional panels. Essential information must work on touch and keyboard, not only in hover tooltips.

On mobile, use a single column, reachable controls, and an independently scrolling tab row if needed. A compact bottom player is welcome if it reserves space and respects safe areas.

## Preserve the existing product

Keep all five views, synchronized charts and playback, saved cities including Dhaka, image scanning, instrument choices, voice controls, recording, keyboard navigation, data validation, and offline fallbacks.

Fix regressions before adding features. Sound, selected values, timeline, and chart must agree.

## Build these features in order

1. Compare

Compare two cities with a shared timeline, chart, and left/right listening. Start with saved cities. Use overlapping periods, matching units, and one shared pitch scale for absolute temperature. If comparing anomalies, specify a defensible common baseline. Never independently normalize cities and imply their pitches compare absolute temperatures. Make missing overlap understandable.

2. Then / Now

Compare two equal historical windows. Use matching seasonal coverage where relevant. Keep sound scale, instrument, gain, and speed constant. Offer Then, Now, and Both. Calculate findings from the selected observations. Do not select arbitrary periods to manufacture a dramatic result.

3. Seasons

Make a twelve-month listening loop for a city. Temperature sets pitch, rain adds note density, and sunlight changes brightness. Offer individual years and, when enough data supports it, an explicitly labelled typical seasonal cycle. Define its reference years and completeness rules. Let users compare seasonal cycles fairly.

4. Mix

Let users isolate or mute temperature, rain, and sunlight. Make each channel's role clear through one short optional explanation. Distinguish muting a sound layer from disabling a parameter mapping: sunlight currently changes filter brightness rather than playing a separate voice. Controls must reflect the actual sound architecture.

5. Stories

Build short guided listens using bundled records. Suggested titles: A Warmer World, Two Poles, and Dhaka’s Seasons. Each story asks a clear question, plays meaningful data, and ends with a calculated finding. Use very few captions. Allow pause, skip, replay, and exit. Narration is optional and has a text alternative. Avoid simultaneous speech and audio that obscure each other.

6. Share

Copy links that restore view, places, period, comparison mode, sound, and speed without autoplay. Validate URL parameters. Include a dataset version or identify when current data differs from the original listen. Ask before embedding precise device location in a shared link. Add a share card only after restoration works, using actual values, period, and source.

7. Data

Provide a compact panel with source links, units, dates, retrieval time, baseline, live/saved status, and limitations. Export selected numerical observations as CSV with clear column units and source metadata. Make exports reflect the selected range and displayed dataset.

8. Learn

Add a few optional listening activities: compare warmer periods, identify a seasonal pattern, or isolate a sound. Offer an answer and a short explanation grounded in the selected records. Prepare brief teacher notes. Measure understanding through actual testing; do not assume learning gains.

9. Language

Add English and natural Bangla using a maintainable translation structure. Translate complete flows, including errors, accessible labels, and sharing. Keep scientific units consistent and handle unavailable speech voices. Make future language support possible without shipping unfinished translations.

Complete a reliable version of each feature before adding secondary variations. If time is limited, finish Compare, Then / Now, Seasons, Stories, and Share first. Do not expose unfinished controls.

## Science and sound

NASA records must drive the experience. Preserve GISTEMP's stated 1951–1980 anomaly baseline. Verify POWER units from API metadata: the existing AG response uses °C, mm/day, and MJ/m²/day. Rainfall rate is not monthly rainfall total.

Handle missing and nonfinite values honestly. Exclude annual summary month 13 from monthly observations. Check completeness before yearly averages or seasonal comparisons. Do not fabricate observations or forecasts.

EONET is a tracked-event feed, not a complete disaster census or evidence that an individual event was caused by climate change.

GIBS colour-derived values are approximate. For precise quantitative regional analysis, use suitable numerical source products; do not imply rendered imagery supplies exact measurements. Clearly separate uploaded-image colour/brightness mapping from scientific data.

Document scaling and mapping choices. Sonification is a designed translation of data, not Earth's literal recorded sound. Coding assistance does not mean an AI model was trained on NASA data.

Balance instruments, smooth transitions, prevent clipping, and control dense event playback. Retain distinct polar voices. Use comfortable default gain and optional narration. Stop old playback when changing views. Avoid audio-node leaks. Recording must stop after one pass even when playback loops.

## Access and reliability

No autoplay. Provide visual values and findings for people who cannot hear the sound, and meaningful keyboard and screen-reader access for people who cannot use the chart.

Preserve semantic controls, visible focus, appropriate tab behavior, reduced motion, readable contrast, and comfortable touch targets. Avoid live-region announcements on every animation frame.

Bundle essential records and guided stories. Preserve first-visit caching, offline reopen, request timeouts, and named fallback places. Distinguish live, saved, loading, offline, and failed states. Delete only this app's old caches. Keep decorative dependencies lightweight.

## Evidence and submission

Align the final project with the guide's impact, creativity, validity, relevance, and presentation criteria. Show real team contributions and NASA data use. Do not promise awards or invent users, endorsements, feedback, or testing.

Prepare editable project-page text, source credits, limitations, AI assistance notes, a local pitch under 240 seconds, a final demo under 30 seconds, and a seven-slide fallback outline. Verify current format rules. Use real working features in the scripts, name NASA sources, and leave unknown team details as placeholders. Follow verified subtitle and participant-identity requirements; clarify conflicts with the Local Lead.

Keep README claims aligned with shipped features. Keep future ideas explicitly labelled as plans. Preserve its short, welcoming style and move detailed engineering notes into docs.

## Delivery

Start with a concise plan, then implement. Do not stop after planning. Make reasonable choices within scope and ask only when missing information blocks progress or authorization is needed.

Run existing tests and meaningful checks for shared scales, overlapping periods, missing months, URL restoration, selected exports, playback, recording, and offline behavior. Inspect mobile around 390 px, tablet around 768 px, and desktop around 1440 px. Check zoom, focus, overflow, chart resizing, and repeated interactions.

Report which automated, browser, device, screen-reader, and listening checks actually ran. Never call an unperformed check passed.

Deliver working code, updated documentation, reproducible run instructions, test results, and a clear list of remaining limitations. Commit and prepare a reviewable contribution. Merge, deploy, and submit externally only when authorized.
