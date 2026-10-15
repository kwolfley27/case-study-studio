# Case Study Studio

A visual case study builder with editable sections, reusable research components, survey charts, image/GIF layouts, and Figma wireframe frames. The component styling follows the Case Study Components page in the portfolio Figma file.

## Run locally

```sh
npm install
npm run dev
```

Edits save in your browser. Export JSON to back up a study and import JSON to restore it. The sample study contains generic content. No personal research or Figma access token is committed.

## Adjustable layouts

Select a gallery, metric, or linked wireframe section and use **Layout controls** in the inspector. Gallery controls set the visible item count, one to three columns, even or Bento arrangement, tile sizes, spacing, presentation as images or iPhone mockups, and visual scale. Metric controls set one to six data points; wireframe controls set one to four phones and their size. Reducing a count hides extra items without deleting their text, images, or Figma frame IDs. These are manual composition controls; the AI brief records the settings, but visual generation is not connected.

## Publish

`npm run build` writes the GitHub Pages site into `docs/`. Serve the `main` branch's `/docs` folder under GitHub Pages settings.
The build keeps earlier hashed assets so a browser with a cached HTML entry still loads a working editor during deployment. Prune old assets only after their cached entries have expired.

## Data connections

- **Google Forms:** Link responses to a Google Sheet, publish an anonymized CSV tab, then connect the CSV URL for refreshable charts. You can also import a CSV file without a server.
- **Figma:** Add a page URL and a personal access token in the wireframe picker. This deployment uses a scoped Supabase Edge Function for live frame import and refresh. Set `VITE_FIGMA_PROXY_URL` to your own trusted endpoint when forking. The token is held only in memory in the browser and sent to that endpoint for the request. You can also paste screen image URLs directly in the inspector.
- **Notion:** Save a research page URL in Project sources and include it in the AI assistance brief. Automatic Notion syncing requires your own server integration and is not configured in this public starter.
- **Images:** Paste image URLs, or upload small images into your browser draft. Export a backup regularly. Large production media should use durable storage.

Never put a Figma token, Notion integration secret, or Supabase service role key in `VITE_` variables.

## AI drafting setup ("Draft with AI")

The **Draft with AI** button (left panel → Connections) reads the linked Notion page and Figma design page, asks Claude to assemble the case study from the component library, and writes it into the draft (with **Undo AI draft**). It never invents quotes or numbers; gaps come back as a "Worth adding to Notion" list.

It runs in the Supabase Edge Function `supabase/functions/studio-ai-draft`, because API keys can't live in a static site.

1. Deploy the function: `supabase functions deploy studio-ai-draft --project-ref <project-id>`
   (or Supabase dashboard → Edge Functions → Deploy a new function → via Editor, name `studio-ai-draft`, paste `index.ts`).
2. Add secrets (dashboard → Edge Functions → Secrets, or `supabase secrets set NAME=value`):
   - `ANTHROPIC_API_KEY` — from console.anthropic.com (billed per draft)
   - `NOTION_TOKEN` — the Case Study Studio integration's Internal Integration Secret
   - `FIGMA_TOKEN` — Figma personal access token with `file_content:read`
   - `STUDIO_PASSCODE` — any phrase; the Studio asks for it once per browser
   - `CLAUDE_MODEL` — optional, defaults to `claude-sonnet-5-5`
3. In Notion, open the project page → ••• → Connections → add the integration, so it can read that page and its subpages.
4. In the Studio, paste the Notion page link and the Figma page link under Connections, then press **Draft case study**.
