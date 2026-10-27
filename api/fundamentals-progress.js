import { db } from 'hatchable';
export const access='user';
export const methods=['GET','POST'];
async function ensure(){await db.query(`CREATE TABLE IF NOT EXISTS fundamentals_progress (user_id text NOT NULL, lesson_key text NOT NULL, quiz_score integer NOT NULL DEFAULT 0, practice_completed boolean NOT NULL DEFAULT false, lesson_completed boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,lesson_key))`)}
export default async function(req,res){
 await ensure(); const uid=req.user?.id; if(!uid) return res.status(401).json({error:'Sign in required.'});
 if(req.method==='GET'){const r=await db.query('SELECT lesson_key,quiz_score,practice_completed,lesson_completed,updated_at FROM fundamentals_progress WHERE user_id=$1',[uid]);return res.json({items:r.rows});}
 const b=req.body||{}; if(!b.lesson_key||typeof b.lesson_key!=='string')return res.status(400).json({error:'lesson_key required'});
 const score=Math.max(0,Math.min(3,Number.isFinite(Number(b.quiz_score))?Number(b.quiz_score):0)); const practice=Boolean(b.practice_completed); const complete=Boolean(b.lesson_completed);
 await db.query(`INSERT INTO fundamentals_progress(user_id,lesson_key,quiz_score,practice_completed,lesson_completed,updated_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(user_id,lesson_key) DO UPDATE SET quiz_score=EXCLUDED.quiz_score,practice_completed=EXCLUDED.practice_completed,lesson_completed=EXCLUDED.lesson_completed,updated_at=now()`,[uid,b.lesson_key,score,practice,complete]);
 return res.json({ok:true,lesson_key:b.lesson_key,quiz_score:score,practice_completed:practice,lesson_completed:complete});
}