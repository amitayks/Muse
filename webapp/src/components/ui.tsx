import { useState, type ReactNode } from 'react';
import { useTranslation } from '../i18n';

/** Loading spinner */
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--hint)" strokeWidth="3" strokeDasharray="30 70" strokeLinecap="round" />
    </svg>
  );
}

/** Full-page loading state */
export function PageLoading() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', gap: '12px' }}>
      <Spinner size={32} />
      <span style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)' }}>{t('common.loading')}</span>
    </div>
  );
}

/** Error banner with retry */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 'var(--sp-md)', background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', borderRadius: 'var(--radius-sm)', margin: 'var(--sp-md) 0' }}>
      <p style={{ color: 'var(--destructive)', fontSize: 'var(--text-sm)', marginBottom: onRetry ? '8px' : 0 }}>{message}</p>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  );
}

/** Toast notification */
export function Toast({ message, type = 'info' }: { message: string; type?: 'info' | 'success' | 'error' }) {
  const colors = {
    info: 'var(--btn)',
    success: 'var(--success)',
    error: 'var(--destructive)',
  };
  return (
    <div style={{
      position: 'fixed', bottom: '64px', left: '50%', transform: 'translateX(-50%)',
      background: colors[type], color: '#fff', padding: '10px 20px', borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-sm)', fontWeight: 500, zIndex: 200,
    }}>
      {message}
    </div>
  );
}

/** Confirmation dialog */
export function ConfirmDialog({
  open, title, message, confirmText, confirmStyle = 'danger', onConfirm, onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  confirmStyle?: 'danger' | 'primary' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(91, 112, 131, 0.4)', padding: '24px' }} onClick={onCancel}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-xl)', maxWidth: '320px', width: '100%', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        {title && <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--sp-sm)' }}>{title}</h3>}
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--hint)', marginBottom: 'var(--sp-lg)' }}>{message}</p>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onCancel}>{t('common.cancel')}</button>
          <button className={`btn btn-${confirmStyle}`} onClick={onConfirm}>{confirmText || t('common.confirm')}</button>
        </div>
      </div>
    </div>
  );
}

/** Toggle switch */
export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      <span className="toggle-slider" />
    </label>
  );
}

/** Status badge */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`status.${status}`) || status;
  return <span className={`badge badge-${status}`}>{label}</span>;
}

/** Empty state */
export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: '4px' }}>{title}</h3>
      {description && <p style={{ color: 'var(--hint)', fontSize: 'var(--text-sm)', marginBottom: '16px' }}>{description}</p>}
      {action}
    </div>
  );
}

/** Simple hook for toast display */
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const show = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };
  const element = toast ? <Toast message={toast.message} type={toast.type} /> : null;
  return { show, element };
}
