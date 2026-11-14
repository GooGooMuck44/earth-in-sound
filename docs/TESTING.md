# Testing

## Automated (run on 14 Nov 2026, Node 22)

`npm test` passes: 28 unit tests, 4 NASA data checks, TypeScript, production build, and the simulated first-visit and offline reopen.

New unit tests cover: Compare's shared months and shared pitch scale, missing values in Compare, Range clamping and that chart, sound, findings and CSV use the same points, a fixed pitch scale across ranges, share-link round trips, invalid and old links, the location warning, CSV headers with units and empty missing cells, tied findings, seasonal findings that need every calendar month, and thinning busy event days without dropping a category.

## Headless Chromium checks (cloud sandbox, no speakers)

Done with Playwright against `npm run preview`. The sandbox can't reach NASA, so every view ran on bundled data.

- All six views load at 390, 768 and 1440 px with no page-level horizontal overflow. Also no overflow at 2× zoom on a 640 px window.
- No autoplay on load. Play, pause, resume, restart and scrubbing keep the readout, chart playhead and slider in step. Play after scrubbing continues from the new point.
- Range 2000–2009 updates the subtitle, slider length, findings, CSV rows and the address bar.
- Share link restores view, cities, range and speed without playing. Unknown views and bad values are ignored. Older `#track=` and `#lat=` links still open.
- Compare loads Dhaka and London, then Dhaka and Sydney.
- Take a listen runs Planet, Poles and Dhaka with data captions, then ends. Skip and Leave work.
- Record with Loop on: the recording stops after one pass and offers Save.
- Service worker: after one online visit, going offline and reloading opens the app with the bundled font, the Offline label shows, and Poles, Dhaka, Compare, Events and Scan load from saved data. An unsaved place offline says which saved city plays instead ("Dhanmondi unavailable. Playing Dhaka.").
- This check found and fixed a real bug: hashed JS and CSS failed to load offline when the server sent a `Vary` header. The worker now matches with `ignoreVary`.
- Keyboard: arrow keys, Home and End move between tabs; Space plays and pauses; arrows step through time; the timeline slider reads out date and value. Every visible control has an accessible name.
- Text contrast on every surface is at least 5.8:1, and control borders are at least 3:1.

## Not done yet

These need people and real devices. They are not claims.

- [ ] Listening on speakers and headphones: balance, loudness, Compare and Poles separation, busy event days.
- [ ] Screen readers: NVDA, VoiceOver on macOS and iOS, TalkBack.
- [ ] Safari and iOS: audio unlock, recording, offline.
- [ ] Android Chrome on a real phone.
- [ ] Live NASA requests in the browser (POWER search, EONET live refresh, GIBS months). The sandbox blocks NASA hosts.
- [ ] Spoken captions in the guided listen on each platform.

## Small user test plan

Five to eight people, about 10 minutes each, ideally including students, a teacher and a blind or low-vision listener. Ask permission, don't record anyone under 18, and write down what people do, not what we hoped.

| Task | Success looks like |
| --- | --- |
| Start listening | Presses play or Take a listen within 10 seconds |
| Find Dhaka | Opens My Place and picks Dhaka |
| Find a warmer period | Points to or names a warmer span, by ear or on the chart |
| Compare two places | Opens Compare and says which side is warmer |
| Explain one sound | Says what pitch, or extra notes, mean |
| Find the NASA source | Opens Data and names the dataset |

Record for each person: task, time, success (yes / partly / no), quote, issue, fix. Add real results below.

| Date | Tester (no names of minors) | Task | Result | Note |
| --- | --- | --- | --- | --- |
| | | | | |
