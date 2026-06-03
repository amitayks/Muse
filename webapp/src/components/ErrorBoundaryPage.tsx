import { useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { getInitData, isInTelegram } from '../lib/telegram';

export function ErrorBoundaryPage() {
  const error = useRouteError();
  const hasInitData = !!getInitData();
  const inTg = isInTelegram();

  let message = 'Unknown error';
  let stack = '';
  if (error instanceof Error) {
    message = error.message;
    stack = error.stack || '';
  } else if (typeof error === 'object' && error !== null) {
    message = JSON.stringify(error);
  } else {
    message = String(error);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '24px', textAlign: 'center', background: '#000', color: '#e7e9ea',
    }}>
      <AlertTriangle size={40} style={{ color: '#71767b', marginBottom: '16px' }} />
      <h1 style={{ fontSize: '17px', marginBottom: '8px' }}>Something went wrong</h1>
      <p style={{ color: '#71767b', fontSize: '13px', marginBottom: '8px', wordBreak: 'break-all' }}>{message}</p>
      <p style={{ color: '#71767b', fontSize: '11px', marginBottom: '8px' }}>
        Telegram: {inTg ? 'yes' : 'no'} | initData: {hasInitData ? 'present' : 'missing'}
      </p>
      {stack && (
        <pre style={{ color: '#71767b', fontSize: '10px', marginBottom: '16px', textAlign: 'left', maxWidth: '100%', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {stack}
        </pre>
      )}
      <button
        style={{ background: '#1d9bf0', color: '#fff', border: 'none', borderRadius: '9999px', padding: '8px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  );
}
