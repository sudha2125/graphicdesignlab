import { ai, db } from 'hatchable';

export const methods = ['GET', 'POST', 'DELETE'];
export const access = 'user';

const SYSTEM = `You are Design Mentor AI, a friendly professional graphic design mentor for beginner and intermediate designers. Teach graphic design fundamentals, visual hierarchy, contrast, typography, colour theory, composition, layout, branding, logos, posters, social media design, restaurant branding, Photoshop, Canva, Figma, workflow, client work and portfolios. Be practical and clear. Give examples and actionable steps. Never claim to see an image unless one is actually supplied.`;

export default async function (req, res) {
  const userId = String(req.user.id);

  try {
    if (req.method === 'GET') {
      const id = req.query?.conversation_id;
      if (id) {
        const result = await db.query(
          'SELECT id, role, message, created_at FROM chat_messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at ASC',
          [id, userId]
        );
        return res.json({ messages: result.rows.map(row => ({ id: row.id, role: row.role, content: row.message, created_at: row.created_at })) });
      }

      const result = await db.query(
        'SELECT id, title, created_at, updated_at FROM chat_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
        [userId]
      );
      return res.json({ conversations: result.rows });
    }

    if (req.method === 'DELETE') {
      const id = req.body?.conversation_id || req.query?.conversation_id;
      if (!id) return res.status(400).json({ error: 'conversation_id is required.' });
      await db.query('DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.json({ ok: true });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required.' });
    if (message.length > 8000) return res.status(413).json({ error: 'Please keep each message under 8,000 characters.' });

    let conversationId = req.body?.conversation_id || null;
    if (conversationId) {
      const owned = await db.query(
        'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      if (!owned.rows.length) conversationId = null;
    }

    if (!conversationId) {
      const title = message.length > 52 ? message.slice(0, 52) + '…' : message;
      const created = await db.query(
        'INSERT INTO chat_conversations (user_id, title) VALUES ($1, $2) RETURNING id',
        [userId, title]
      );
      conversationId = created.rows[0].id;
    }

    await db.query(
      'INSERT INTO chat_messages (conversation_id, user_id, role, message) VALUES ($1, $2, $3, $4)',
      [conversationId, userId, 'user', message]
    );

    const history = await db.query(
      'SELECT role, message FROM chat_messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 30',
      [conversationId, userId]
    );

    const result = await ai.generateText({
      purpose: 'design-mentor-chat',
      model: 'gemini',
      userId,
      maxTokens: 1800,
      signal: AbortSignal.timeout(55000),
      system: SYSTEM,
      messages: history.rows.reverse().map(row => ({ role: row.role, content: row.message }))
    });

    const answer = String(result.text || '').trim();
    if (!answer) {
      console.error('Design Mentor returned an empty response', { finishReason: result.finishReason });
      return res.status(502).json({ error: 'Google AI returned an empty response. Check the Google AI key and model access in Hatchable Setup.' });
    }

    await db.query(
      'INSERT INTO chat_messages (conversation_id, user_id, role, message) VALUES ($1, $2, $3, $4)',
      [conversationId, userId, 'assistant', answer]
    );
    await db.query(
      'UPDATE chat_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    return res.json({ conversation_id: conversationId, message: { role: 'assistant', content: answer } });
  } catch (error) {
    console.error('design-mentor chat failed', error);
    const detail = String(error?.message || error);
    if (/setup_required|provider key|API key|Google|Gemini|quota|billing|429|401|403/i.test(detail)) {
      return res.status(502).json({ error: 'Google AI could not respond. Confirm your Google/Gemini provider key is saved in Hatchable Setup and that your key has Gemini API access.', detail });
    }
    return res.status(502).json({ error: 'Design Mentor AI could not respond. Please try again.', detail });
  }
}