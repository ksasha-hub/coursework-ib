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
        <div className="brand">🛡️ SecureDocs</div>
        <div className="nav-item" style={{cursor:'default', background:'none', paddingLeft:0}}>👋 {user?.full_name}</div>
        <div className="nav-divider"></div>
        <div className={`nav-item ${loc.pathname === '/' ? 'active' : ''}`} onClick={()=>nav('/')}>📊 Главная</div>
        <div className={`nav-item ${loc.pathname === '/docs' ? 'active' : ''}`} onClick={()=>nav('/docs')}>📁 Документы</div>
        <div className={`nav-item ${loc.pathname === '/create' ? 'active' : ''}`} onClick={()=>nav('/create')}>➕ Создать</div>
        {user?.role === 'admin' && (
          <>
            <div className="nav-divider"></div>
            <div className={`nav-item ${loc.pathname === '/admin' ? 'active' : ''}`} onClick={()=>nav('/admin')}>👥 Пользователи</div>
            <div className={`nav-item ${loc.pathname === '/audit' ? 'active' : ''}`} onClick={()=>nav('/audit')}>👁️ Аудит</div>
          </>
        )}
        <div style={{marginTop:'auto'}}>
          <button className="btn-danger" style={{width:'100%'}} onClick={logout}>Выход</button>
        </div>
      </div>
      <div className="main-content">{children}</div>
    </div>
  );
};

// --- PDF GENERATOR ---
const generatePDF = (doc, action) => {
    const pdf = new jsPDF();
    
    // Header
    pdf.setFontSize(22);
    pdf.setTextColor(40);
    pdf.text("ОТЧЕТ ПО БЕЗОПАСНОСТИ", 20, 20);
    
    pdf.setFontSize(12);
    pdf.text(`Документ ID: #${doc.id}`, 20, 30);
    pdf.text(`Автор: ${doc.author}`, 20, 36);
    pdf.text(`Дата выгрузки: ${new Date().toLocaleString()}`, 20, 42);
    
    pdf.setLineWidth(0.5);
    pdf.line(20, 45, 190, 45);
    
    // Content
    pdf.setFontSize(16);
    pdf.text(doc.title, 20, 55);
    
    pdf.setFontSize(12);
    pdf.setFont("courier");
    const splitText = pdf.splitTextToSize(doc.content, 170);
    pdf.text(splitText, 20, 65);
    
    // Footer
    pdf.setFont("helvetica");
    pdf.setFontSize(10);
    pdf.setTextColor(150);
    pdf.text("Сформировано системой SecureDocs IB", 20, 280);

    if (action === 'download') {
        pdf.save(`Doc_${doc.id}_${doc.title}.pdf`);
    } else {
        window.open(pdf.output('bloburl'), '_blank');
    }
};

// --- PAGES ---

