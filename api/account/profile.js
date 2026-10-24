import { db } from 'hatchable';
export const access = 'user';
export const methods = ['GET', 'POST'];
export default async function (req, res) {
  const user = req.user;
  if (req.method === 'GET') {
    const result = await db.query('SELECT full_name, skill_level FROM user_profiles WHERE user_id = $1', [user.id]);
    return res.json(result.rows[0] || { full_name: user.name || '', skill_level: '' });
  }
  const fullName = String(req.body?.full_name || '').trim().slice(0, 120);
  const skillLevel = String(req.body?.skill_level || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Please enter your full name.' });
  if (skillLevel && !['Beginner', 'Intermediate', 'Advanced'].includes(skillLevel)) return res.status(400).json({ error: 'Invalid skill level.' });
  await db.query('INSERT INTO user_profiles (user_id, full_name, skill_level) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, skill_level = EXCLUDED.skill_level, updated_at = NOW()', [user.id, fullName, skillLevel]);
  return res.json({ ok: true, full_name: fullName, skill_level: skillLevel });
}