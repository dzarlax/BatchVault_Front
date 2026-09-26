import { useEffect, useMemo, useRef, useState } from 'react';
import fetcher from '../utils/fetcher';
import useTranslation from 'next-translate/useTranslation';
import { Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { useAuth, withAuth } from '../utils/authContext';
import { FaUser, FaLock, FaEye, FaEyeSlash, FaShieldAlt, FaCalendarAlt, FaIdCard, FaEnvelope } from 'react-icons/fa';
import StatusBadge from '../components/StatusBadge';
import SelectDropdown from '../components/SelectDropdown';
import { useWorkspace } from '../utils/workspaceContext';
import { useRouter } from 'next/router';

const Profile = () => {
  const { t } = useTranslation('common');
  const { auth } = useAuth();
  const router = useRouter();
  const { selectedWorkspace, selectedWorkspaceId, isWorkspaceReady, updateSelectedWorkspace } = useWorkspace();
  const [currencies, setCurrencies] = useState<Array<{ code: string; name: string }>>([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [currencySuccess, setCurrencySuccess] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [pendingCurrencyWorkspaceId, setPendingCurrencyWorkspaceId] = useState<string | null>(null);
  const [currencyFeedbackWorkspaceId, setCurrencyFeedbackWorkspaceId] = useState<string | null>(null);
  const [currencySavingWorkspaceId, setCurrencySavingWorkspaceId] = useState<string | null>(null);
  const authUserId = auth.user?.id || auth.user?.userID || auth.user?.username || auth.token || null;
  const baseWorkspaceKey = authUserId && selectedWorkspaceId ? `${authUserId}:${selectedWorkspaceId}` : null;
  const selectionStateRef = useRef({ baseKey: baseWorkspaceKey, epoch: 0 });
  if (selectionStateRef.current.baseKey !== baseWorkspaceKey) {
    selectionStateRef.current = { baseKey: baseWorkspaceKey, epoch: selectionStateRef.current.epoch + 1 };
  }
  const selectedWorkspaceKey = baseWorkspaceKey ? `${baseWorkspaceKey}:${selectionStateRef.current.epoch}` : null;
  const selectedWorkspaceKeyRef = useRef(selectedWorkspaceKey);
  selectedWorkspaceKeyRef.current = selectedWorkspaceKey;
  const selectedPendingCurrency = pendingCurrencyWorkspaceId === selectedWorkspaceKey ? pendingCurrency : null;
  const selectedCurrencyError = currencyFeedbackWorkspaceId === selectedWorkspaceKey ? currencyError : null;
  const selectedCurrencySuccess = currencyFeedbackWorkspaceId === selectedWorkspaceKey && currencySuccess;
  const selectedCurrencySaving = selectedWorkspaceKey !== null && currencySavingWorkspaceId === selectedWorkspaceKey;

  useEffect(() => {
    if (!auth.isAuthenticated || !isWorkspaceReady) return;
    let active = true;
    const controller = new AbortController();
    setCurrencyLoading(true);
    fetcher('/api/currencies', { signal: controller.signal }).then((data) => {
      if (active) setCurrencies(Array.isArray(data) ? data : []);
    }).catch((err: any) => {
      if (active) {
        setCurrencyError(err?.message || t('requestFailed'));
        setCurrencyFeedbackWorkspaceId(selectedWorkspaceKeyRef.current);
      }
    }).finally(() => { if (active) setCurrencyLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [auth.isAuthenticated, authUserId, isWorkspaceReady]);

  useEffect(() => {
    setPendingCurrency(null);
    setPendingCurrencyWorkspaceId(null);
    setCurrencyError(null);
    setCurrencySuccess(false);
    setCurrencyFeedbackWorkspaceId(null);
  }, [selectedWorkspaceKey]);

  const currencyOptions = useMemo(() => {
    const locale = router.locale === 'rs' ? 'sr-RS' : (router.locale || 'en');
    let names: Intl.DisplayNames | null = null;
    try { names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([locale], { type: 'currency' }) : null; } catch { names = null; }
    const optionFor = (code: string, name: string, isDisabled = false) => {
      let localized = '';
      try { localized = names?.of(code) || ''; } catch { /* unsupported code */ }
      return { value: code, label: `${code} — ${localized && localized !== code ? localized : (name || code)}`, isDisabled };
    };
    const currentCode = selectedWorkspace?.currency;
    if (!currentCode) return currencies.map(({ code, name }) => optionFor(code, name));
    const current = currencies.find(({ code }) => code === currentCode);
    return [
      optionFor(currentCode, current?.name || currentCode, !current),
      ...currencies.filter(({ code }) => code !== currentCode).map(({ code, name }) => optionFor(code, name)),
    ];
  }, [currencies, router.locale, selectedWorkspace?.currency]);

  const handleCurrencySave = async () => {
    if (!selectedWorkspace || !selectedWorkspaceId || !selectedWorkspaceKey || !selectedPendingCurrency) return;
    if (typeof window !== 'undefined' && !window.confirm(t('currencyChangeConfirmation'))) return;
    setCurrencyError(null);
    setCurrencySuccess(false);
    setCurrencyFeedbackWorkspaceId(selectedWorkspaceKey);
    setCurrencySavingWorkspaceId(selectedWorkspaceKey);
    try {
      const updated = await fetcher('/api/workspaces/current', {
        method: 'PATCH',
        headers: { 'X-Workspace-ID': selectedWorkspaceId },
        body: JSON.stringify({ currency: selectedPendingCurrency }),
        ignoreForbiddenAuthError: true,
      });
      if (selectedWorkspaceKeyRef.current !== selectedWorkspaceKey) return;
      updateSelectedWorkspace(updated);
      setPendingCurrency(null);
      setPendingCurrencyWorkspaceId(null);
      setCurrencySuccess(true);
      setCurrencyFeedbackWorkspaceId(selectedWorkspaceKey);
    } catch (err: any) {
      if (selectedWorkspaceKeyRef.current !== selectedWorkspaceKey) return;
      const serverMessage = String(err?.message || '');
      if (/disabled|not enabled|feature flag/i.test(serverMessage)) {
        setCurrencyError(t('currencyFeatureDisabled'));
      } else if (err?.status === 403) {
        setCurrencyError(t('currencyOwnerOnly'));
      } else {
        setCurrencyError(serverMessage || t('requestFailed'));
      }
      setCurrencyFeedbackWorkspaceId(selectedWorkspaceKey);
    } finally {
      if (selectedWorkspaceKeyRef.current === selectedWorkspaceKey) setCurrencySavingWorkspaceId(null);
    }
  };
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Состояния для показа/скрытия паролей
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Проверка на совпадение нового пароля и подтверждения пароля
    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }

    setIsLoading(true);
    try {
      await fetcher('/api/profile/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setSuccess(t('passwordChangedSuccessfully'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.message || t('requestFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const getUserDisplayName = () => {
    if (auth.user?.name) return auth.user.name;
    if (auth.user?.email) return auth.user.email;
    if (auth.user?.username) return auth.user.username;
    return t('user');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return t('unknown');
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaUser className="text-primary" />
            {t('profile')}
          </h1>
          <p className="page-subtitle">{t('profileDescription')}</p>
        </div>
      </div>

      {/* Profile Content */}
      <div className="profile-grid">
        {selectedWorkspace && (
          <div className="profile-card">
            <div className="profile-card-header"><h5 className="profile-card-title">{t('workspaceCurrency')}</h5></div>
            <div className="profile-card-body">
              <p className="fw-semibold">{selectedWorkspace.name}</p>
              <p>{t('workspaceCurrencyExplanation')}</p>
              {selectedWorkspace.role === 'owner' ? <><SelectDropdown
                label={t('currencyLabel')}
                options={currencyOptions}
                value={currencyOptions.find((option) => option.value === (selectedPendingCurrency || selectedWorkspace.currency)) || null}
                onChange={(option: { value: string } | null) => { setPendingCurrency(option?.value || null); setPendingCurrencyWorkspaceId(selectedWorkspaceKey); setCurrencySuccess(false); setCurrencyFeedbackWorkspaceId(selectedWorkspaceKey); }}
                isSearchable
                isClearable={false}
                isLoading={currencyLoading}
                isDisabled={currencyLoading || selectedCurrencySaving || !isWorkspaceReady}
                placeholder={isWorkspaceReady ? (selectedWorkspace.currency || 'RSD') : `${t('loading')}...`}
              />
              <Button className="mt-3" onClick={handleCurrencySave} disabled={!selectedPendingCurrency || selectedPendingCurrency === selectedWorkspace.currency || selectedCurrencySaving}>
                {selectedCurrencySaving ? t('saving') : t('saveCurrency')}
              </Button>
              {selectedCurrencyError && <Alert variant="danger" className="mt-3">{selectedCurrencyError}</Alert>}
              {selectedCurrencySuccess && <Alert variant="success" className="mt-3">{t('currencySaved')}</Alert>}
              </> : <div className="info-value">{isWorkspaceReady ? (selectedWorkspace.currency || 'RSD') : `${t('loading')}...`}</div>}
            </div>
          </div>
        )}
        {/* Account Info Card */}
        <div className="profile-card">
          <div className="profile-card-header">
            <h5 className="profile-card-title">
              <FaIdCard className="me-2" />
              {t('accountInfo')}
            </h5>
          </div>
          <div className="profile-card-body">
            <div className="profile-info-item">
              <div className="info-label">
                <FaUser className="me-2" />
                {t('displayName')}
              </div>
              <div className="info-value">{getUserDisplayName()}</div>
            </div>

            {auth.user?.email && (
              <div className="profile-info-item">
                <div className="info-label">
                  <FaEnvelope className="me-2" />
                  {t('email')}
                </div>
                <div className="info-value">{auth.user.email}</div>
              </div>
            )}

            <div className="profile-info-item">
              <div className="info-label">
                <FaShieldAlt className="me-2" />
                {t('accountStatus')}
              </div>
              <div className="info-value">
                <StatusBadge status={t('active')} variant="success" />
              </div>
            </div>

            {auth.user?.created_at && (
              <div className="profile-info-item">
                <div className="info-label">
                  <FaCalendarAlt className="me-2" />
                  {t('memberSince')}
                </div>
                <div className="info-value">{formatDate(auth.user.created_at)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="profile-card profile-card-large">
          <div className="profile-card-header">
            <h5 className="profile-card-title">
              <FaLock className="me-2" />
              {t('changePassword')}
            </h5>
          </div>
          <div className="profile-card-body">
            <Form onSubmit={handleSubmit}>
              <div className="profile-form">
                <Form.Group controlId="currentPassword">
                  <Form.Label>
                    <FaLock className="me-2 text-primary" />
                    {t('currentPassword')} <span className="text-error">*</span>
                  </Form.Label>
                  <InputGroup className="profile-password-group">
                    <InputGroup.Text>
                      <FaLock />
                    </InputGroup.Text>
                    <Form.Control
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('enterCurrentPassword')}
                      required
                    />
                    <Button
                      variant="outline-secondary"
                      className="profile-password-toggle"
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <FaEyeSlash /> : <FaEye />}
                    </Button>
                  </InputGroup>
                </Form.Group>

                <div className="form-row">
                  <Form.Group controlId="newPassword">
                    <Form.Label>
                      <FaLock className="me-2 text-primary" />
                      {t('newPassword')} <span className="text-error">*</span>
                    </Form.Label>
                    <InputGroup className="profile-password-group">
                      <InputGroup.Text>
                        <FaLock />
                      </InputGroup.Text>
                      <Form.Control
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('enterNewPassword')}
                        minLength={8}
                        required
                      />
                      <Button
                        variant="outline-secondary"
                        className="profile-password-toggle"
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <FaEyeSlash /> : <FaEye />}
                      </Button>
                    </InputGroup>
                    <Form.Text className="text-tertiary">
                      {t('passwordMinLength')}
                    </Form.Text>
                  </Form.Group>

                  <Form.Group controlId="confirmPassword">
                    <Form.Label>
                      <FaLock className="me-2 text-primary" />
                      {t('confirmPassword')} <span className="text-error">*</span>
                    </Form.Label>
                    <InputGroup className="profile-password-group">
                      <InputGroup.Text>
                        <FaLock />
                      </InputGroup.Text>
                      <Form.Control
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('confirmNewPassword')}
                        required
                      />
                      <Button
                        variant="outline-secondary"
                        className="profile-password-toggle"
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                      </Button>
                    </InputGroup>
                  </Form.Group>
                </div>

                {error && (
                  <Alert variant="danger" className="mt-3">
                    <strong>{t('error')}:</strong> {error}
                  </Alert>
                )}

                {success && (
                  <Alert variant="success" className="mt-3">
                    <strong>{t('success')}!</strong> {success}
                  </Alert>
                )}

                <Button
                  variant="primary"
                  type="submit"
                  disabled={isLoading}
                  className="submit-button"
                >
                  {isLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      {t('loading')}...
                    </>
                  ) : (
                    <>
                      <FaLock className="me-2" />
                      {t('changePassword')}
                    </>
                  )}
                </Button>
              </div>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default withAuth(Profile);
