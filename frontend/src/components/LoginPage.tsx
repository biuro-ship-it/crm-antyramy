interface Props {
  onSignIn: () => void;
  error: string | null;
}

export default function LoginPage({ onSignIn, error }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="card-padded text-center w-full max-w-sm shadow-soft">
        <img src="/icona.png" alt="CRM Antyramy Logo" className="h-12 w-12 mx-auto mb-4" />
        <p className="eyebrow mb-2">Antyramy CRM</p>
        <h1 className="text-headline mb-2">CRM Antyramy</h1>
        <p className="text-body-sm font-light mb-8">Zaloguj się, aby kontynuować</p>

        {error && <div className="alert-error mb-4 text-left">{error}</div>}

        <button onClick={onSignIn} className="btn-primary w-full">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h13.2c-.6 3-2.3 5.5-4.8 7.2v6h7.7c4.5-4.2 7.4-10.3 7.4-17.2z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.2-8.2 2.2-6.3 0-11.6-4.3-13.5-10h-8v6.2C6.9 42.9 14.9 48 24 48z"/>
            <path fill="#FBBC05" d="M10.5 28.4c-.5-1.4-.8-2.8-.8-4.4s.3-3 .8-4.4v-6.2h-8C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.6l8-6.2z"/>
            <path fill="#EA4335" d="M24 9.6c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.9 0 6.9 5.1 2.5 13.4l8 6.2C12.4 13.9 17.7 9.6 24 9.6z"/>
          </svg>
          Zaloguj przez Google
        </button>
      </div>
    </div>
  );
}
