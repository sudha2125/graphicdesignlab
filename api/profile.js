import { db } from 'hatchable';
export const access='user';
export const methods=['GET'];
export default async function(req,res){
 const u=req.user;
 const [done,saved,tuts,total,profile]=await Promise.all([
  db.query('SELECT count(*)::int AS n FROM lesson_progress WHERE user_id=$1',[u.id]),
  db.query('SELECT count(*)::int AS n FROM saved_items WHERE user_id=$1',[u.id]),
  db.query("SELECT count(*)::int AS n FROM saved_items WHERE user_id=$1 AND item_type='tutorial'",[u.id]),
  db.query('SELECT count(*)::int AS n FROM lessons'),
  db.query('SELECT full_name FROM user_profiles WHERE user_id=$1',[u.id])
 ]);
 const completed=done.rows[0].n; const all=total.rows[0].n;
 res.json({completed,saved:saved.rows[0].n,tutorials:tuts.rows[0].n,progress:all?Math.round(completed*100/all):0,full_name:profile.rows[0]?.full_name||u.name||''});
}