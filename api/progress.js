import { db, auth } from 'hatchable';
export const access='user';
export const methods=['GET','POST'];
export default async function(req,res){
 const user=req.user;
 if(req.method==='POST'){
  const lesson=String(req.body?.lesson||'');
  const found=await db.query('SELECT id FROM lessons WHERE title=$1',[lesson]);
  if(!found.rows[0]) return res.status(404).json({error:'Lesson not found'});
  await db.query('INSERT INTO lesson_progress (user_id,lesson_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[user.id,found.rows[0].id]);
  return res.json({ok:true});
 }
 const q=await db.query('SELECT l.title,l.level,lp.completed_at FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id WHERE lp.user_id=$1 ORDER BY l.lesson_order',[user.id]);
 res.json({progress:q.rows});
}