function Dashboard() {
  const [users, setUsers] = useState([]);
  const [recentDocs, setRecentDocs] = useState([]);
  
  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data));
    api.get('/documents').then(res => setRecentDocs(res.data.slice(-5).reverse())); 
  }, []);

  return (
    <Layout>
      <h1>Главная панель</h1>
      <div className="stats-grid">
        <div className="stat-card">
           <div className="stat-val">{recentDocs.length}</div>
           <div className="stat-label">Документов в базе</div>
        </div>
        <div className="stat-card">
           <div className="stat-val">{users.length}</div>
           <div className="stat-label">Пользователей</div>
        </div>
      </div>

      <div className="card">
        <h3>🕰️ Последние документы</h3>
        <table>
          <thead><tr><th>ID</th><th>Название</th><th>Автор</th></tr></thead>
          <tbody>
            {recentDocs.map(d => (
              <tr key={d.id}><td>#{d.id}</td><td><b>{d.title}</b></td><td>{d.author}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

function DocManagement() {
  const [docs, setDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null); // Для просмотра и комментов
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => { load(); }, []);
  const load = () => api.get('/documents').then(res => setDocs(res.data));

  const openDoc = async (doc) => {
    setActiveDoc(doc);
    const res = await api.get(`/comments/${doc.id}`);
    setComments(res.data);
  };

  const sendComment = async () => {
    if(!newComment) return;
    await api.post('/comments', { doc_id: activeDoc.id, text: newComment, username: user.username });
    setNewComment('');
    const res = await api.get(`/comments/${activeDoc.id}`);
    setComments(res.data);
  };

  return (
    <Layout>
      <h1>Документы и Отчеты</h1>
      <div style={{display:'flex', gap:'20px'}}>
        <div className="card" style={{flex:1}}>
            <h3>Список файлов</h3>
            <table>
            <thead><tr><th>ID</th><th>Название</th><th>Действия</th></tr></thead>
            <tbody>
                {docs.map(d => (
                <tr key={d.id} style={{background: activeDoc?.id === d.id ? '#eff6ff' : 'white'}}>
                    <td>#{d.id}</td>
                    <td onClick={()=>openDoc(d)} style={{cursor:'pointer', color:'#2563eb', fontWeight:'bold'}}>{d.title}</td>
                    <td>
                        <button className="btn-sm" onClick={()=>openDoc(d)}>Открыть</button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>

        {activeDoc && (
            <div className="card" style={{flex:1, borderLeft:'4px solid #2563eb'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'start'}}>
                    <h2>{activeDoc.title}</h2>
                    <div style={{display:'flex', gap:'5px'}}>
                        <button className="btn-sm" onClick={()=>generatePDF(activeDoc, 'view')}>👁️ Просмотр</button>
                        <button className="btn-sm btn-success" onClick={()=>generatePDF(activeDoc, 'download')}>⬇️ Скачать PDF</button>
                    </div>
                </div>
                <p style={{fontSize:'0.8rem', color:'gray'}}>Автор: {activeDoc.author}</p>
                <div style={{background:'#f8fafc', padding:'10px', borderRadius:'8px', fontFamily:'monospace', maxHeight:'200px', overflowY:'auto'}}>
                    {activeDoc.content}
                </div>

                <hr style={{margin:'20px 0'}} />
                
                <h3>💬 Комментарии администратора</h3>
                <div style={{maxHeight:'200px', overflowY:'auto', marginBottom:'15px'}}>
                    {comments.map(c => (
                        <div key={c.id} style={{background:'#fff', border:'1px solid #e2e8f0', padding:'10px', borderRadius:'8px', marginBottom:'8px'}}>
                            <div style={{fontSize:'0.8rem', color:'#64748b', display:'flex', justifyContent:'space-between'}}>
                                <b>{c.admin_name}</b> <span>{c.created_at}</span>
                            </div>
                            <div>{c.text}</div>
                        </div>
                    ))}
                    {comments.length === 0 && <p style={{color:'gray'}}>Нет комментариев</p>}
                </div>

                {user.role === 'admin' && (
                    <div style={{display:'flex', gap:'5px'}}>
                        <input value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Написать замечание..." style={{margin:0}} />
                        <button onClick={sendComment}>Отправить</button>
                    </div>
                )}
            </div>
        )}
      </div>
    </Layout>
  );
}

// ... Простые компоненты (CreateDoc, Audit, Users, Login, Register) ...
function CreateDoc() {
  const [form, setForm] = useState({ title: '', content: '' });
  const user = JSON.parse(localStorage.getItem('user'));
  const nav = useNavigate();
  const fileInputRef = useRef(null);
  const handleSubmit = async (e) => { e.preventDefault(); await api.post('/documents', { ...form, username: user.username }); nav('/docs'); };
  const handleFileUpload = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => { setForm(prev => ({ ...prev, content: ev.target.result, title: file.name })); }; reader.readAsText(file); };
  return ( <Layout><h1>Создать документ</h1><div className="card"><div className="drop-zone" onClick={()=>fileInputRef.current.click()}><h3>📂 Загрузить файл</h3><input type="file" ref={fileInputRef} style={{display:'none'}} onChange={handleFileUpload} /></div><hr/><form onSubmit={handleSubmit}><input value={form.title} onChange={e=>setForm({...form, title: e.target.value})} placeholder="Название" /><textarea rows="10" value={form.content} onChange={e=>setForm({...form, content: e.target.value})} placeholder="Текст..." /><button className="btn-success">Сохранить</button></form></div></Layout> );
}
function Audit() { const [logs, setLogs] = useState([]); useEffect(() => { api.get('/audit').then(res => setLogs(res.data)); }, []); return ( <Layout><h1>Аудит</h1><div className="card"><table><thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Детали</th></tr></thead><tbody>{logs.map(l => (<tr key={l.id}><td>{l.created_at}</td><td>{l.username}</td><td><span className="badge bg-blue">{l.action}</span></td><td>{l.details}</td></tr>))}</tbody></table></div></Layout> ); }
function AdminUsers() { const [users, setUsers] = useState([]); useEffect(() => { api.get('/users').then(res => setUsers(res.data)); }, []); return ( <Layout><h1>Пользователи</h1><div className="card"><table><thead><tr><th>ID</th><th>Логин</th><th>Роль</th><th>Создан</th></tr></thead><tbody>{users.map(u => (<tr key={u.id}><td>{u.id}</td><td>{u.username}</td><td><span className={`badge ${u.role==='admin'?'bg-red':'bg-green'}`}>{u.role}</span></td><td>{u.created_at}</td></tr>))}</tbody></table></div></Layout> ); }
function Login() { const [d, sD] = useState({username:'', password:''}); const nav = useNavigate(); const h = async (e) => { e.preventDefault(); try { const res = await api.post('/login', d); localStorage.setItem('user', JSON.stringify(res.data.user)); nav('/'); } catch { alert('Ошибка'); } }; return (<div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#0f172a'}}><div className="card" style={{width:'350px'}}><h2 style={{textAlign:'center'}}>Вход</h2><form onSubmit={h}><input placeholder="Логин" onChange={e=>sD({...d, username:e.target.value})} /><input type="password" placeholder="Пароль" onChange={e=>sD({...d, password:e.target.value})} /><button style={{width:'100%'}}>Войти</button></form><p style={{textAlign:'center'}}><span style={{color:'blue',cursor:'pointer'}} onClick={()=>nav('/register')}>Регистрация</span></p></div></div>); }
function Register() { const [d, sD] = useState({username:'', password:'', full_name:''}); const nav = useNavigate(); const h = async (e) => { e.preventDefault(); await api.post('/register', d); alert('OK'); nav('/login'); }; return (<div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#0f172a'}}><div className="card" style={{width:'350px'}}><h2 style={{textAlign:'center'}}>Регистрация</h2><form onSubmit={h}><input placeholder="ФИО" onChange={e=>sD({...d, full_name:e.target.value})} /><input placeholder="Логин" onChange={e=>sD({...d, username:e.target.value})} /><input type="password" placeholder="Пароль" onChange={e=>sD({...d, password:e.target.value})} /><button style={{width:'100%'}}>Создать</button></form><p style={{textAlign:'center'}}><span style={{color:'blue',cursor:'pointer'}} onClick={()=>nav('/login')}>Назад</span></p></div></div>); }
const Protected = ({children}) => localStorage.getItem('user') ? children : <Login />;
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/docs" element={<Protected><DocManagement /></Protected>} />
        <Route path="/create" element={<Protected><CreateDoc /></Protected>} />
        <Route path="/admin" element={<Protected><AdminUsers /></Protected>} />
        <Route path="/audit" element={<Protected><Audit /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}
