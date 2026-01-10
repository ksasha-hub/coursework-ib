import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const api = axios.create({ baseURL: `http://${window.location.hostname}:8080/api` });

// utils
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
        <div className={`nav-item ${loc.pathname === '/' ? 'active' : ''}`} onClick={()=>nav('/')}>📊 Главная</div>
        <div className={`nav-item ${loc.pathname === '/profile' ? 'active' : ''}`} onClick={()=>nav('/profile')}>👤 Профиль</div>
        <div className={`nav-item ${loc.pathname === '/docs' ? 'active' : ''}`} onClick={()=>nav('/docs')}>📁 Документы</div>
        <div className={`nav-item ${loc.pathname === '/create' ? 'active' : ''}`} onClick={()=>nav('/create')}>➕ Загрузить</div>
        {user?.role === 'admin' && (
          <>
            <div className="nav-divider"></div>
            <div className={`nav-item ${loc.pathname === '/admin' ? 'active' : ''}`} onClick={()=>nav('/admin')}>👥 Пользователи</div>
            <div className={`nav-item ${loc.pathname === '/audit' ? 'active' : ''}`} onClick={()=>nav('/audit')}>👁️ Аудит</div>
          </>
        )}
        {}
        <div style={{marginTop:'20px'}}><button className="btn-danger" style={{width:'100%'}} onClick={logout}>Выход</button></div>
      </div>
      <div className="main-content">{children}</div>
    </div>
  );
};

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
  const open = async (d) => { setActive(d); const r = await api.get(`/comments/${d.id}`); setComments(r.data); };
  const del = async (id) => { if(window.confirm('Удалить?')) { await api.delete(`/documents/${id}`); setActive(null); load(); }};
  const sendC = async () => { if(!newComm) return; await api.post('/comments', {doc_id: active.id, text: newComm, username: user.username}); setNewComm(''); const r = await api.get(`/comments/${active.id}`); setComments(r.data); };
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

// админка для изменения
function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null); // кого редактируем
  const currentUser = JSON.parse(localStorage.getItem('user'));
  
  useEffect(() => { load(); }, []);
  const load = () => api.get('/users').then(r => setUsers(r.data));
  
  const deleteUser = async (id) => {
      if(window.confirm('Удалить пользователя безвозвратно?')) {
          await api.delete(`/users/${id}`);
          load();
      }
  };

  const saveUser = async (e) => {
      e.preventDefault();
      await api.put(`/users/${editing.id}`, editing);
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
                        <td><span className={`badge ${u.role==='admin'?'bg-red':'bg-green'}`}>{u.role}</span></td>
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
