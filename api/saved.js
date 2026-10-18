import { db } from 'hatchable';
export const access='user';
export const methods=['GET','POST','DELETE'];
const tables={tool:'tools',resource:'resources',tutorial:'tutorials',lesson:'lessons'};
export default async function(req,res){
 const user=req.user;
 if(req.method==='POST'){
  const type=String(req.body?.item_type||''); const id=String(req.body?.item_id||'');
  if(!tables[type]) return res.status(400).json({error:'Invalid item type'});
  await db.query('INSERT INTO saved_items (user_id,item_type,item_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,type,id]);
  return res.json({ok:true});
 }
 if(req.method==='DELETE'){
  await db.query('DELETE FROM saved_items WHERE user_id=$1 AND item_type=$2 AND item_id=$3',[user.id,req.body.item_type,req.body.item_id]);
  return res.json({ok:true});
 }
 const q=await db.query('SELECT item_type,item_id,saved_at FROM saved_items WHERE user_id=$1 ORDER BY saved_at DESC',[user.id]);
 res.json({items:q.rows});
}