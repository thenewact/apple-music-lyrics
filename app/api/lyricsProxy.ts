// pages/api/lyricsProxy.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const artist = String(req.query.artist || "");
  const title = String(req.query.title || "");

  if (!artist && !title) {
    return res.status(400).json({ error: "artist or title query required" });
  }

  try {
    // lrclib search endpoint (adjust if lrclib API differs)
    const lrUrl = `https://lrclib.net/search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    const lr = await fetch(lrUrl);
    if (lr.ok) {
      const txt = await lr.text();
      return res.status(200).setHeader("content-type", "text/plain; charset=utf-8").send(txt);
    }

    // fallback MusicBrainz search
    const mbUrl = `https://musicbrainz.org/ws/2/recording/?query=artist:${encodeURIComponent(
      artist
    )}%20AND%20recording:${encodeURIComponent(title)}&fmt=json`;
    const mb = await fetch(mbUrl, { headers: { "User-Agent": "lyrics-client/1.0 (you@example.com)" } });
    if (!mb.ok) return res.status(502).json({ error: "MusicBrainz lookup failed" });
    const json = await mb.json();
    return res.status(200).json({ musicbrainz: json });
  } catch (err) {
    console.error("lyricsProxy error", err);
    return res.status(500).json({ error: "internal" });
  }
}
