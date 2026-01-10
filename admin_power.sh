#!/bin/bash

cd coursework-ib

echo "🔧 UPGRADE: КНОПКА ВЫХОДА + РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЕЙ..."

# ==========================================
# 1. BACKEND (НОВЫЙ МЕТОД UPDATE USER)
# ==========================================
cat <<EOF > backend/src/main.rs
mod models;
mod utils;

use actix_web::{web, App, HttpServer, HttpResponse, Responder};
use actix_cors::Cors;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use models::{user, document, audit, comment};
use utils::crypto_ffi;
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use chrono::Local;

#[derive(Deserialize)]
struct RegReq { username: String, password: String, full_name: String }
#[derive(Deserialize)]
struct LoginReq { username: String, password: String }
#[derive(Deserialize)]
struct DocReq { title: String, content: String, username: String }
#[derive(Deserialize)]
struct CommentReq { doc_id: i32, text: String, username: String }
// НОВОЕ: Структура для обновления пользователя
#[derive(Deserialize)]
struct UpdateUserReq { full_name: String, username: String, role: String }

async fn log_audit(db: &DatabaseConnection, username: String, action: &str, details: &str) {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let safe_details = if details.len() > 500 { format!("{}...", &details[..500]) } else { details.to_string() };
    
    let log = audit::ActiveModel {
        username: Set(username),
        action: Set(action.to_string()),
        details: Set(safe_details),
        created_at: Set(now),
        ..Default::default()
    };
    let _ = audit::Entity::insert(log).exec(db).await;
}

async fn register(db: web::Data<DatabaseConnection>, req: web::Json<RegReq>) -> impl Responder {
    let role = if req.username.contains("admin") { "admin" } else { "user" };
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let new_user = user::ActiveModel {
        username: Set(req.username.clone()),
        password: Set(req.password.clone()),
        full_name: Set(req.full_name.clone()),
        role: Set(role.to_string()),
        created_at: Set(now),
        ..Default::default()
    };
    match user::Entity::insert(new_user).exec(db.get_ref()).await {
        Ok(_) => {
            log_audit(db.get_ref(), req.username.clone(), "REGISTER", "New user registered").await;
            HttpResponse::Ok().json("Registered")
        },
        Err(_) => HttpResponse::BadRequest().body("User exists")
    }
}

async fn login(db: web::Data<DatabaseConnection>, req: web::Json<LoginReq>) -> impl Responder {
    let u = user::Entity::find().filter(user::Column::Username.eq(&req.username)).one(db.get_ref()).await.unwrap();
    if let Some(user) = u {
        if user.password == req.password {
            log_audit(db.get_ref(), user.username.clone(), "LOGIN", "Login successful").await;
            return HttpResponse::Ok().json(serde_json::json!({"token": "jwt", "user": user}));
        }
    }
    HttpResponse::Unauthorized().body("Invalid")
}

async fn create_doc(db: web::Data<DatabaseConnection>, req: web::Json<DocReq>) -> impl Responder {
    let encrypted = crypto_ffi::encrypt(&req.content);
    let doc = document::ActiveModel {
        title: Set(req.title.clone()),
        content_encrypted: Set(encrypted),
        owner_name: Set(req.username.clone()),
        ..Default::default()
    };
    let res = document::Entity::insert(doc).exec(db.get_ref()).await.unwrap();
    log_audit(db.get_ref(), req.username.clone(), "CREATE_DOC", &format!("ID: {}", res.last_insert_id)).await;
    HttpResponse::Ok().json("Created")
}

async fn get_docs(db: web::Data<DatabaseConnection>) -> impl Responder {
    let docs = document::Entity::find().all(db.get_ref()).await.unwrap();
    let mut result = Vec::new();
    for d in docs {
        let decrypted = crypto_ffi::decrypt(&d.content_encrypted);
        result.push(serde_json::json!({
            "id": d.id, "title": d.title, "content": decrypted, "author": d.owner_name
        }));
    }
    HttpResponse::Ok().json(result)
}

async fn delete_doc(db: web::Data<DatabaseConnection>, path: web::Path<i32>) -> impl Responder {
    let id = path.into_inner();
    let _ = document::Entity::delete_by_id(id).exec(db.get_ref()).await;
    HttpResponse::Ok().json("Deleted")
}

