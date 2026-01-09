#!/bin/bash

echo "🛠️ ЗАПУСК ПОЛНОГО ИСПРАВЛЕНИЯ (RUSSIAN FIX + SEARCH + HEX CRYPTO)..."

# Останавливаем и чистим старое (нужно пересоздать таблицы и сбросить кэш)
docker-compose down -v

# ============================
# 1. C++ (HEX ENCODING FIX)
# ============================
# Переписываем C++ на работу с HEX. Это спасет русский язык.

mkdir -p crypto-lib/src
cat <<EOF > crypto-lib/src/crypto.h
#ifndef CRYPTO_H
#define CRYPTO_H
extern "C" {
    char* encrypt_data_ffi(const char* input);
    char* decrypt_data_ffi(const char* input);
    void free_string_ffi(char* ptr);
}
#endif
EOF

cat <<EOF > crypto-lib/src/crypto.cpp
#include "crypto.h"
#include <cstring>
#include <cstdlib>
#include <string>
#include <sstream>
#include <iomanip>
#include <vector>

// Ключ шифрования
const char KEY = 0x5A;

// Преобразование байт -> HEX строка (чтобы Rust не ломал кодировку)
std::string to_hex(const std::vector<unsigned char>& data) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (unsigned char c : data) {
        ss << std::setw(2) << (int)c;
    }
    return ss.str();
}

// Преобразование HEX строка -> байты
std::vector<unsigned char> from_hex(const std::string& hex) {
    std::vector<unsigned char> data;
    for (size_t i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        unsigned char byte = (unsigned char)strtol(byteString.c_str(), nullptr, 16);
        data.push_back(byte);
    }
    return data;
}

extern "C" {
    char* encrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string s_input(input);
        std::vector<unsigned char> encrypted;
        
        // XOR Шифрование + сдвиг
        for (char c : s_input) {
            unsigned char uc = (unsigned char)c;
            unsigned char res = (uc ^ KEY) + 1; 
            encrypted.push_back(res);
        }

        // Возвращаем как HEX строку (безопасно для UTF-8)
        std::string hex_res = to_hex(encrypted);
        char* out = (char*)malloc(hex_res.length() + 1);
        strcpy(out, hex_res.c_str());
        return out;
    }

    char* decrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string s_hex(input);
        
        // Сначала декодируем HEX обратно в байты
        std::vector<unsigned char> encrypted_bytes = from_hex(s_hex);
        std::string decrypted;

        // Расшифровка
        for (unsigned char c : encrypted_bytes) {
            char res = (char)((c - 1) ^ KEY);
            decrypted += res;
        }

        char* out = (char*)malloc(decrypted.length() + 1);
        strcpy(out, decrypted.c_str());
        return out;
    }

    void free_string_ffi(char* ptr) {
        if (ptr) free(ptr);
    }
}
EOF

# ============================
# 2. BACKEND (С фиксом Аудита)
# ============================

# Обновляем build.rs (на всякий случай)
cat <<EOF > backend/build.rs
fn main() {
    println!("cargo:rerun-if-changed=../crypto-lib/src/crypto.cpp");
    cc::Build::new()
        .cpp(true)
        .file("../crypto-lib/src/crypto.cpp")
        .compile("cryptolib");
}
EOF

# Обновляем Main.rs
# Добавляем маршрут для поиска и чиним логирование
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
use chrono::Local;

#[derive(Deserialize)]
struct RegReq { username: String, password: String, full_name: String }
#[derive(Deserialize)]
struct LoginReq { username: String, password: String }
#[derive(Deserialize)]
struct DocReq { title: String, content: String, username: String }
#[derive(Deserialize)]
struct CommentReq { doc_id: i32, text: String, username: String }

// --- АУДИТ ФУНКЦИЯ ---
async fn log_audit(db: &DatabaseConnection, username: String, action: &str, details: &str) {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let safe_details = if details.len() > 200 { &details[..200] } else { details }; // Обрезаем слишком длинные детали
    
    let log = audit::ActiveModel {
        username: Set(username),
        action: Set(action.to_string()),
        details: Set(safe_details.to_string()),
        created_at: Set(now),
        ..Default::default()
    };
    // Игнорируем ошибки аудита, чтобы не крашить основной запрос
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
            log_audit(db.get_ref(), req.username.clone(), "REGISTER", "New user").await;
            HttpResponse::Ok().json("Registered")
        },
        Err(_) => HttpResponse::BadRequest().body("User exists")
    }
}

