# World Learner (static web app)

Learn world countries by continent with:
- **Continents**: Africa, Americas, Asia, Europe, Oceania (or All)
- **Difficulties**: Easy (multiple choice), Medium (type), Hard (click on map)
- **Hints**: letter/capital/region hints with a score penalty
- **Scoring**: time + streak bonuses
- **Saved high score**: stored in localStorage

## Run it locally

Because this is a zero-build app, you can run it with any simple local server.

### Option A (Python)

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173/menu.html` (or just `http://localhost:5173/`).

### Option B (VS Code / Cursor)

Use any “Live Server” extension, or similar.

## Notes

- Country data comes from the Rest Countries API.
- The map is rendered from a public GeoJSON source. Some country name mismatches are handled with a small alias table; a few shapes may still be unavailable depending on data source naming.