async fn delete_user(db: web::Data<DatabaseConnection>, path: web::Path<i32>) -> impl Responder {
    let id = path.into_inner();
    let _ = user::Entity::delete_by_id(id).exec(db.get_ref()).await;
    // Log audit skipped here for simplicity, ideally pass admin username
    HttpResponse::Ok().json("User deleted")
}

// НОВОЕ: Обновление пользователя
async fn update_user(db: web::Data<DatabaseConnection>, path: web::Path<i32>, req: web::Json<UpdateUserReq>) -> impl Responder {
    let id = path.into_inner();
    let user_opt = user::Entity::find_by_id(id).one(db.get_ref()).await.unwrap();
    
    if let Some(u) = user_opt {
        let mut active: user::ActiveModel = u.into();
        active.full_name = Set(req.full_name.clone());
        active.username = Set(req.username.clone());
        active.role = Set(req.role.clone());
        
        active.update(db.get_ref()).await.unwrap();
        HttpResponse::Ok().json("Updated")
    } else {
        HttpResponse::NotFound().body("User not found")
    }
}

async fn add_comment(db: web::Data<DatabaseConnection>, req: web::Json<CommentReq>) -> impl Responder {
    let now = Local::now().format("%Y-%m-%d %H:%M").to_string();
    let comment = comment::ActiveModel {
        doc_id: Set(req.doc_id),
        admin_name: Set(req.username.clone()),
        text: Set(req.text.clone()),
        created_at: Set(now),
        ..Default::default()
    };
    comment::Entity::insert(comment).exec(db.get_ref()).await.unwrap();
    log_audit(db.get_ref(), req.username.clone(), "COMMENT", &format!("Doc: {}", req.doc_id)).await;
    HttpResponse::Ok().json("Added")
}

