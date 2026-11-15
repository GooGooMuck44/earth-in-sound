# Earth in Sound: submission drafts

Editable drafts for the Space Apps project page. Items in brackets need the team. Check every rule and deadline against the official site and our Local Lead before submitting.

Live: https://googoomuck44.github.io/earth-in-sound/ · Code: https://github.com/GooGooMuck44/earth-in-sound

Challenge: **The Earth Information Jukebox** [CONFIRM OFFICIAL CHALLENGE: check it matches the challenge we registered on Space Apps Connect]

## High-level summary

Earth in Sound is a small listening instrument for our planet. It turns NASA Earth data into sound you can explore in a browser: 146 years of global temperature, the Arctic against the Tropics, the seasons of your own city, two cities side by side, natural events NASA is tracking, and satellite maps scanned from west to east. A chart, a readout and a Data panel show the same numbers, so it works with or without sound. No account, no backend, and it keeps working offline.

## Problem and audience

Climate information mostly arrives as charts. Many people skim past them, and people who are blind or have low vision often can't use them at all. Large numbers such as "1.2 °C" are hard to feel or connect to a place you know.

Intended audiences (not yet tested with them): students, teachers, curious listeners, people who find climate charts hard to approach, and people who benefit from more than one way to explore information, including blind and low-vision listeners.

## Solution and working features

- **Planet:** NASA GISTEMP v4 global annual anomaly, 1880 to 2025. One note per year; higher means warmer.
- **Regions:** GISTEMP zonal means in three bands, left, centre and right on one shared scale: poles and tropics, hemispheres, or northern and southern bands.
- **My Place:** NASA POWER monthly temperature, rain rate and sunlight for any city, with nine saved cities including Dhaka.
- **Compare:** two cities, one per ear, on one shared °C scale over the months both have.
- **Events:** NASA EONET events over the last 60 days. Fires crackle, storms drum, ice rings; west to east is left to right.
- **Scan:** a line sweeps NASA GIBS maps (air temperature, sea surface, plants), or any image, such as an Earth Information Center frame. Uploaded images play colour and brightness, not measurements.
- **Take a listen:** a short guided listen with captions taken from the data, optional spoken captions.
- **Range, Share, Data:** listen to any span of years, share the exact setup as a link, and download the selected numbers as CSV with source notes.
- **Findings:** one or two results computed from what you selected.
- Keyboard control, screen-reader labels, visible focus, reduced-motion support, offline use after one visit, and one-pass recording.

## NASA data and how we use it

| Dataset | Used for | Notes |
| --- | --- | --- |
| GISTEMP v4 global (GISS) | Planet: pitch, brightness, heat hiss | °C anomaly vs 1951–1980, annual J–D means |
| GISTEMP v4 zonal (GISS) | Regions: three voices panned left, centre, right | Poles and tropics, hemispheres, 44–64°N to 64–44°S bands |
| POWER monthly point, AG community (LaRC) | My Place and Compare: T2M pitch, PRECTOTCORR note count, ALLSKY_SFC_SW_DWN brightness | °C, mm/day (average daily rate, not a monthly total), MJ/m²/day; units checked against the API's metadata |
| EONET v3 (Earth Observatory) | Events: category sounds and stereo position | Tracked events only; not a disaster census or evidence of cause |
| GIBS WMS + colormaps (ESDIS) | Scan: map columns and bands become notes | Values are read back from rendered colours, so they are approximate |

Other: Open-Meteo geocoding for city search (CC BY 4.0).

## Technical approach

TypeScript, Vite, Tone.js and uPlot, deployed as static files on GitHub Pages. A Node script downloads NASA data, validates it (ordered numeric years, at least 24 complete POWER months with expected units, no `-999` fill values or month-13 annual summaries) and stores it with its source URL and retrieval time. The browser plays bundled data first and tries live NASA requests with timeouts. A service worker caches the app, font and all bundled data on the first visit. Values map to a C major pentatonic scale through one fixed scale per view. Audio passes through a compressor and limiter.

## Limitations

- Sound is a designed translation, not a measurement. Pitch is relative within a view's scale.
- POWER values are grid-cell estimates, not station readings. Rain is a daily rate.
- Scan values are approximate because they are decoded from map colours.
- EONET lists events NASA tracks, with a lag of a few days, and says nothing about causes.
- We have not yet tested with blind or low-vision listeners, teachers or students.
- Recording depends on browser support for MediaRecorder and WebM, especially on Safari and iOS.

## Community involvement

[Add only what actually happened: who tried it, what they said, what we changed.] Our planned test is in [TESTING.md](TESTING.md).

## Team roles

[Team name] · [Member 1: role] · [Member 2: role] · [Member 3: role] · [Member 4: role]

Commit history shows work by nafisa1602, Prottasha Saha Ayoishee and Fahmida Munni, plus the first commit from ctf parina. [Replace with names and roles each member approves. Do not include anyone under 18 by name, voice or face.]

## References

- GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA GISS. https://data.giss.nasa.gov/gistemp/
- Lenssen, N., et al., 2019: Improvements in the GISTEMP uncertainty model. J. Geophys. Res. Atmos., 124, 6307–6326.
- NASA Langley Research Center POWER Project. https://power.larc.nasa.gov/
- NASA EONET v3. https://eonet.gsfc.nasa.gov/docs/v3
- NASA GIBS. https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api
- Open-Meteo Geocoding API. https://open-meteo.com/en/docs/geocoding-api
- Tone.js (MIT), uPlot (MIT), Vite (MIT), Manrope via Fontsource (SIL OFL 1.1).
- The Earth-and-wave mark and all interface graphics are original. No stock media is used. NASA has not endorsed this project, and we don't use NASA logos.

## Use of AI

[Required on the project page. Fill in from the team's own record: tools, what each helped with, important prompts, human decisions and what the team tested. Earth in Sound contains no AI model; all values come from NASA or the user's own image.]

---

# Earth in Sound: অল্প কথায় (Bangla summary)

[Optional. Add a short Bangla summary written by a team member, if the team wants one.]
