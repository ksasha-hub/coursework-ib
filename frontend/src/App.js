import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// !!! API LINK !!!
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
        <div className={`nav-item ${loc.pathname === '/docs' ? 'active' : ''}`} onClick={()=>nav('/docs')}>📁 Документы</div>
        <div className={`nav-item ${loc.pathname === '/create' ? 'active' : ''}`} onClick={()=>nav('/create')}>➕ Загрузить</div>
        {user?.role === 'admin' && (
          <>
            <div className="nav-divider"></div>
            <div className={`nav-item ${loc.pathname === '/admin' ? 'active' : ''}`} onClick={()=>nav('/admin')}>👥 Пользователи</div>
            <div className={`nav-item ${loc.pathname === '/audit' ? 'active' : ''}`} onClick={()=>nav('/audit')}>👁️ Аудит</div>
          </>
        )}
        <div style={{marginTop:'auto'}}><button className="btn-danger" style={{width:'100%'}} onClick={logout}>Выход</button></div>
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
        <div className="stat-card"><div className="stat-val">{stats.users}</div><div className="stat-label">Юзеров</div></div>
        <div className="stat-card"><div className="stat-val">{stats.audits}</div><div className="stat-label">Событий аудита</div></div>
      </div>
      <div className="card">
        <h3>🕰️ Недавние действия</h3>
        <table>
            <thead><tr><th>ID</th><th>Название</th><th>Автор</th></tr></thead>
            <tbody>
                {recent.map(d=><tr key={d.id}><td>{d.id}</td><td>{d.title}</td><td>{d.author}</td></tr>)}
                {recent.length === 0 && <tr><td colSpan="3">Нет документов</td></tr>}
            </tbody>
        </table>
      </div>
    </Layout>
  );
}

// --- УЛУЧШЕННОЕ УПРАВЛЕНИЕ ДОКУМЕНТАМИ ---
function DocManagement() {
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComm, setNewComm] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => { load(); }, []);
  const load = () => api.get('/documents').then(r => setDocs(r.data));
  
  // Открытие документа
  const open = async (d) => { 
      setActive(d); 
      const r = await api.get(`/comments/${d.id}`); 
      setComments(r.data); 
  };
  
  const del = async (id) => { 
      if(window.confirm('Удалить документ безвозвратно?')) { 
          await api.delete(`/documents/${id}`); 
          setActive(null); 
          load(); 
      }
  };
  
  const sendC = async () => { 
      if(!newComm) return; 
      await api.post('/comments', {doc_id: active.id, text: newComm, username: user.username}); 
      setNewComm(''); 
      const r = await api.get(`/comments/${active.id}`); 
      setComments(r.data); 
  };
  
  const filtered = docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()));

  // СКАЧИВАНИЕ ФАЙЛА (С поддержкой русского)
  const downloadFile = (doc) => {
      const element = document.createElement("a");
      const file = new Blob([doc.content], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      // Если у названия нет расширения, добавляем .txt
      element.download = doc.title.includes('.') ? doc.title : doc.title + ".txt";
      document.body.appendChild(element);
      element.click();
  };

  return (
    <Layout>
      <h1>Управление документами</h1>
      <div style={{display:'flex', gap:'20px', height:'80vh'}}>
        {/* ЛЕВАЯ КОЛОНКА: СПИСОК */}
        <div className="card" style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column'}}>
            <input placeholder="🔍 Поиск..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'10px'}} />
            <table style={{width:'100%'}}>
                <thead><tr><th width="40">ID</th><th>Название</th></tr></thead>
                <tbody>
                    {filtered.map(d => (
                        <tr key={d.id} 
                            onClick={()=>open(d)}
                            style={{
                                cursor:'pointer', 
                                background: active?.id === d.id ? '#eff6ff' : 'transparent',
                                borderLeft: active?.id === d.id ? '4px solid #2563eb' : '4px solid transparent'
                            }}
                        >
                            <td>{d.id}</td>
                            <td style={{fontWeight: active?.id===d.id?'bold':'normal'}}>{d.title}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* ПРАВАЯ КОЛОНКА: ПРОСМОТР */}
        <div className="card" style={{flex:2, overflowY:'auto'}}>
            {active ? (
                <>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <div>
                            <h2 style={{margin:0}}>{active.title}</h2>
                            <p style={{color:'gray', margin:'5px 0 0 0'}}>Автор: {active.author}</p>
                        </div>
                        <div>
                            <button className="btn-sm btn-success" onClick={()=>downloadFile(active)}>Скачать</button>
                            {(user.role==='admin' || user.username===active.author) && 
                                <button className="btn-sm btn-danger" style={{marginLeft:'10px'}} onClick={()=>del(active.id)}>Удалить</button>
                            }
                        </div>
                    </div>
                    
                    <hr style={{margin:'20px 0'}}/>
                    
                    <h4 style={{color:'#64748b', marginTop:0}}>Содержимое (Расшифровано):</h4>
                    <div style={{
                        background:'#f8fafc', 
                        padding:'20px', 
                        borderRadius:'8px', 
                        border:'1px solid #e2e8f0', 
                        whiteSpace:'pre-wrap', 
                        fontFamily:'monospace', 
                        minHeight:'100px',
                        overflowX:'auto'
                    }}>
                        {active.content}
                    </div>
                    
                    <hr style={{margin:'20px 0'}}/>
                    
                    <h3>💬 Комментарии администратора</h3>
                    {comments.length === 0 && <p style={{color:'#94a3b8'}}>Нет комментариев</p>}
                    {comments.map(c => (
                        <div key={c.id} style={{background:'white', border:'1px solid #e2e8f0', padding:'10px', borderRadius:'8px', marginBottom:'10px'}}>
                            <div style={{fontSize:'0.8rem', color:'#64748b', display:'flex', justifyContent:'space-between'}}>
                                <b>{c.admin_name}</b> <span>{c.created_at}</span>
                            </div>
                            <div style={{marginTop:'5px'}}>{c.text}</div>
                        </div>
                    ))}
                    
                    {user.role==='admin' && (
                        <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                            <input value={newComm} onChange={e=>setNewComm(e.target.value)} placeholder="Написать замечание..." style={{margin:0}} />
                            <button onClick={sendC}>Отправить</button>
                        </div>
                    )}
                </>
            ) : (
                <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', flexDirection:'column'}}>
                    <div style={{fontSize:'3rem'}}>📄</div>
                    <p>Выберите документ из списка слева</p>
                </div>
            )}
        </div>
      </div>
    </Layout>
  );
}

function CreateDoc() {
  const [form, setForm] = useState({title:'', content:''});
  const user = JSON.parse(localStorage.getItem('user'));
  const nav = useNavigate();
  const fileRef = useRef(null);

  const sub = async (e) => { 
      e.preventDefault(); 
      await api.post('/documents', {...form, username: user.username}); 
      alert("Файл зашифрован и сохранен!");
      nav('/docs'); 
  };
  
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm(p => ({...p, title: file.name}));
    
    const reader = new FileReader();
    // Всегда читаем как текст (чтобы сохранить в базу)
    // Если это бинарник, то он будет просто "кракозябрами", но шифрование это переживет
    reader.onload = (ev) => setForm(p => ({...p, content: ev.target.result}));
    reader.readAsText(file);
  };

  return (
    <Layout>
      <h1>Загрузка нового документа</h1>
      <div className="card">
        <div className="drop-zone" onClick={()=>fileRef.current.click()}>
            <h3>📂 Нажмите для выбора файла</h3>
            <p>Поддержка: Любые текстовые файлы</p>
            <input type="file" ref={fileRef} style={{display:'none'}} onChange={handleFile} />
        </div>
        <hr/>
        <form onSubmit={sub}>
            <label>Название</label>
            <input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} required />
            <label>Содержание (Текст)</label>
            <textarea rows="10" value={form.content} onChange={e=>setForm({...form, content:e.target.value})} required />
            <button className="btn-success">Зашифровать и Сохранить</button>
        </form>
      </div>
    </Layout>
  );
}

