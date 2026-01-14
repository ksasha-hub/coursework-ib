import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const api = axios.create({ baseURL: `http://${window.location.hostname}:8080/api` });

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
        <div style={{marginTop:'20px'}}><button className="btn-danger" style={{width:'100%'}} onClick={logout}>Выход</button></div>
      </div>
      <div className="main-content">{children}</div>
    </div>
  );
};

const FilterBtn = ({ active, children, onClick }) => (
    <button onClick={onClick} style={{padding: '6px 14px', fontSize: '0.85rem', border: active ? '1px solid #7f1d1d' : '1px solid #cbd5e1', background: active ? '#7f1d1d' : 'white', color: active ? 'white' : '#64748b', borderRadius: '6px', cursor: 'pointer', fontWeight: active ? '600' : 'normal', transition: 'all 0.2s', boxShadow: active ? '0 2px 4px rgba(127, 29, 29, 0.2)' : 'none'}}>{children}</button>
);

// --- НОВЫЙ КРАСИВЫЙ ПРОФИЛЬ ---
function Profile() {
  const user = JSON.parse(localStorage.getItem('user'));
  
  return (
    <Layout>
        <h1>Личный кабинет</h1>
        <div className="card" style={{maxWidth:'600px'}}>
            <div style={{display:'flex', alignItems:'center', gap:'25px', marginBottom:'25px'}}>
                <div style={{width:'100px', height:'100px', borderRadius:'50%', background:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'50px', border:'2px solid #e2e8f0'}}>
                    👤
                </div>
                <div>
                    <h2 style={{margin:0, color:'#1e293b'}}>{user.full_name}</h2>
                    <p style={{color:'#64748b', margin:'5px 0 10px 0'}}>@{user.username}</p>
                    <span className={`badge ${user.role==='admin'?'bg-red':'bg-green'}`} style={{fontSize:'0.9rem', padding:'5px 10px'}}>
                        {user.role === 'admin' ? 'АДМИНИСТРАТОР' : 'ПОЛЬЗОВАТЕЛЬ'}
                    </span>
                </div>
            </div>
            
            <hr style={{borderTop:'1px solid #e2e8f0', margin:'20px 0'}}/>
            
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                <div>
                    <p style={{color:'#64748b', fontSize:'0.85rem', margin:'0 0 5px 0'}}>ID пользователя</p>
                    <p style={{fontWeight:'600', margin:0}}>#{user.id}</p>
                </div>
                <div>
                    <p style={{color:'#64748b', fontSize:'0.85rem', margin:'0 0 5px 0'}}>Дата регистрации</p>
                    <p style={{fontWeight:'600', margin:0}}>{user.created_at || 'Не указана'}</p>
                </div>
                <div>
                    <p style={{color:'#64748b', fontSize:'0.85rem', margin:'0 0 5px 0'}}>Статус аккаунта</p>
                    <p style={{color:'#10b981', fontWeight:'bold', margin:0}}>● Активен</p>
                </div>
                <div>
                    <p style={{color:'#64748b', fontSize:'0.85rem', margin:'0 0 5px 0'}}>Уровень доступа</p>
                    <p style={{fontWeight:'600', margin:0}}>{user.role === 'admin' ? 'Полный (Level 5)' : 'Базовый (Level 1)'}</p>
                </div>
            </div>

            <div style={{marginTop:'30px', background:'#f8fafc', padding:'15px', borderRadius:'8px'}}>
                <h4 style={{margin:'0 0 10px 0', color:'#475569'}}>Ваши права доступа:</h4>
                <ul style={{margin:0, paddingLeft:'20px', color:'#334155', fontSize:'0.9rem', lineHeight:'1.6'}}>
                    <li>Просмотр и поиск нормативных документов</li>
                    <li>Загрузка новых файлов (с шифрованием)</li>
                    <li>Скачивание расшифрованных копий</li>
                    {user.role === 'admin' && (
                        <>
                            <li><strong>Управление пользователями (Create/Edit/Delete)</strong></li>
                            <li><strong>Просмотр журнала аудита безопасности</strong></li>
                            <li><strong>Добавление резолюций к документам</strong></li>
                        </>
                    )}
                </ul>
            </div>
        </div>
    </Layout>
  );
}

