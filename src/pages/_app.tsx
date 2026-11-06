import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/design-system.css';
import '../styles/components.css';
import '../styles/batchvault-adapter.css';
import { AppProps } from 'next/app';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Script from 'next/script';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import useTranslation from 'next-translate/useTranslation';
import { Container } from 'react-bootstrap';
import { AuthProvider } from '../utils/authContext';
import { useAuthHandler } from '../utils/useAuthHandler';
import { NotificationProvider } from '../components/NotificationToast';
import { WorkspaceProvider } from '../utils/workspaceContext';

function AppShell({ Component, pageProps }: AppProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  // Use the auth handler hook to manage authentication
  useAuthHandler();

  // Проверяем, является ли текущая страница страницей аутентификации
  const isAuthPage = router.pathname.startsWith('/auth/');

  // Определяем, является ли текущее устройство мобильным
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 992);
    };

    // Инициализация при монтировании
    if (typeof window !== 'undefined') {
      handleResize();
      window.addEventListener('resize', handleResize);
    }

    // Очистка при размонтировании
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);
  
  const content = isAuthPage ? (
    <>
      <Header toggleMobileSidebar={() => setShowMobileSidebar(!showMobileSidebar)} showNavLinks={true} />
      <Container className="py-5">
        <Component {...pageProps} />
      </Container>
    </>
  ) : (
    <>
      <div className="d-flex">
        {!isMobileView && <Sidebar />}
        {isMobileView && (
          <>
            {showMobileSidebar && (
              <button
                type="button"
                className="mobile-nav-backdrop"
                aria-label={t('close')}
                onClick={() => setShowMobileSidebar(false)}
              />
            )}
            <Sidebar
              isOpen={showMobileSidebar}
              onClose={() => setShowMobileSidebar(false)}
              isMobile={true}
            />
            <button
              type="button"
              aria-label={t('uiNavigation')}
              aria-expanded={showMobileSidebar}
              className="mobile-menu-toggle d-lg-none"
              onClick={() => setShowMobileSidebar(!showMobileSidebar)}
              style={{
                position: 'fixed',
                top: '1rem',
                left: '1rem',
                zIndex: 1020,
                background: 'var(--brand-500)',
                color: 'white',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                border: 0
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
              </svg>
            </button>
          </>
        )}
        <div className="flex-grow-1" style={{
          marginLeft: isMobileView ? 0 : '260px',
          backgroundColor: 'var(--surface-secondary)',
          minHeight: '100vh',
          minWidth: 0,
          width: '100%'
        }}>
          <Component {...pageProps} />
        </div>
      </div>
    </>
  );

  const titleKey: Record<string, string> = {
    '/': 'dashboard', '/products': 'products', '/orders': 'orders', '/recipes': 'recipes',
    '/clients': 'clients', '/ingredients': 'ingredients', '/prices': 'prices', '/profile': 'profile',
    '/auth/signin': 'signIn', '/auth/signup': 'signUp',
  };
  const pageTitle = titleKey[router.pathname];
  return <><Head><title>{pageTitle ? `${t(pageTitle)} · BatchVault` : 'BatchVault'}</title></Head>{content}</>;
}

// Component to handle auth logic inside AuthProvider
function AppContent(props: AppProps) {
  // Initialize auth context for SSR
  const initialAuthState = {
    isAuthenticated: false,
    user: null,
    token: null,
  };

  // Wrap everything with AuthProvider and NotificationProvider
  return (
    <AuthProvider initialState={initialAuthState}>
      <WorkspaceProvider>
        <NotificationProvider>
          <Head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          </Head>
          <Script src="/config.js" strategy="beforeInteractive" />
          <AppShell {...props} />
        </NotificationProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

// Main app component wrapper
function MyApp(props: AppProps) {
  return <AppContent {...props} />;
}

export default MyApp;
