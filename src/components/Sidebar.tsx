import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTranslation from 'next-translate/useTranslation';
import { Nav } from 'react-bootstrap';
import {
  FaHome,
  FaClipboardList,
  FaLeaf,
  FaTag,
  FaUsers,
  FaBoxOpen,
  FaShoppingCart,
  FaUser,
  FaTimes,
  FaMoon,
  FaSun,
  FaSignOutAlt,
  FaGlobe,
  FaIndustry,
  FaStore,
  FaBriefcase,
  FaFire
} from 'react-icons/fa';
import { useAuth } from '../utils/authContext';
import { useWorkspace } from '../utils/workspaceContext';
import SelectDropdown from './SelectDropdown';

const ThemeToggle: React.FC = () => {
  const { t } = useTranslation('common');
  const [theme, setTheme] = useState<string>('light');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') || 'light';
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      className="sidebar-theme-btn"
      aria-label={theme === 'light' ? t('darkMode') : t('lightMode')}
    >
      <span className="sidebar-theme-icon">
        {theme === 'light' ? <FaMoon size={15} /> : <FaSun size={15} />}
      </span>
      <span>{theme === 'light' ? t('darkMode') : t('lightMode')}</span>
    </button>
  );
};

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen = true,
  onClose = () => {},
  isMobile = false
}) => {
  const { t, lang } = useTranslation('common');
  const router = useRouter();
  const { logout } = useAuth();
  const {
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
    isWorkspaceReady,
  } = useWorkspace();

  const isActive = (path: string) => router.pathname === path;

  const handleSignOut = () => {
    if (confirm(t('confirmSignOut') || 'Are you sure you want to sign out?')) {
      logout();
      router.push('/auth/signin');
    }
  };

  const changeLanguage = (lng: string) => {
    const { pathname, asPath, query } = router;
    router.push({ pathname, query }, asPath, { locale: lng });
  };

  const sidebarClass = isMobile
    ? `mobile-nav ${isOpen ? 'open' : ''}`
    : 'sidebar d-none d-lg-block';

  const navLinks = (
    <>
      <Link href="/" locale={lang} passHref legacyBehavior>
        <Nav.Link
          className={`sidebar-link ${isActive('/') ? 'active' : ''}`}
          onClick={isMobile ? onClose : undefined}
        >
          <FaHome className="sidebar-link-icon" />
          <span>{t('home')}</span>
        </Nav.Link>
      </Link>

      {/* Production Section */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <FaIndustry size={14} />
          <span>{t('production')}</span>
        </div>
        <Link href="/recipes" locale={lang} passHref legacyBehavior>
          <Nav.Link
            className={`sidebar-link ${isActive('/recipes') ? 'active' : ''}`}
            onClick={isMobile ? onClose : undefined}
          >
            <FaClipboardList className="sidebar-link-icon" />
            <span>{t('recipes')}</span>
          </Nav.Link>
        </Link>

        <Link href="/ingredients" locale={lang} passHref legacyBehavior>
          <Nav.Link
            className={`sidebar-link ${isActive('/ingredients') ? 'active' : ''}`}
            onClick={isMobile ? onClose : undefined}
          >
            <FaLeaf className="sidebar-link-icon" />
            <span>{t('ingredients')}</span>
          </Nav.Link>
        </Link>

        {selectedWorkspace?.capabilities?.cooking_v1 === true && <Link href="/cooking" locale={lang} passHref legacyBehavior>
          <Nav.Link className={`sidebar-link ${router.pathname.startsWith('/cooking') ? 'active' : ''}`} onClick={isMobile ? onClose : undefined}>
            <FaFire className="sidebar-link-icon" /><span>{t('cookingTitle')}</span>
          </Nav.Link>
        </Link>}

        <Link href="/prices" locale={lang} passHref legacyBehavior>
          <Nav.Link
            className={`sidebar-link ${isActive('/prices') ? 'active' : ''}`}
            onClick={isMobile ? onClose : undefined}
          >
            <FaTag className="sidebar-link-icon" />
            <span>{t('prices')}</span>
          </Nav.Link>
        </Link>
      </div>

      {/* Commerce Section */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <FaStore size={14} />
          <span>{t('commerce')}</span>
        </div>
        <Link href="/products" locale={lang} passHref legacyBehavior>
          <Nav.Link
            className={`sidebar-link ${isActive('/products') ? 'active' : ''}`}
            onClick={isMobile ? onClose : undefined}
          >
            <FaBoxOpen className="sidebar-link-icon" />
            <span>{t('products')}</span>
          </Nav.Link>
        </Link>

        <Link href="/orders" locale={lang} passHref legacyBehavior>
          <Nav.Link
            className={`sidebar-link ${isActive('/orders') ? 'active' : ''}`}
            onClick={isMobile ? onClose : undefined}
          >
            <FaShoppingCart className="sidebar-link-icon" />
            <span>{t('orders')}</span>
          </Nav.Link>
        </Link>

        <Link href="/clients" locale={lang} passHref legacyBehavior>
          <Nav.Link
            className={`sidebar-link ${isActive('/clients') ? 'active' : ''}`}
            onClick={isMobile ? onClose : undefined}
          >
            <FaUsers className="sidebar-link-icon" />
            <span>{t('clients')}</span>
          </Nav.Link>
        </Link>
      </div>

      <Link href="/profile" locale={lang} passHref legacyBehavior>
        <Nav.Link
          className={`sidebar-link ${isActive('/profile') ? 'active' : ''}`}
          onClick={isMobile ? onClose : undefined}
        >
          <FaUser className="sidebar-link-icon" />
          <span>{t('profile')}</span>
        </Nav.Link>
      </Link>
    </>
  );

  return (
    <div className={sidebarClass}>
      {isMobile && (
        <div className="mobile-nav-header">
          <div className="d-flex align-items-center">
            <div className="app-logo me-2">
              <img src="/batchvault-icon-64.png" alt="" aria-hidden="true" />
            </div>
            <span className="app-logo-text">BatchVault</span>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label={t('close')}>
            <FaTimes size={16} />
          </button>
        </div>
      )}

      {!isMobile && (
        <div className="sidebar-header">
          <div className="d-flex justify-content-center align-items-center">
            <div className="app-logo me-2">
              <img src="/batchvault-icon-64.png" alt="" aria-hidden="true" />
            </div>
            <span className="app-logo-text">BatchVault</span>
          </div>
        </div>
      )}

      <Nav className="flex-column sidebar-nav">
        {navLinks}
      </Nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-section">
          <div className="sidebar-footer-label">
            <FaMoon size={14} />
            <span>{t('theme')}</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="sidebar-language-selector">
          <div className="sidebar-footer-label">
            <FaGlobe size={14} />
            <span>{t('language')}</span>
          </div>
          <div className="sidebar-language-options">
            <button
              className={`sidebar-lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => changeLanguage('en')}
              title="English"
            >
              <img src="/flags/en.png" alt="EN" width={20} height={14} className="rounded" />
            </button>
            <button
              className={`sidebar-lang-btn ${lang === 'ru' ? 'active' : ''}`}
              onClick={() => changeLanguage('ru')}
              title="Русский"
            >
              <img src="/flags/ru.png" alt="RU" width={20} height={14} className="rounded" />
            </button>
            <button
              className={`sidebar-lang-btn ${lang === 'rs' ? 'active' : ''}`}
              onClick={() => changeLanguage('rs')}
              title="Srpski"
            >
              <img src="/flags/rs.png" alt="RS" width={20} height={14} className="rounded" />
            </button>
          </div>
        </div>

        <div className="sidebar-footer-section">
          <div className="sidebar-footer-label">
            <FaBriefcase size={14} />
            <span>{t('workspace')}</span>
          </div>
          {workspaces.length > 1 ? (
            <SelectDropdown
              value={
                selectedWorkspaceId
                  ? { value: selectedWorkspaceId, label: selectedWorkspace?.name || selectedWorkspaceId }
                  : null
              }
              onChange={(option) => option && setSelectedWorkspaceId(String(option.value))}
              options={workspaces.map((workspace) => ({
                value: String(workspace.id),
                label: workspace.name,
              }))}
              isSearchable={false}
              placeholder={isWorkspaceReady ? t('chooseWorkspace') : t('loading')}
              label=""
              className="sidebar-workspace-select"
            />
          ) : (
            <div className="sidebar-workspace-readonly">
              {selectedWorkspace?.name || (isWorkspaceReady ? t('defaultWorkspace') : t('loading'))}
            </div>
          )}
        </div>

        <div className="sidebar-signout-row">
          <button
            className="sidebar-signout-btn"
            onClick={handleSignOut}
          >
            <FaSignOutAlt size={14} /> {t('signOut')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Sidebar);
