import { db } from 'hatchable';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 const [l,t,r,v]=await Promise.all([
  db.query('SELECT id,title,level,category,duration,lesson_order AS ord FROM lessons ORDER BY lesson_order'),
  db.query('SELECT id,name,pricing,level,category,description,best_for,url FROM tools ORDER BY name'),
  db.query('SELECT id,name,category,pricing,description,url FROM resources ORDER BY category,name'),
  db.query('SELECT id,title,channel,duration,level,software,url FROM tutorials ORDER BY id')
 ]);
 res.json({lessons:l.rows,tools:t.rows,resources:r.rows,tutorials:v.rows});
}