function Audit() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { 
      api.get('/audit').then(r => setLogs(r.data)); 
  }, []);
  
  return (
    <Layout>
      <h1>Журнал Аудита</h1>
      <div className="card">
        <table>
            <thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Детали</th></tr></thead>
            <tbody>
                {logs.map(x=>(
                    <tr key={x.id}>
                        <td style={{fontSize:'0.8rem'}}>{x.created_at}</td>
                        <td><b>{x.username}</b></td>
                        <td><span className="badge bg-blue">{x.action}</span></td>
                        <td>{x.details}</td>
                    </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan="4">Записей нет</td></tr>}
            </tbody>
        </table>
      </div>
    </Layout>
  );
}

// ... Login/Register/AdminUsers ...
function AdminUsers() { const [u,s]=useState([]); useEffect(()=>{api.get('/users').then(r=>s(r.data))},[]); return <Layout><h1>Пользователи</h1><div className="card"><table><thead><tr><th>ID</th><th>Login</th><th>Role</th></tr></thead><tbody>{u.map(x=><tr key={x.id}><td>{x.id}</td><td>{x.username}</td><td>{x.role}</td></tr>)}</tbody></table></div></Layout>; }
function Login() { const [d,s]=useState({username:'',password:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();try{const r=await api.post('/login',d);localStorage.setItem('user',JSON.stringify(r.data.user));nav('/');}catch{alert('Ошибка');}}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Вход</h2><form onSubmit={h}><input onChange={e=>s({...d,username:e.target.value})} placeholder="Login"/><input type="password" onChange={e=>s({...d,password:e.target.value})} placeholder="Pass"/><button>Go</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/register')}>Регистрация</p></div></div>; }
function Register() { const [d,s]=useState({username:'',password:'',full_name:''}); const nav=useNavigate(); const h=async(e)=>{e.preventDefault();await api.post('/register',d);alert('OK');nav('/login');}; return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center',background:'#0f172a'}}><div className="card" style={{width:'300px'}}><h2>Регистрация</h2><form onSubmit={h}><input onChange={e=>s({...d,full_name:e.target.value})} placeholder="Name"/><input onChange={e=>s({...d,username:e.target.value})} placeholder="Login (admin for root)"/><input type="password" onChange={e=>s({...d,password:e.target.value})} placeholder="Pass"/><button>Create</button></form><p style={{textAlign:'center',color:'blue',cursor:'pointer'}} onClick={()=>nav('/login')}>Назад</p></div></div>; }
const Protected = ({children}) => localStorage.getItem('user') ? children : <Login />;
export default function App() { return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/" element={<Protected><Dashboard/></Protected>}/><Route path="/docs" element={<Protected><DocManagement/></Protected>}/><Route path="/create" element={<Protected><CreateDoc/></Protected>}/><Route path="/admin" element={<Protected><AdminUsers/></Protected>}/><Route path="/audit" element={<Protected><Audit/></Protected>}/></Routes></BrowserRouter>; }
