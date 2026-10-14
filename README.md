# Case Study Studio

A visual case study builder with editable sections, reusable research components, survey charts, image/GIF layouts, and Figma wireframe frames. The component styling follows the Case Study Components page in the portfolio Figma file.

## Run locally

```sh
npm install
npm run dev
```

Edits save in your browser. Export JSON to back up a study and import JSON to restore it. The sample study contains generic content. No personal research or Figma access token is committed.

## Publish

`npm run build` writes the GitHub Pages site into `docs/`. Serve the `main` branch's `/docs` folder under GitHub Pages settings.

## Data connections

- **Google Forms:** Link responses to a Google Sheet, publish an anonymized CSV tab, then connect the CSV URL. You can also import a CSV file without a server.
- **Figma:** Add a page URL and a personal access token in the wireframe picker. Set `VITE_FIGMA_PROXY_URL` to a trusted server endpoint to enable live frame import. The token is held only in memory in the browser and sent to that endpoint for the request. Without a proxy, paste screen image URLs directly in the inspector.
- **Notion:** Save a research page URL in Project sources and include it in the AI assistance brief. Automatic Notion syncing requires your own server integration and is not configured in this public starter.
- **Images:** Paste image URLs, or upload small images into your browser draft. Export a backup regularly. Large production media should use durable storage.

Never put a Figma token, Notion integration secret, or Supabase service role key in `VITE_` variables.
