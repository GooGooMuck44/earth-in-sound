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

## Chrome on macOS (14 Nov 2026)

Checked against the production build in installed Chrome. No listening assessment was made.

- All six views loaded. The timeline stepped from 2000 to 2002, Range restored 2000–2009, Compare showed Dhaka and London, Share restored the range without autoplay, and Data downloaded a 10-row CSV.
- Voice switched on and off, and Loop switched on. Take a listen, spoken captions and recording with Loop were not checked because they require audio playback.
- Live city search for “Chattogram” returned Chittagong, Bangladesh. Selecting it loaded NASA POWER with a Live badge and values from 2001–2025.
- Events first showed saved data and “Checking live events…”. The NASA EONET refresh eventually changed to a Live badge and “Live events”.
- Scan loaded the August 2026 NASA GIBS air-temperature map with a Live badge. Changing the month to July loaded a new live map and July values.
- Use my location ended on the named London saved-data fallback. The fallback place was visible, but the device location and its accuracy were not independently verified.
- At 200% zoom the interface reflowed without page-level horizontal scrolling. A first 400% check found overlapping player controls; the layout was changed so the player becomes part of the page and its controls wrap into separate rows. The repeat check found no control overlap.
- At an exact 320 px Chrome viewport, the document and body scroll widths were both 320 px. Data and Share remained visible, the player controls stayed inside the viewport with no intersections, and every visible player target was at least 44 px high.
- After one online visit, Chrome network-offline emulation reloaded Planet, Dhaka, Compare and Scan from cached files with the Offline label. This was browser network emulation, not a physical Wi-Fi-off check.

## Not done yet

These need people and real devices. They are not claims.

- [ ] Listening on speakers and headphones: balance, loudness, Compare and Poles separation, busy event days.
- [ ] Screen readers: NVDA, VoiceOver on macOS and iOS, TalkBack.
- [ ] Safari and iOS: audio unlock, recording, offline.
- [ ] Android Chrome on a real phone.
- [x] Live NASA requests in Chrome (POWER search, EONET live refresh, GIBS month change).
- [ ] Spoken captions in the guided listen on each platform.
- [ ] Physical Wi-Fi-off reload after an online visit.

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
