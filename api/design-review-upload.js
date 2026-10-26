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
  const bytes = file.buffer;
  const jpeg = file.contentType === 'image/jpeg' && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  const png = file.contentType === 'image/png' && bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = file.contentType === 'image/webp' && bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(jpeg || png || webp)) return res.status(415).json({ error: 'The file contents do not match a supported JPG, PNG or WEBP image.' });

  const ext = file.contentType === 'image/png' ? 'png' : file.contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `tmp/design-reviews/${user.id}/${crypto.randomUUID()}.${ext}`;
  const url = await storage.put(key, file.buffer, file.contentType);
  res.json({ url, key });
}