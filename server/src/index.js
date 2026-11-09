import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'absensi.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nip TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '-',
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  qr_token TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  day TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT,
  UNIQUE(employee_id,day)
);
CREATE INDEX IF NOT EXISTS idx_attendance_day ON attendance(day);
`);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Wajib set JWT_SECRET minimal 32 karakter di server/.env');
  process.exit(1);
}
const adminNip = process.env.ADMIN_NIP || 'admin';
const adminPin = process.env.ADMIN_PIN;
if (!db.prepare('SELECT 1 FROM employees WHERE role = ?').get('admin')) {
  if (!adminPin || adminPin.length < 8) {
    console.error('Wajib set ADMIN_PIN minimal 8 karakter untuk pembuatan akun admin awal');
    process.exit(1);
  }
  db.prepare(`INSERT INTO employees (nip,name,department,pin_hash,role,qr_token)
    VALUES (?,?,?,?,?,?)`).run(adminNip, 'Administrator', 'HRD', bcrypt.hashSync(adminPin, 12), 'admin', crypto.randomBytes(32).toString('hex'));
  console.log(`Akun admin awal dibuat dengan NIP: ${adminNip}`);
}
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(x => x.trim()) }));
app.use(express.json({limit:'20kb'}));
const loginLimiter = rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false});
const scanLimiter = rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false});
const cleanUser = u => ({id:u.id,nip:u.nip,name:u.name,department:u.department,role:u.role,active:!!u.active});
const sqlUser = 'SELECT * FROM employees WHERE id = ?';

function auth(req,res,next) {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/);
  if (!bearer) return res.status(401).json({error:'Silakan masuk terlebih dahulu'});
  try {
    const payload = jwt.verify(bearer[1],process.env.JWT_SECRET,{algorithms:['HS256']});
    const user = db.prepare(sqlUser).get(payload.sub);
    if (!user?.active) return res.status(401).json({error:'Akun tidak aktif'});
    req.user = user;
    next();
  } catch {return res.status(401).json({error:'Sesi tidak valid atau kedaluwarsa'});}
}
function admin(req,res,next) {return req.user.role === 'admin' ? next() : res.status(403).json({error:'Hanya admin yang dapat mengakses'});}
const validString = (v,max) => typeof v === 'string' && !!v.trim() && v.trim().length <= max;

function officeNow() {
  const date = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,x.value]));
  return {day:`${parts.year}-${parts.month}-${parts.day}`, clock:`${parts.hour}:${parts.minute}:${parts.second}`, iso:date.toISOString()};
}

app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.post('/api/login',loginLimiter,(req,res)=>{
  const {nip,pin} = req.body || {};
  if (!validString(nip,40) || !validString(pin,128)) return res.status(400).json({error:'NIP dan PIN wajib diisi'});
  const user = db.prepare('SELECT * FROM employees WHERE nip = ?').get(nip.trim());
  if (!user || !user.active || !bcrypt.compareSync(pin,user.pin_hash)) return res.status(401).json({error:'NIP atau PIN salah'});
  const token = jwt.sign({},process.env.JWT_SECRET,{subject:String(user.id),expiresIn:'8h',algorithm:'HS256'});
  res.json({token,user:cleanUser(user)});
});
app.get('/api/me',auth,(req,res)=>res.json({user:cleanUser(req.user)}));
app.get('/api/my-qr',auth,async(req,res)=>{
  try {const image = await QRCode.toDataURL(req.user.qr_token,{width:320,margin:2,errorCorrectionLevel:'M'});res.json({image});}
  catch {res.status(500).json({error:'Gagal membuat QR'});}
});
app.get('/api/my-attendance',auth,(req,res)=>{
  const rows = db.prepare(`SELECT day,check_in,check_out FROM attendance WHERE employee_id = ? ORDER BY day DESC LIMIT 30`).all(req.user.id);
  res.json({rows});
});
app.get('/api/employees',auth,admin,(_req,res)=>{
  const rows = db.prepare(`SELECT id,nip,name,department,role,active,created_at FROM employees WHERE role = 'employee' ORDER BY id DESC`).all();
  res.json({rows:rows.map(cleanUser)});
});
app.post('/api/employees',auth,admin,async(req,res)=>{
  const {nip,name,department,pin} = req.body || {};
  if(!validString(nip,40)||!validString(name,100)||!validString(department,80)||!validString(pin,128)||pin.length<6)
    return res.status(400).json({error:'Isi NIP, nama, bagian, dan PIN minimal 6 karakter'});
  try {
    const result=db.prepare(`INSERT INTO employees (nip,name,department,pin_hash,role,qr_token) VALUES (?,?,?,?,?,?)`).run(
      nip.trim(),name.trim(),department.trim(),bcrypt.hashSync(pin,12),'employee',crypto.randomBytes(32).toString('hex'));
    const user=db.prepare(sqlUser).get(result.lastInsertRowid);
    const image=await QRCode.toDataURL(user.qr_token,{width:320,margin:2,errorCorrectionLevel:'M'});
    res.status(201).json({user:cleanUser(user),image});
  } catch(e) {return res.status(409).json({error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'NIP sudah digunakan':'Gagal membuat pegawai'});}
});
app.get('/api/employees/:id/qr',auth,admin,async(req,res)=>{
  const user=db.prepare(`SELECT * FROM employees WHERE id=? AND role='employee'`).get(Number(req.params.id));
  if(!user)return res.status(404).json({error:'Pegawai tidak ditemukan'});
  try {res.json({image:await QRCode.toDataURL(user.qr_token,{width:320,margin:2,errorCorrectionLevel:'M'})});}
  catch {res.status(500).json({error:'Gagal membuat QR'});}
});
app.patch('/api/employees/:id',auth,admin,(req,res)=>{
  const {nip,name,department,pin}=req.body||{};
  if(!validString(nip,40)||!validString(name,100)||!validString(department,80)||(pin!==undefined&&(!validString(pin,128)||pin.length<6)))
    return res.status(400).json({error:'Isi NIP, nama, bagian, dan PIN minimal 6 karakter jika PIN diubah'});
  try {
    const id=Number(req.params.id);
    const update=pin===undefined
      ? db.prepare(`UPDATE employees SET nip=?,name=?,department=? WHERE id=? AND role='employee'`).run(nip.trim(),name.trim(),department.trim(),id)
      : db.prepare(`UPDATE employees SET nip=?,name=?,department=?,pin_hash=? WHERE id=? AND role='employee'`).run(nip.trim(),name.trim(),department.trim(),bcrypt.hashSync(pin,12),id);
    if(!update.changes)return res.status(404).json({error:'Pegawai tidak ditemukan'});
    res.json({user:cleanUser(db.prepare(sqlUser).get(id))});
  } catch(e) {return res.status(409).json({error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'NIP sudah digunakan':'Gagal memperbarui pegawai'});}
});
app.delete('/api/employees/:id',auth,admin,(req,res)=>{
  const id=Number(req.params.id);
  const remove=db.transaction(()=>{
    const user=db.prepare(`SELECT id FROM employees WHERE id=? AND role='employee'`).get(id);
    if(!user)return false;
    db.prepare('DELETE FROM attendance WHERE employee_id=?').run(id);
    db.prepare('DELETE FROM employees WHERE id=?').run(id);
    return true;
  });
  if(!remove())return res.status(404).json({error:'Pegawai tidak ditemukan'});
  res.json({ok:true});
});
app.get('/api/attendance',auth,admin,(req,res)=>{
  const day = req.query.day;
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({error:'Format tanggal salah'});
  const sql = `SELECT a.id,e.nip,e.name,e.department,a.day,a.check_in,a.check_out FROM attendance a JOIN employees e ON e.id=a.employee_id`;
  const rows=day ? db.prepare(`${sql} WHERE a.day = ? ORDER BY a.check_in DESC`).all(day) : db.prepare(`${sql} ORDER BY a.check_in DESC LIMIT 200`).all();
  res.json({rows});
});
const performScan = db.transaction(token => {
  const employee = db.prepare(`SELECT * FROM employees WHERE qr_token = ? AND active=1 AND role='employee'`).get(token);
  if (!employee) return {status:404,error:'QR tidak dikenal atau pegawai nonaktif'};
  const now=officeNow();
  const previous=db.prepare('SELECT * FROM attendance WHERE employee_id=? AND day=?').get(employee.id,now.day);
  if (!previous) {
    db.prepare('INSERT INTO attendance (employee_id,day,check_in) VALUES (?,?,?)').run(employee.id,now.day,now.iso);
    return {status:200,employee:cleanUser(employee),action:'in',clock:now.clock,message:'Absen masuk berhasil'};
  }
  if (!previous.check_out) {
    // 60-second protection against an accidental second scan that would count as checkout.
    if (Date.now()-Date.parse(previous.check_in)<60_000) return {status:409,error:'Sudah absen masuk. Tunggu setidaknya 1 menit sebelum absen pulang'};
    db.prepare('UPDATE attendance SET check_out=? WHERE id=?').run(now.iso,previous.id);
    return {status:200,employee:cleanUser(employee),action:'out',clock:now.clock,message:'Absen pulang berhasil'};
  }
  return {status:409,error:'Pegawai sudah absen masuk dan pulang hari ini'};
});
app.post('/api/scan',scanLimiter,(req,res)=>{
  const {qrToken}=req.body || {};
  if (!validString(qrToken,256)) return res.status(400).json({error:'QR tidak valid'});
  const result=performScan(qrToken.trim());
  res.status(result.status).json(result.status === 200 ? {message:result.message,employee:result.employee,action:result.action,clock:result.clock} : {error:result.error});
});

const port=Number(process.env.PORT)||4000;
app.listen(port,()=>console.log(`API berjalan di http://localhost:${port}`));