async fn login(db: web::Data<DatabaseConnection>, req: web::Json<LoginReq>) -> impl Responder {
    let u = user::Entity::find().filter(user::Column::Username.eq(&req.username)).one(db.get_ref()).await.unwrap();
    if let Some(user) = u {
        if user.password == req.password {
            log_audit(db.get_ref(), user.username.clone(), "LOGIN", "Success").await;
            return HttpResponse::Ok().json(serde_json::json!({"token": "jwt", "user": user}));
        }
    }
    HttpResponse::Unauthorized().body("Invalid")
}

async fn create_doc(db: web::Data<DatabaseConnection>, req: web::Json<DocReq>) -> impl Responder {
    // Шифруем
    let encrypted = crypto_ffi::encrypt(&req.content);
    
    let doc = document::ActiveModel {
        title: Set(req.title.clone()),
        content_encrypted: Set(encrypted), // Тут теперь будет HEX строка
        owner_name: Set(req.username.clone()),
        ..Default::default()
    };
    
    let res = document::Entity::insert(doc).exec(db.get_ref()).await.unwrap();
    log_audit(db.get_ref(), req.username.clone(), "CREATE_DOC", &format!("Title: {}", req.title)).await;
    HttpResponse::Ok().json("Created")
}

async fn get_docs(db: web::Data<DatabaseConnection>) -> impl Responder {
    let docs = document::Entity::find().all(db.get_ref()).await.unwrap();
    let mut result = Vec::new();
    for d in docs {
        // Расшифровываем HEX -> Текст
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

// ... Остальные хендлеры (комментарии, юзеры) остаются как были ...
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
    let logs = audit::Entity::find().order_by_desc(audit::Column::Id).limit(50).all(db.get_ref()).await.unwrap();
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
    let db = Database::connect(&db_url).await.unwrap();
    let builder = db.get_database_backend();
    let schema = Schema::new(builder);
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::user::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::document::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::audit::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::comment::Entity))).await;

    HttpServer::new(move || {
        App::new()
            .wrap(Cors::permissive())
            .app_data(web::Data::new(db.clone()))
            .route("/api/register", web::post().to(register))
            .route("/api/login", web::post().to(login))
            .route("/api/documents", web::post().to(create_doc))
            .route("/api/documents", web::get().to(get_docs))
            .route("/api/documents/{id}", web::delete().to(delete_doc))
            .route("/api/comments", web::post().to(add_comment))
            .route("/api/comments/{id}", web::get().to(get_comments))
            .route("/api/users", web::get().to(get_users))
            .route("/api/audit", web::get().to(get_audit))
            .route("/api/stats", web::get().to(get_stats))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
EOF

# ============================
# 3. FRONTEND (SEARCH + FILE FIX)
# ============================

cat <<EOF > frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const api = axios.create({ baseURL: \`http://\${window.location.hostname}:8080/api\` });

// --- LAYOUT ---
const Layout = ({ children }) => {
  const nav = useNavigate();
  const loc = useLocation();
  const user = JSON.parse(localStorage.getItem('user'));
  const logout = () => { localStorage.clear(); nav('/login'); };
  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="brand">🛡️ SecureDocs</div>
        <div className="nav-item" style={{cursor:'default',paddingLeft:0}}>👋 {user?.full_name}</div>
        <div className="nav-divider"></div>
        <div className={\`nav-item \${loc.pathname === '/' ? 'active' : ''}\`} onClick={()=>nav('/')}>📊 Главная</div>
        <div className={\`nav-item \${loc.pathname === '/docs' ? 'active' : ''}\`} onClick={()=>nav('/docs')}>📁 Документы</div>
        <div className={\`nav-item \${loc.pathname === '/create' ? 'active' : ''}\`} onClick={()=>nav('/create')}>➕ Создать</div>
        {user?.role === 'admin' && (<>
            <div className="nav-divider"></div>
            <div className={\`nav-item \${loc.pathname === '/admin' ? 'active' : ''}\`} onClick={()=>nav('/admin')}>👥 Пользователи</div>
            <div className={\`nav-item \${loc.pathname === '/audit' ? 'active' : ''}\`} onClick={()=>nav('/audit')}>👁️ Аудит</div>
        </>)}
        <div style={{marginTop:'auto'}}><button className="btn-danger" style={{width:'100%'}} onClick={logout}>Выход</button></div>
      </div>
      <div className="main-content">{children}</div>
    </div>
  );
};

// --- PAGES ---

function DocManagement() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [activeDoc, setActiveDoc] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => { load(); }, []);
  const load = () => api.get('/documents').then(res => setDocs(res.data));

  // Фильтрация поиска (на клиенте)
  const filteredDocs = docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));

  const openDoc = async (doc) => {
    setActiveDoc(doc);
    const res = await api.get(\`/comments/\${doc.id}\`);
    setComments(res.data);
  };
  
  const handleDelete = async (id) => {
    if(window.confirm("Удалить?")) { await api.delete(\`/documents/\${id}\`); setActiveDoc(null); load(); }
  };

  const sendComment = async () => {
    if(!newComment) return;
    await api.post('/comments', { doc_id: activeDoc.id, text: newComment, username: user.username });
    setNewComment('');
    const res = await api.get(\`/comments/\${activeDoc.id}\`);
    setComments(res.data);
  };

  const generatePDF = (doc) => {
      const pdf = new jsPDF();
      pdf.setFontSize(20); pdf.text("ОТЧЕТ", 20, 20);
      pdf.setFontSize(12); pdf.text(\`Название: \${doc.title}\`, 20, 30);
      pdf.text(\`Автор: \${doc.author}\`, 20, 36);
      pdf.line(20, 40, 190, 40);
      const splitText = pdf.splitTextToSize(doc.content, 170);
      pdf.text(splitText, 20, 50);
      pdf.save(\`doc_\${doc.id}.pdf\`);
  };

  return (
    <Layout>
      <h1>Управление документами</h1>
      <div style={{display:'flex', gap:'20px', height:'80vh'}}>
        <div className="card" style={{flex:1, overflowY:'auto'}}>
            <input placeholder="🔍 Поиск по названию..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'10px'}} />
            <table>
            <thead><tr><th>ID</th><th>Название</th></tr></thead>
            <tbody>
                {filteredDocs.map(d => (
                <tr key={d.id} style={{background: activeDoc?.id === d.id ? '#eff6ff' : 'white'}}>
                    <td>#{d.id}</td>
                    <td onClick={()=>openDoc(d)} style={{cursor:'pointer', color:'#2563eb', fontWeight:'bold'}}>{d.title}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>

        {activeDoc ? (
            <div className="card" style={{flex:2, overflowY:'auto'}}>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                    <h2>{activeDoc.title}</h2>
                    <div>
                         <button className="btn-sm btn-success" onClick={()=>generatePDF(activeDoc)}>Скачать PDF</button>
                         {(user.role==='admin' || user.username===activeDoc.author) && 
                            <button className="btn-sm btn-danger" style={{marginLeft:'5px'}} onClick={()=>handleDelete(activeDoc.id)}>Удалить</button>}
                    </div>
                </div>
                <hr/>
                <h4>Содержание (Расшифровано):</h4>
                <div style={{background:'#f8fafc', padding:'15px', borderRadius:'8px', whiteSpace:'pre-wrap'}}>
                    {activeDoc.content}
                </div>
                
                <hr style={{marginTop:'30px'}}/>
                <h3>💬 Комментарии ({comments.length})</h3>
                {comments.map(c => (
                    <div key={c.id} style={{borderBottom:'1px solid #eee', padding:'5px 0'}}>
                        <b>{c.admin_name}</b>: {c.text} <span style={{fontSize:'0.7rem', color:'gray'}}>{c.created_at}</span>
                    </div>
                ))}
                {user.role === 'admin' && (
                    <div style={{display:'flex', gap:'5px', marginTop:'10px'}}>
                        <input value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Ваш комментарий..." style={{marginBottom:0}} />
                        <button onClick={sendComment}>Send</button>
                    </div>
                )}
            </div>
        ) : (
            <div className="card" style={{flex:2, display:'flex', alignItems:'center', justifyContent:'center', color:'gray'}}>
                Выберите документ слева
            </div>
        )}
      </div>
    </Layout>
  );
}

function CreateDoc() {
  const [form, setForm] = useState({ title: '', content: '' });
  const user = JSON.parse(localStorage.getItem('user'));
  const nav = useNavigate();
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/documents', { ...form, username: user.username });
    alert("Документ успешно зашифрован и сохранен!");
    nav('/docs');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    // Исправленная логика чтения файлов с русским текстом
    const reader = new FileReader();
    reader.onload = (ev) => {
        setForm(prev => ({ ...prev, content: ev.target.result, title: file.name }));
    };
    // Используем readAsText (по умолчанию UTF-8)
    reader.readAsText(file);
  };

  return (
    <Layout>
      <h1>Создать документ</h1>
      <div className="card">
        <div className="drop-zone" onClick={()=>fileInputRef.current.click()}>
            <h3>📂 Загрузить файл (.txt, .md, .json, .log)</h3>
            <p>Поддержка русского языка включена</p>
            <input type="file" ref={fileInputRef} style={{display:'none'}} onChange={handleFileUpload} />
        </div>
        <hr/>
        <form onSubmit={handleSubmit}>
            <label>Название</label>
            <input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} required />
            <label>Содержание</label>
            <textarea rows="10" value={form.content} onChange={e=>setForm({...form, content: e.target.value})} required />
            <button className="btn-success">Зашифровать и Сохранить</button>
        </form>
      </div>
    </Layout>
  );
}

// ... Остальные компоненты (Dashboard, Audit, AdminUsers, Login, Register) ...
function Dashboard() { const [s, setS] = useState({docs:0, users:0, audits:0}); useEffect(()=>{api.get('/stats').then(r=>setS(r.data))},[]); return <Layout><h1>Главная</h1><div className="stats-grid"><div className="stat-card"><div className="stat-val">{s.docs}</div><div className="stat-label">Документов</div></div><div className="stat-card"><div className="stat-val">{s.users}</div><div className="stat-label">Юзеров</div></div><div className="stat-card"><div className="stat-val">{s.audits}</div><div className="stat-label">Аудит</div></div></div></Layout>; }
function Audit() { const [l, sL] = useState([]); useEffect(()=>{api.get('/audit').then(r=>sL(r.data))},[]); return <Layout><h1>Аудит</h1><div className="card"><table><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Детали</th></tr></thead><tbody>{l.map(x=>(<tr key={x.id}><td>{x.created_at}</td><td>{x.username}</td><td><span className="badge bg-blue">{x.action}</span></td><td>{x.details}</td></tr>))}</tbody></table></div></Layout>; }
function AdminUsers() { const [u, sU] = useState([]); useEffect(()=>{api.get('/users').then(r=>sU(r.data))},[]); return <Layout><h1>Пользователи</h1><div className="card"><table><thead><tr><th>ID</th><th>Login</th><th>Role</th><th>Created</th></tr></thead><tbody>{u.map(x=>(<tr key={x.id}><td>{x.id}</td><td>{x.username}</td><td><span className={\`badge \${x.role==='admin'?'bg-red':'bg-green'}\`}>{x.role}</span></td><td>{x.created_at}</td></tr>))}</tbody></table></div></Layout>; }
function Login() { const [d,sD]=useState({username:'',password:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();try{const r=await api.post('/login',d);localStorage.setItem('user',JSON.stringify(r.data.user));nav('/');}catch{alert('Ошибка');}}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Вход</h2><form onSubmit={h}><input onChange={e=>sD({...d,username:e.target.value})} placeholder="Login"/><input type="password" onChange={e=>sD({...d,password:e.target.value})} placeholder="Pass"/><button>Go</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/register')}>Регистрация</p></div></div>; }
function Register() { const [d,sD]=useState({username:'',password:'',full_name:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();await api.post('/register',d);alert('OK');nav('/login');}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Регистрация</h2><form onSubmit={h}><input onChange={e=>sD({...d,full_name:e.target.value})} placeholder="Name"/><input onChange={e=>sD({...d,username:e.target.value})} placeholder="Login"/><input type="password" onChange={e=>sD({...d,password:e.target.value})} placeholder="Pass"/><button>Create</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/login')}>Назад</p></div></div>; }
const Protected = ({children}) => localStorage.getItem('user') ? children : <Login />;
export default function App() { return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/" element={<Protected><Dashboard/></Protected>}/><Route path="/docs" element={<Protected><DocManagement/></Protected>}/><Route path="/create" element={<Protected><CreateDoc/></Protected>}/><Route path="/admin" element={<Protected><AdminUsers/></Protected>}/><Route path="/audit" element={<Protected><Audit/></Protected>}/></Routes></BrowserRouter>; }
EOF

echo "🚀 Перезапуск..."
docker-compose up -d --build
