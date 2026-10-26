import { ai, db, storage } from 'hatchable';

export const methods = ['GET', 'POST', 'DELETE'];
export const access = 'user';

const SYSTEM = `You are an expert graphic designer and visual communication reviewer teaching beginner and intermediate learners. Analyze ONLY the exact uploaded image supplied by the user. Ground observations in visible evidence. Clearly distinguish direct observations from subjective recommendations. Do not invent text, objects, colours, or layout details. If text is too small to read, say so. Return valid JSON only, without markdown fences.

Return this shape, using scores from 0 to 100:
{
  "overall_score": 75,
  "summary": "specific verdict grounded in this image",
  "strongest_part": "the clearest strength visible in this image",
  "hierarchy": {"score": 70, "review": "observed evidence and its effect"},
  "typography": {"score": 72, "review": "observed evidence; note limits if text is unreadable"},
  "color": {"score": 80, "review": "observed palette, contrast, and harmony"},
  "layout": {"score": 68, "review": "observed alignment, spacing, margins, and balance"},
  "imagery": {"score": 78, "review": "observed image quality, crop, composition, and relevance"},
  "cta": {"score": 70, "review": "whether the message/action is visible; say not applicable if none"},
  "observed_colors": [{"name":"navy","hex":"#123456","role":"background"}],
  "recommended_palette": [{"name":"Deep navy","hex":"#10243A","role":"background","reason":"..."}],
  "font_pairings": [{"heading":"Montserrat Bold","body":"Inter Regular","reason":"..."}],
  "whats_working": [{"title":"specific strength","description":"what is visible and why it works"}],
  "problems": [{"title":"specific issue","description":"what is visibly causing it","evidence":"observed in image"}],
  "improvements": [{"priority":"High","title":"specific change","issue":"observed issue","recommendation":"specific actionable change","why":"why it matters","how":"steps in Canva, Photoshop, or Figma","expected_result":"likely improvement","example":"optional concrete example"}],
  "markers": [{"x":50,"y":35,"label":"...","detail":"specific issue in this area; x/y percentages from left/top"}],
  "next_steps": ["action one","action two","action three"],
  "beginner_explanation": [{"concept":"Visual hierarchy","simple_explanation":"plain English","example":"example relevant to this image"}],
  "practice_task": "short practice exercise based on a weakness observed in this image",
  "final_recommendations": [{"title":"...","description":"..."}]
}
Rules: scores must reflect this image and not be identical by default. Return 2-5 strengths, 2-5 evidence-based problems, 3-6 improvements prioritized High/Medium/Low, 2-5 observed colours only when reasonably identifiable, 3-5 recommended palette colours with valid HEX codes, 1-3 font pairings, exactly 3 next steps. Use markers only for clearly locatable issues; never invent precise locations. Never claim the image was edited. Recommendations can be subjective but label them as suggestions.`;

function cleanJson(value) {
  const stripped = String(value || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
  throw new Error('The AI returned an invalid report. Please retry.');
}

export default async function(req, res) {
  const user = req.user;
  if (req.method === 'GET') {
    const q = await db.query('SELECT id, analysis, created_at FROM design_reviews WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [String(user.id)]);
    return res.json({ reports: q.rows });
  }
  if (req.method === 'DELETE') {
    const id = String(req.body?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'A valid report ID is required.' });
    const q = await db.query('DELETE FROM design_reviews WHERE id = $1 AND user_id = $2 RETURNING id', [id, String(user.id)]);
    if (!q.rows.length) return res.status(404).json({ error: 'Saved report not found.' });
    return res.json({ ok: true, id });
  }

  const { image_url: imageUrl, storage_key: storageKey } = req.body || {};
  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.length > 4096) return res.status(400).json({ error: 'A valid uploaded image is required.' });
  if (!storageKey || typeof storageKey !== 'string' || !storageKey.startsWith(`tmp/design-reviews/${user.id}/`)) return res.status(403).json({ error: 'Invalid upload ownership. Please upload the image again.' });

  try {
    const result = await ai.generateText({
      purpose: 'design-review',
      model: 'gemini',
      userId: user.id,
      maxTokens: 7000,
      signal: AbortSignal.timeout(55000),
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect this exact uploaded image and return the requested JSON report. Scores are out of 100. Be specific and honest; do not infer invisible details.' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }]
    });
    if (result.finishReason === 'length') throw new Error('The AI report was truncated. Please try again.');
    const analysis = cleanJson(result.text);
    for (const key of ['hierarchy', 'typography', 'color', 'layout']) {
      if (!Number.isFinite(Number(analysis?.[key]?.score))) throw new Error('The AI report is missing a required score. Please retry.');
      analysis[key].score = Math.max(0, Math.min(100, Number(analysis[key].score)));
    }
    if (!Number.isFinite(Number(analysis.overall_score))) throw new Error('The AI report is missing its overall score. Please retry.');
    analysis.overall_score = Math.max(0, Math.min(100, Number(analysis.overall_score)));
    const saved = await db.query('INSERT INTO design_reviews (user_id, analysis) VALUES ($1, $2::jsonb) RETURNING id, created_at', [String(user.id), JSON.stringify(analysis)]);
    try { await storage.del(storageKey); } catch (cleanupError) { console.warn('Temporary design upload cleanup failed'); }
    return res.json({ analysis, analysis_id: saved.rows[0].id, created_at: saved.rows[0].created_at });
  } catch (error) {
    console.error('design-review failed', { message: String(error?.message || error) });
    try { await storage.del(storageKey); } catch {}
    const message = String(error?.message || '');
    if (/setup_required|API key|provider|credit|spend.limit/i.test(message)) return res.status(503).json({ error: 'The AI service needs setup or has reached its usage limit. Check the project AI setup and try again.' });
    return res.status(502).json({ error: 'AI analysis failed. No sample results were shown. Please try again in a moment.' });
  }
}