async fn get_comments(db: web::Data<DatabaseConnection>, path: web::Path<i32>) -> impl Responder {
    let id = path.into_inner();
    let comments = comment::Entity::find().filter(comment::Column::DocId.eq(id)).all(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(comments)
}

async fn get_users(db: web::Data<DatabaseConnection>) -> impl Responder {
    let users = user::Entity::find().all(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(users)
}

async fn get_audit(db: web::Data<DatabaseConnection>) -> impl Responder {
    let logs = audit::Entity::find().order_by_desc(audit::Column::Id).limit(100).all(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(logs)
}

async fn get_stats(db: web::Data<DatabaseConnection>) -> impl Responder {
    let u_c = user::Entity::find().count(db.get_ref()).await.unwrap();
    let d_c = document::Entity::find().count(db.get_ref()).await.unwrap();
    let a_c = audit::Entity::find().count(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(serde_json::json!({"users": u_c, "docs": d_c, "audits": a_c}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let db_url = env::var("DATABASE_URL").expect("DB URL set");
    let mut db: Option<DatabaseConnection> = None;
    for i in 1..=10 {
        if let Ok(conn) = Database::connect(&db_url).await { db = Some(conn); break; }
        sleep(Duration::from_secs(3)).await;
    }
    let db = db.expect("DB Failed");

    let builder = db.get_database_backend();
    let schema = Schema::new(builder);
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::user::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::document::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::audit::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::comment::Entity))).await;

    HttpServer::new(move || {
        App::new()
            .wrap(Cors::permissive())
            .app_data(web::JsonConfig::default().limit(20 * 1024 * 1024))
            .app_data(web::Data::new(db.clone()))
            .route("/api/register", web::post().to(register))
            .route("/api/login", web::post().to(login))
            .route("/api/documents", web::post().to(create_doc))
            .route("/api/documents", web::get().to(get_docs))
            .route("/api/documents/{id}", web::delete().to(delete_doc))
            .route("/api/comments", web::post().to(add_comment))
            .route("/api/comments/{id}", web::get().to(get_comments))
            .route("/api/users", web::get().to(get_users))
            .route("/api/users/{id}", web::delete().to(delete_user))
            .route("/api/users/{id}", web::put().to(update_user)) // NEW
            .route("/api/audit", web::get().to(get_audit))
            .route("/api/stats", web::get().to(get_stats))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
EOF

# ==========================================
# 2. FRONTEND (BUTTON FIX + USER EDIT)
# ==========================================
cat <<EOF > frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const api = axios.create({ baseURL: \`http://\${window.location.hostname}:8080/api\` });

// --- UTILS ---
const Layout = ({ children }) => {
  const nav = useNavigate();
  const loc = useLocation();
  const user = JSON.parse(localStorage.getItem('user'));
  const logout = () => { localStorage.clear(); nav('/login'); };
  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="brand">🛡️ IB System</div>
        <div className="nav-item" style={{cursor:'default'}}>👋 {user?.full_name}</div>
        <div className="nav-divider"></div>
        <div className={\`nav-item \${loc.pathname === '/' ? 'active' : ''}\`} onClick={()=>nav('/')}>📊 Главная</div>
        <div className={\`nav-item \${loc.pathname === '/profile' ? 'active' : ''}\`} onClick={()=>nav('/profile')}>👤 Профиль</div>
        <div className={\`nav-item \${loc.pathname === '/docs' ? 'active' : ''}\`} onClick={()=>nav('/docs')}>📁 Документы</div>
        <div className={\`nav-item \${loc.pathname === '/create' ? 'active' : ''}\`} onClick={()=>nav('/create')}>➕ Загрузить</div>
        {user?.role === 'admin' && (
          <>
            <div className="nav-divider"></div>
            <div className={\`nav-item \${loc.pathname === '/admin' ? 'active' : ''}\`} onClick={()=>nav('/admin')}>👥 Пользователи</div>
            <div className={\`nav-item \${loc.pathname === '/audit' ? 'active' : ''}\`} onClick={()=>nav('/audit')}>👁️ Аудит</div>
          </>
        )}
        {/* КНОПКА ВЫХОДА ПОДНЯТА ВЫШЕ */}
        <div style={{marginTop:'20px'}}><button className="btn-danger" style={{width:'100%'}} onClick={logout}>Выход</button></div>
      </div>
      <div className="main-content">{children}</div>
    </div>
  );
};

// ... (Dashboard, Profile, DocManagement, CreateDoc, Audit остались прежними)
function Dashboard() {
  const [stats, setStats] = useState({users:0, docs:0, audits:0});
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    api.get('/stats').then(r => setStats(r.data));
    api.get('/documents').then(r => setRecent(r.data.slice(-5).reverse()));
  }, []);
  return (
    <Layout>
      <h1>Главная панель</h1>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-val">{stats.docs}</div><div className="stat-label">Документов</div></div>
        <div className="stat-card"><div className="stat-val">{stats.users}</div><div className="stat-label">Пользователей</div></div>
        <div className="stat-card"><div className="stat-val">{stats.audits}</div><div className="stat-label">Событий аудита</div></div>
      </div>
      <div className="card">
        <h3>🕰️ Недавние действия</h3>
        <table><thead><tr><th>ID</th><th>Название</th><th>Автор</th></tr></thead><tbody>{recent.map(d=><tr key={d.id}><td>{d.id}</td><td>{d.title}</td><td>{d.author}</td></tr>)}</tbody></table>
      </div>
    </Layout>
  );
}

function Profile() {
  const user = JSON.parse(localStorage.getItem('user'));
  return (
    <Layout>
        <h1>Мой профиль</h1>
        <div className="card" style={{maxWidth:'500px'}}>
            <div style={{display:'flex', alignItems:'center', gap:'20px', marginBottom:'20px'}}>
                <div style={{width:'80px', height:'80px', borderRadius:'50%', background:'#cbd5e1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px'}}>👤</div>
                <div>
                    <h2 style={{margin:0}}>{user.full_name}</h2>
                    <p style={{color:'gray', margin:0}}>@{user.username}</p>
                </div>
            </div>
            <hr/>
            <p><strong>Роль:</strong> <span className="badge bg-blue">{user.role.toUpperCase()}</span></p>
            <p><strong>ID пользователя:</strong> {user.id}</p>
            <p><strong>Дата регистрации:</strong> {user.created_at}</p>
        </div>
    </Layout>
  );
}

function DocManagement() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComm, setNewComm] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => { load(); }, []);
  const load = () => api.get('/documents').then(r => setDocs(r.data));
  const open = async (d) => { setActive(d); const r = await api.get(\`/comments/\${d.id}\`); setComments(r.data); };
  const del = async (id) => { if(window.confirm('Удалить?')) { await api.delete(\`/documents/\${id}\`); setActive(null); load(); }};
  const sendC = async () => { if(!newComm) return; await api.post('/comments', {doc_id: active.id, text: newComm, username: user.username}); setNewComm(''); const r = await api.get(\`/comments/\${active.id}\`); setComments(r.data); };
  const filtered = docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));
  const downloadFile = (doc) => {
      const link = document.createElement("a");
      link.href = doc.content.startsWith("data:") ? doc.content : "data:text/plain;charset=utf-8," + encodeURIComponent(doc.content);
      link.download = doc.title;
      link.click();
  };

  return (
    <Layout>
      <h1>Управление документами</h1>
      <div style={{display:'flex', gap:'20px', height:'80vh'}}>
        <div className="card" style={{flex:1, overflowY:'auto'}}>
            <input placeholder="🔍 Поиск..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'10px'}} />
            <table style={{width:'100%'}}><thead><tr><th width="40">ID</th><th>Название</th></tr></thead><tbody>{filtered.map(d=><tr key={d.id} onClick={()=>open(d)} style={{cursor:'pointer', background:active?.id===d.id?'#eff6ff':'transparent'}}><td>{d.id}</td><td>{d.title}</td></tr>)}</tbody></table>
        </div>
        {active ? (
            <div className="card" style={{flex:2, overflowY:'auto'}}>
                <h2>{active.title} <button className="btn-sm btn-success" onClick={()=>downloadFile(active)}>Скачать</button> {(user.role==='admin'||user.username===active.author)&&<button className="btn-sm btn-danger" onClick={()=>del(active.id)} style={{marginLeft:'10px'}}>Удалить</button>}</h2>
                <div style={{background:'#f8fafc', padding:'15px', borderRadius:'8px', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'monospace', maxHeight:'200px'}}>{active.content.substring(0, 500)}...</div>
                <hr/><h3>💬 Комментарии</h3>{comments.map(c=><div key={c.id} style={{borderBottom:'1px solid #eee', padding:'5px'}}><b>{c.admin_name}</b>: {c.text}</div>)}{user.role==='admin'&&<div style={{marginTop:'10px'}}><input value={newComm} onChange={e=>setNewComm(e.target.value)} placeholder="..."/><button onClick={sendC}>Отправить</button></div>}
            </div>
        ) : <div className="card" style={{flex:2}}>Выберите документ</div>}
      </div>
    </Layout>
  );
}

function CreateDoc() {
  const [form, setForm] = useState({title:'', content:''});
  const user = JSON.parse(localStorage.getItem('user'));
  const nav = useNavigate();
  const fileRef = useRef(null);
  const sub = async (e) => { e.preventDefault(); await api.post('/documents', {...form, username: user.username}); alert("Файл загружен!"); nav('/docs'); };
  const handleFile = (e) => { const file = e.target.files[0]; if (!file) return; setForm(p => ({...p, title: file.name})); const reader = new FileReader(); reader.onload = (ev) => { setForm(p => ({...p, content: ev.target.result})); }; reader.readAsDataURL(file); };
  return ( <Layout><h1>Загрузка</h1><div className="card"><div className="drop-zone" onClick={()=>fileRef.current.click()}><h3>📂 Выберите файл</h3><input type="file" ref={fileRef} style={{display:'none'}} onChange={handleFile} /></div><hr/><form onSubmit={sub}><input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} required /><textarea rows="10" value={form.content} onChange={e=>setForm({...form, content:e.target.value})} required readOnly /><button className="btn-success">Сохранить</button></form></div></Layout> );
}

function Audit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get('/audit').then(r => setLogs(r.data)); }, []);
  return ( <Layout><h1>Журнал Аудита</h1><div className="card"><table><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Детали</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}><td>{x.created_at}</td><td>{x.username}</td><td><span className="badge bg-blue">{x.action}</span></td><td>{x.details}</td></tr>)}</tbody></table></div></Layout> );
}

// НОВЫЙ КОМПОНЕНТ АДМИНКИ С РЕДАКТИРОВАНИЕМ
function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null); // Кого редактируем
  const currentUser = JSON.parse(localStorage.getItem('user'));
  
  useEffect(() => { load(); }, []);
  const load = () => api.get('/users').then(r => setUsers(r.data));
  
  const deleteUser = async (id) => {
      if(window.confirm('Удалить пользователя безвозвратно?')) {
          await api.delete(\`/users/\${id}\`);
          load();
      }
  };

  const saveUser = async (e) => {
      e.preventDefault();
      await api.put(\`/users/\${editing.id}\`, editing);
      setEditing(null);
      load();
  };

  return (
    <Layout>
      <h1>Пользователи</h1>
      
      {editing && (
          <div className="card" style={{border:'2px solid #2563eb'}}>
              <h3>✏️ Редактирование: {editing.username}</h3>
              <form onSubmit={saveUser}>
                  <label>ФИО</label>
                  <input value={editing.full_name} onChange={e=>setEditing({...editing, full_name:e.target.value})} />
                  <label>Логин</label>
                  <input value={editing.username} onChange={e=>setEditing({...editing, username:e.target.value})} />
                  <label>Роль (admin / user)</label>
                  <select value={editing.role} onChange={e=>setEditing({...editing, role:e.target.value})} style={{width:'100%', padding:'10px', marginBottom:'10px'}}>
                      <option value="user">USER</option>
                      <option value="admin">ADMIN</option>
                  </select>
                  <div style={{display:'flex', gap:'10px'}}>
                      <button>Сохранить</button>
                      <button type="button" onClick={()=>setEditing(null)} style={{background:'#64748b'}}>Отмена</button>
                  </div>
              </form>
          </div>
      )}

      <div className="card">
        <table>
            <thead><tr><th>ID</th><th>Логин</th><th>ФИО</th><th>Роль</th><th>Действия</th></tr></thead>
            <tbody>
                {users.map(u => (
                    <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.username}</td>
                        <td>{u.full_name}</td>
                        <td><span className={\`badge \${u.role==='admin'?'bg-red':'bg-green'}\`}>{u.role}</span></td>
                        <td>
                            {u.id !== currentUser.id && (
                                <>
                                    <button className="btn-sm" onClick={()=>setEditing(u)} style={{marginRight:'5px'}}>Изм.</button>
                                    <button className="btn-sm btn-danger" onClick={()=>deleteUser(u.id)}>Уд.</button>
                                </>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </Layout>
  );
}

function Login() { const [d,s]=useState({username:'',password:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();try{const r=await api.post('/login',d);localStorage.setItem('user',JSON.stringify(r.data.user));nav('/');}catch{alert('Ошибка входа');}}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Вход</h2><form onSubmit={h}><input onChange={e=>s({...d,username:e.target.value})} placeholder="Логин"/><input type="password" onChange={e=>s({...d,password:e.target.value})} placeholder="Пароль"/><button>Войти</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/register')}>Регистрация</p></div></div>; }
function Register() { const [d,s]=useState({username:'',password:'',full_name:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();await api.post('/register',d);alert('Готово');nav('/login');}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Регистрация</h2><form onSubmit={h}><input onChange={e=>s({...d,full_name:e.target.value})} placeholder="ФИО"/><input onChange={e=>s({...d,username:e.target.value})} placeholder="Логин"/><input type="password" onChange={e=>s({...d,password:e.target.value})} placeholder="Пароль"/><button>Зарегистрироваться</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/login')}>Назад</p></div></div>; }
const Protected = ({children}) => localStorage.getItem('user') ? children : <Login />;
export default function App() { return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/" element={<Protected><Dashboard/></Protected>}/><Route path="/profile" element={<Protected><Profile/></Protected>}/><Route path="/docs" element={<Protected><DocManagement/></Protected>}/><Route path="/create" element={<Protected><CreateDoc/></Protected>}/><Route path="/admin" element={<Protected><AdminUsers/></Protected>}/><Route path="/audit" element={<Protected><Audit/></Protected>}/></Routes></BrowserRouter>; }
EOF

echo "♻️ ПЕРЕСБОРКА..."
docker-compose up -d --build
