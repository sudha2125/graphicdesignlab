import { ai, db, storage } from 'hatchable';

export const methods = ['POST'];
export const access = 'user';

const SYSTEM = `You are an expert graphic designer and visual communication reviewer. Analyze ONLY the exact uploaded image supplied by the user. Do not invent visible details and do not give a generic template review. Identify what is actually visible in the image: text hierarchy, typography characteristics, colors, layout, imagery, spacing, alignment, CTA, message clarity, and visual flow. Scores must reflect the actual image. Return valid JSON only, with no markdown fences.

Use this exact JSON shape:
{
  "overall_score": 7.3,
  "summary": "short personalized verdict",
  "hierarchy": {"score": 8, "review": "specific observation from this image"},
  "typography": {"score": 7, "review": "specific observation from this image"},
  "color": {"score": 8, "review": "specific observation from this image"},
  "layout": {"score": 6, "review": "specific observation from this image"},
  "imagery": {"score": 7, "review": "specific observation from this image"},
  "cta": {"score": 7, "review": "specific observation from this image"},
  "whats_working": [{"title":"specific strength","description":"why it works in this image"}],
  "problems": [{"title":"specific problem","description":"what is visibly causing the issue"}],
  "detailed_review": "A concise but detailed review grounded in the uploaded image.",
  "improvements": [{"title":"Improve Typography","issue":"specific visible issue","recommendation":"specific change","example":"optional concrete font, size, spacing, palette or CTA example"}],
  "markers": [{"x":50,"y":35,"label":"Increase headline contrast","detail":"Specific area and change. x/y are percentages from the image's left/top edge."}],
  "final_recommendations": [{"title":"Recommended Direction","description":"specific final design direction"}]
}

Rules: scores are 0-10 and may use one decimal. Return 2-5 strengths, 2-5 problems, 3-6 improvements, and 2-5 final recommendations. Use markers only for clearly locatable issues and give x/y percentages based on the actual uploaded image. Never claim to have changed the image or generated an edited image.`;

function cleanJson(text) {
  const stripped = String(text || '').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try { return JSON.parse(stripped); } catch {}
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
  throw new Error('AI returned invalid analysis JSON.');
}

export default async function(req, res) {
  const user = req.user;
  const { image_url: imageUrl, storage_key: storageKey } = req.body || {};
  if (!imageUrl || typeof imageUrl !== 'string') return res.status(400).json({ error: 'image_url is required.' });
  if (storageKey && !storageKey.startsWith(`tmp/design-reviews/${user.id}/`)) return res.status(403).json({ error: 'Invalid upload ownership.' });

  try {
    const result = await ai.generateText({
      purpose: 'design-review',
      // Uses the project-wide AI_DEFAULT_MODEL selected in Hatchable Monitoring.
      userId: user.id,
      maxTokens: 7000,
      signal: AbortSignal.timeout(60000),
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze the uploaded graphic design image now. Every observation must be grounded in what you can actually see in this exact image. Return the requested JSON.' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }]
    });
    if (result.finishReason === 'length') return res.status(502).json({ error: 'The AI analysis was truncated. Please try again.' });
    const analysis = cleanJson(result.text);
    const saved = await db.query('INSERT INTO design_reviews (user_id, analysis) VALUES ($1, $2::jsonb) RETURNING id', [String(user.id), JSON.stringify(analysis)]);
    if (storageKey) { try { await storage.del(storageKey); } catch {} }
    res.json({ analysis, analysis_id: saved.rows[0].id });
  } catch (error) {
    console.error('design-review failed', error);
    if (storageKey) { try { await storage.del(storageKey); } catch {} }
    res.status(502).json({ error: 'AI analysis failed. Please try again.', detail: String(error?.message || error) });
  }
}