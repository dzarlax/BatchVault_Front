import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { IconType } from 'react-icons';
import { FaSearch, FaTimes, FaChevronDown } from 'react-icons/fa';
import useTranslation from 'next-translate/useTranslation';

type FilterBarProps = {
  children: React.ReactNode;
  className?: string;
  mobileCollapsible?: boolean;
  activeCount?: number;
  summary?: string;
  onClear?: () => void;
};

type FilterFieldProps = {
  label?: string;
  children: React.ReactNode;
  className?: string;
  grow?: boolean;
};

type SearchFilterProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  icon?: IconType;
};

type FilterChipOption = {
  value: string;
  label: string;
  icon?: IconType;
};

type FilterChipGroupProps = {
  label: string;
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
};

type ClearFiltersButtonProps = {
  label: string;
  onClick: () => void;
  visible?: boolean;
  reserveSpace?: boolean;
  className?: string;
};

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  className = '',
  mobileCollapsible = false,
  activeCount = 0,
  summary,
  onClear,
}) => {
  const { t } = useTranslation('common');
  const generatedId = useId();
  const controlsId = `filter-controls-${generatedId}`;
  const [expanded, setExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 991.98px)');
    const update = () => {
      setIsMobile(media.matches);
      if (!initialized.current) {
        initialized.current = true;
        if (media.matches && mobileCollapsible) setExpanded(false);
      }
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mobileCollapsible]);

  const collapsible = mobileCollapsible && isMobile;
  const isExpanded = !collapsible || expanded;

  return (
    <section className={`filter-bar unified-filter-bar ${mobileCollapsible ? 'filter-disclosure' : ''} ${className}`.trim()}>
      {mobileCollapsible && (
        <div className="filter-disclosure-header">
          {collapsible ? <Button
            type="button"
            variant="link"
            className="filter-disclosure-toggle"
            aria-expanded={isExpanded}
            aria-controls={controlsId}
            onClick={() => setExpanded((current) => !current)}
          >
            <span>{t('filters')}</span>
            <FaChevronDown aria-hidden="true" className={isExpanded ? 'filter-chevron is-open' : 'filter-chevron'} />
            {activeCount > 0 && (
              <span className="filter-active-count" aria-label={t('uiActiveFilterCount', { count: activeCount })}>
                {activeCount}
              </span>
            )}
            {summary && <span className="filter-disclosure-summary">{summary}</span>}
          </Button> : <div className="filter-disclosure-label">
            <span>{t('filters')}</span>
            {activeCount > 0 && <span className="filter-active-count" aria-label={t('uiActiveFilterCount', { count: activeCount })}>{activeCount}</span>}
            {summary && <span className="filter-disclosure-summary">{summary}</span>}
          </div>}
          {onClear && activeCount > 0 && (
            <Button type="button" variant="link" className="filter-disclosure-clear" onClick={onClear}>
              <FaTimes aria-hidden="true" /> {t('clear')}
            </Button>
          )}
        </div>
      )}
      {mobileCollapsible ? (
        <div id={controlsId} className="filter-disclosure-content" hidden={!isExpanded}>
          {children}
        </div>
      ) : children}
    </section>
  );
};

export const FilterField: React.FC<FilterFieldProps> = ({
  label,
  children,
  className = '',
  grow = false,
}) => (
  <div className={`filter-group unified-filter-field ${grow ? 'is-grow' : ''} ${className}`.trim()}>
    {label && <label className="filter-label">{label}</label>}
    {children}
  </div>
);

export const SearchFilter: React.FC<SearchFilterProps> = ({
  label,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  icon: Icon = FaSearch,
}) => (
  <FilterField label={label} className={`search-filter ${className}`.trim()} grow>
    <InputGroup className="filter-input-group">
      <InputGroup.Text>
        <Icon className="text-secondary" />
      </InputGroup.Text>
      <Form.Control
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel || label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-control filter-control"
      />
    </InputGroup>
  </FilterField>
);

export const FilterChipGroup: React.FC<FilterChipGroupProps> = ({
  label,
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}) => (
  <FilterField label={label} className={`chip-filter ${className}`.trim()}>
    <div className="filter-chip-row" role="group" aria-label={ariaLabel || label}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            className={`filter-chip ${value === option.value ? 'is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon className="me-1" />}
            {option.label}
          </button>
        );
      })}
    </div>
  </FilterField>
);

export const ClearFiltersButton: React.FC<ClearFiltersButtonProps> = ({
  label,
  onClick,
  visible = true,
  reserveSpace = true,
  className = '',
}) => (
  <Button
    variant="outline-secondary"
    size="sm"
    onClick={onClick}
    className={`filter-clear-button ms-auto ${reserveSpace && !visible ? 'is-hidden' : ''} ${className}`.trim()}
    disabled={!visible}
    aria-hidden={!visible}
  >
    <FaTimes className="me-2" />
    {label}
  </Button>
);