// ... ОСТАЛЬНЫЕ КОМПОНЕНТЫ ОСТАВЛЯЕМ КАК БЫЛИ ...
function Dashboard() { const [s, setS] = useState({users:0, docs:0, audits:0}); useEffect(() => { api.get('/stats').then(r => setS(r.data)); }, []); return <Layout><h1>Главная панель</h1><div className="stats-grid"><div className="stat-card"><div className="stat-val">{s.docs}</div><div className="stat-label">Документов</div></div><div className="stat-card"><div className="stat-val">{s.users}</div><div className="stat-label">Пользователей</div></div><div className="stat-card"><div className="stat-val">{s.audits}</div><div className="stat-label">Записей аудита</div></div></div><div className="card"><h3>Добро пожаловать в Систему</h3></div></Layout>; }
function DocManagement() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('All');
  const [catFilter, setCatFilter] = useState('All');
  const [sortBy, setSortBy] = useState('title'); 
  const [sortDir, setSortDir] = useState('asc'); 
  const [active, setActive] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComm, setNewComm] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));
  useEffect(() => { load(); }, []);
  const load = () => api.get('/documents').then(r => setDocs(r.data));
  const open = async (d) => { setActive(d); const r = await api.get(`/comments/${d.id}`); setComments(r.data); };
  const del = async (id) => { if(window.confirm('Удалить?')) { await api.delete(`/documents/${id}`); setActive(null); load(); }};
  const sendC = async () => { if(!newComm) return; await api.post('/comments', {doc_id: active.id, text: newComm, username: user.username}); setNewComm(''); const r = await api.get(`/comments/${active.id}`); setComments(r.data); };
  const years = []; for (let i = 2026; i >= 2000; i--) { years.push(i.toString()); }
  const filtered = docs.filter(d => { const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase()); const matchesCat = catFilter === 'All' || d.category === catFilter; const matchesYear = yearFilter === 'All' || (d.created_at && d.created_at.startsWith(yearFilter)); return matchesSearch && matchesCat && matchesYear; }).sort((a, b) => { let valA = sortBy === 'title' ? a.title.toLowerCase() : a.created_at; let valB = sortBy === 'title' ? b.title.toLowerCase() : b.created_at; if (valA < valB) return sortDir === 'asc' ? -1 : 1; if (valA > valB) return sortDir === 'asc' ? 1 : -1; return 0; });
  const downloadFile = (doc) => { const link = document.createElement("a"); link.href = doc.content.startsWith("data:") ? doc.content : "data:text/plain;charset=utf-8," + encodeURIComponent(doc.content); link.download = doc.title; link.click(); };
  return ( <Layout><h1>Управление документами</h1><div style={{display:'flex', gap:'20px', height:'85vh', flexDirection:'column'}}><div className="card" style={{padding:'20px', display:'flex', flexDirection:'column', gap:'15px'}}><div style={{display:'flex', alignItems:'center', gap:'10px', overflowX:'auto', paddingBottom:'5px', scrollbarWidth:'thin'}}><span style={{fontWeight:'bold', fontSize:'0.9rem', minWidth:'50px'}}>Годы:</span><FilterBtn active={yearFilter==='All'} onClick={()=>setYearFilter('All')}>Все</FilterBtn>{years.map(y => <FilterBtn key={y} active={yearFilter===y} onClick={()=>setYearFilter(y)}>{y}</FilterBtn>)}</div><div style={{display:'flex', alignItems:'center', gap:'20px', flexWrap:'wrap'}}><div style={{position:'relative'}}><span style={{position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)'}}>🔍</span><input placeholder="Поиск по заголовку..." value={search} onChange={e=>setSearch(e.target.value)} style={{margin:0, padding:'8px 10px 8px 35px', width:'250px'}} /></div><select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{margin:0, padding:'6px', width:'150px'}}><option value="All">Все категории</option><option value="Приказ">📜 Приказы</option><option value="Регламент">📘 Регламенты</option><option value="Инструкция">📗 Инструкции</option><option value="Отчет">📊 Отчеты</option><option value="Другое">📁 Другое</option></select><div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{fontWeight:'bold', fontSize:'0.9rem'}}>Сортировка:</span><FilterBtn active={sortBy==='title'} onClick={()=>setSortBy('title')}>Заголовок</FilterBtn><FilterBtn active={sortBy==='date'} onClick={()=>setSortBy('date')}>Дата</FilterBtn></div><div style={{display:'flex', alignItems:'center', gap:'5px'}}><span style={{fontWeight:'bold', fontSize:'0.9rem'}}>Направление:</span><FilterBtn active={sortDir==='asc'} onClick={()=>setSortDir('asc')}>По возрастанию</FilterBtn><FilterBtn active={sortDir==='desc'} onClick={()=>setSortDir('desc')}>По убыванию</FilterBtn></div><button onClick={()=>{setSearch(''); setYearFilter('All'); setCatFilter('All'); setSortBy('title'); setSortDir('asc');}} style={{background:'transparent', border:'1px solid #94a3b8', color:'#475569', padding:'6px 12px', fontSize:'0.85rem', borderRadius:'6px'}}>↻ Сброс</button></div></div><div style={{display:'flex', gap:'20px', flex:1, overflow:'hidden'}}><div className="card" style={{flex:1, overflowY:'auto', padding:'0'}}><table style={{width:'100%'}}><thead><tr><th width="50">ID</th><th>Название документа</th><th width="100">Дата</th></tr></thead><tbody>{filtered.map(d => (<tr key={d.id} onClick={()=>open(d)} style={{cursor:'pointer', background:active?.id===d.id?'#eff6ff':'transparent', borderLeft:active?.id===d.id?'4px solid #2563eb':'4px solid transparent'}}><td>{d.id}</td><td><div style={{fontWeight:active?.id===d.id?'600':'400'}}>{d.title}</div><span style={{fontSize:'0.75rem', color:'#64748b', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>{d.category}</span></td><td style={{fontSize:'0.8rem', color:'#64748b'}}>{d.created_at ? d.created_at.split(' ')[0] : '-'}</td></tr>))}{filtered.length === 0 && <tr><td colSpan="3" style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>Документы не найдены</td></tr>}</tbody></table></div><div className="card" style={{flex:2, overflowY:'auto', background: active ? 'white' : '#f8fafc', display: active ? 'block' : 'flex', alignItems:'center', justifyContent:'center'}}>{active ? (<><div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}><div><h2 style={{margin:'0 0 10px 0', color:'#1e293b'}}>{active.title}</h2><div style={{display:'flex', gap:'10px', fontSize:'0.85rem', color:'#64748b'}}><span>📅 {active.created_at}</span><span>👤 {active.author}</span><span className="badge bg-blue">{active.category}</span></div></div><div><button className="btn-sm btn-success" onClick={()=>downloadFile(active)}>⬇ Скачать</button>{(user.role==='admin'||user.username===active.author)&&<button className="btn-sm btn-danger" onClick={()=>del(active.id)} style={{marginLeft:'10px'}}>Удалить</button>}</div></div><hr style={{margin:'20px 0', borderTop:'1px solid #e2e8f0'}}/><h4 style={{color:'#475569', margin:'0 0 10px 0'}}>Содержание документа:</h4><div style={{background:'#f8fafc', padding:'20px', borderRadius:'8px', border:'1px solid #e2e8f0', fontFamily:'monospace', whiteSpace:'pre-wrap', maxHeight:'400px', overflowY:'auto', fontSize:'0.9rem', color:'#334155'}}>{active.content.substring(0, 2000)}{active.content.length > 2000 && <div style={{textAlign:'center', marginTop:'10px', color:'gray'}}>(Показана часть документа. Скачайте для просмотра полной версии)</div>}</div><hr style={{margin:'20px 0', borderTop:'1px solid #e2e8f0'}}/><h3>💬 Комментарии ({comments.length})</h3><div style={{background:'#f8fafc', padding:'15px', borderRadius:'8px'}}>{comments.length === 0 && <p style={{margin:0, color:'#94a3b8'}}>Нет комментариев</p>}{comments.map(c => (<div key={c.id} style={{background:'white', border:'1px solid #e2e8f0', padding:'10px', borderRadius:'6px', marginBottom:'10px'}}><div style={{display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:'5px'}}><strong style={{color:'#2563eb'}}>{c.admin_name}</strong><span style={{color:'#94a3b8'}}>{c.created_at}</span></div><div style={{color:'#334155'}}>{c.text}</div></div>))}</div>{user.role==='admin' && (<div style={{display:'flex', gap:'10px', marginTop:'15px'}}><input value={newComm} onChange={e=>setNewComm(e.target.value)} placeholder="Написать резолюцию..." style={{margin:0}} /><button onClick={sendC}>Отправить</button></div>)}</>) : (<div style={{textAlign:'center', color:'#94a3b8'}}><div style={{fontSize:'4rem', marginBottom:'10px'}}>📄</div><p>Выберите документ из списка слева<br/>для просмотра и скачивания</p></div>)}</div></div></div></Layout>); }
function CreateDoc() { const [f, sF] = useState({title:'', category:'Другое', content:'', date: ''}); const user = JSON.parse(localStorage.getItem('user')); const nav = useNavigate(); const ref = useRef(null); const sub = async (e) => { e.preventDefault(); await api.post('/documents', {...f, username: user.username, created_at: f.date ? f.date : null}); alert("Документ загружен!"); nav('/docs'); }; const hFile = (e) => { const file = e.target.files[0]; if (!file) return; sF(p => ({...p, title: file.name})); const r = new FileReader(); r.onload = (ev) => { sF(p => ({...p, content: ev.target.result})); }; r.readAsDataURL(file); }; return <Layout><h1>Загрузка документа</h1><div className="card" style={{maxWidth:'600px'}}><div className="drop-zone" onClick={()=>ref.current.click()}><h3>📂 Выбрать файл</h3><input type="file" ref={ref} style={{display:'none'}} onChange={hFile} /></div><hr/><form onSubmit={sub}><label>Название</label><input value={f.title} onChange={e=>sF({...f, title:e.target.value})} required /><label>Категория</label><select value={f.category} onChange={e=>sF({...f, category:e.target.value})} style={{width:'100%',padding:'10px',marginBottom:'15px'}}><option>Приказ</option><option>Регламент</option><option>Инструкция</option><option>Отчет</option><option>Другое</option></select><label>Дата создания (необязательно)</label><input type="date" value={f.date} onChange={e=>sF({...f, date:e.target.value})} /><label>Содержание (Base64)</label><textarea rows="5" value={f.content} readOnly required style={{color:'gray'}} /><button className="btn-success">Сохранить</button></form></div></Layout>; }
function Audit() { const [logs, setLogs] = useState([]); useEffect(() => { api.get('/audit').then(r => setLogs(r.data)); }, []); return <Layout><h1>Журнал Аудита</h1><div className="card"><table><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Детали</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}><td>{x.created_at}</td><td>{x.username}</td><td><span className="badge bg-blue">{x.action}</span></td><td>{x.details}</td></tr>)}</tbody></table></div></Layout>; }
function AdminUsers() { const [u,s]=useState([]); const [e,sE]=useState(null); const me=JSON.parse(localStorage.getItem('user')); const isAdmin=me?.role==='admin'; useEffect(()=>{l()},[]); const l=()=>api.get('/users').then(r=>s(r.data)); const del=async(id)=>{if(confirm('Удалить?')){await api.delete(`/users/${id}`);l();}}; const sav=async(e)=>{e.preventDefault();await api.put(`/users/${e.id}`,e);sE(null);l();}; return <Layout><h1>Список пользователей</h1>{e&&<div className="card" style={{border:'2px solid #2563eb', marginBottom:'20px'}}><h3>Редактирование</h3><form onSubmit={sav}><label>ФИО</label><input value={e.full_name} onChange={x=>sE({...e,full_name:x.target.value})}/><label>Логин</label><input value={e.username} onChange={x=>sE({...e,username:x.target.value})}/><label>Роль</label><select value={e.role} onChange={x=>sE({...e,role:x.target.value})}><option value="user">USER</option><option value="admin">ADMIN</option></select><button>Сохранить</button> <button type="button" onClick={()=>sE(null)} style={{background:'#64748b'}}>Отмена</button></form></div>}<div className="card"><table><thead><tr><th width="50">ID</th><th>ФИО Сотрудника</th>{isAdmin&&<th>Логин (System)</th>}<th>Роль</th><th>Дата регистрации</th>{isAdmin&&<th>Действия</th>}</tr></thead><tbody>{u.map(x=><tr key={x.id}><td>{x.id}</td><td style={{fontWeight:'500'}}>{x.full_name}</td>{isAdmin&&<td style={{fontFamily:'monospace', color:'#64748b'}}>{x.username}</td>}<td><span className={`badge ${x.role==='admin'?'bg-red':'bg-green'}`}>{x.role.toUpperCase()}</span></td><td>{x.created_at?x.created_at.split(' ')[0]:'-'}</td>{isAdmin&&(<td>{x.id!==me.id&&(<><button className="btn-sm" onClick={()=>sE(x)} style={{marginRight:'5px'}}>✏️</button><button className="btn-sm btn-danger" onClick={()=>del(x.id)}>🗑️</button></>)}</td>)}</tr>)}</tbody></table></div></Layout>; }
function Login() { const [d,s]=useState({username:'',password:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();try{const r=await api.post('/login',d);localStorage.setItem('user',JSON.stringify(r.data.user));nav('/');}catch{alert('Ошибка входа');}}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Вход</h2><form onSubmit={h}><input onChange={e=>s({...d,username:e.target.value})} placeholder="Логин"/><input type="password" onChange={e=>s({...d,password:e.target.value})} placeholder="Пароль"/><button>Войти</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/register')}>Регистрация</p></div></div>; }
function Register() { const [d,s]=useState({username:'',password:'',full_name:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();await api.post('/register',d);alert('Готово');nav('/login');}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Регистрация</h2><form onSubmit={h}><input onChange={e=>s({...d,full_name:e.target.value})} placeholder="ФИО"/><input onChange={e=>s({...d,username:e.target.value})} placeholder="Логин"/><input type="password" onChange={e=>s({...d,password:e.target.value})} placeholder="Пароль"/><button>Зарегистрироваться</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/login')}>Назад</p></div></div>; }
const Protected = ({children}) => localStorage.getItem('user') ? children : <Login />;
export default function App() { return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/" element={<Protected><Dashboard/></Protected>}/><Route path="/profile" element={<Protected><Profile/></Protected>}/><Route path="/docs" element={<Protected><DocManagement/></Protected>}/><Route path="/create" element={<Protected><CreateDoc/></Protected>}/><Route path="/admin" element={<Protected><AdminUsers/></Protected>}/><Route path="/audit" element={<Protected><Audit/></Protected>}/></Routes></BrowserRouter>; }
