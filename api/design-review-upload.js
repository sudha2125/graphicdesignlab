import { storage } from 'hatchable';
import crypto from 'node:crypto';

export const methods = ['POST'];
export const access = 'user';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp']);

export default async function(req, res) {
  const user = req.user;
  const file = (req.files || []).find(f => f.field === 'file');
  if (!file) return res.status(400).json({ error: 'No design image was uploaded.' });
  if (file.buffer.length > MAX_BYTES) return res.status(413).json({ error: 'File too large. Maximum size is 10 MB.' });
  if (!ALLOWED.has(file.contentType)) return res.status(415).json({ error: 'Unsupported image type. Use JPG, JPEG, PNG or WEBP.' });

  const ext = file.contentType === 'image/png' ? 'png' : file.contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `tmp/design-reviews/${user.id}/${crypto.randomUUID()}.${ext}`;
  const url = await storage.put(key, file.buffer, file.contentType);
  res.json({ url, key });
}