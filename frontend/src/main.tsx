import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { useAuth } from './hooks/useAuth';
import LoginPage from './components/LoginPage';
import Dashboard from './pages/Dashboard';

function Root() {
  const { user, loading, error, signIn, signOut } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-500">
      Ładowanie CRM...
    </div>
  );
  if (!user) return <LoginPage onSignIn={signIn} error={error} />;
  return <Dashboard user={user} onSignOut={signOut} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
