import React, { forwardRef } from 'react';
import Select, { components } from 'react-select';

// Keep the empty active descendant stable between server rendering and Apple browsers.
const StableInput = (props: any) => <components.Input {...props} aria-activedescendant={props['aria-activedescendant'] || ''} />;

export interface SelectDropdownProps {
  label?: string;
  error?: string;
  required?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  helperText?: string;
  loadingMessage?: string;
  noOptionsMessage?: string;
  menuPortalTarget?: HTMLElement | null;
  className?: string;
  classNamePrefix?: string;
  instanceId?: string;
  styles?: any;
  [key: string]: any;
}

const SelectComponent = Select as unknown as React.ForwardRefExoticComponent<any>;

const SelectDropdown = forwardRef<any, SelectDropdownProps>(
  ({
    label,
    error,
    required,
    icon: Icon,
    helperText,
    className,
    classNamePrefix,
    loadingMessage = 'Loading...',
    noOptionsMessage = 'No options',
    menuPortalTarget,
    instanceId,
    ...props
  }, ref) => {
    const generatedInstanceId = React.useId().replace(/:/g, '');
    const controlInputId = props.inputId || `${instanceId || generatedInstanceId}-input`;
    // Default styles to ensure dropdown is always on top
    const defaultStyles = {
      menuPortal: (base: any) => ({
        ...base,
        zIndex: 9999,
      }),
      menu: (base: any) => ({
        ...base,
        zIndex: 9999,
      }),
      menuList: (base: any) => ({
        ...base,
        zIndex: 9999,
      }),
    };

    // Merge with custom styles if provided
    const styles = props.styles
      ? { ...defaultStyles, ...props.styles }
      : defaultStyles;

    return (
      <div className="select-dropdown-wrapper">
        {label && (
          <label className="form-label" htmlFor={controlInputId}>
            {Icon && <Icon className="me-2" />}
            {label}
            {required && <span className="text-error ms-1">*</span>}
          </label>
        )}
        <SelectComponent
          ref={ref}
          className={`react-select-container ${error ? 'is-invalid' : ''} ${className || ''}`}
          classNamePrefix="react-select"
          loadingMessage={() => loadingMessage}
          noOptionsMessage={() => noOptionsMessage}
          instanceId={instanceId || generatedInstanceId}
          menuPortalTarget={menuPortalTarget || (typeof window !== 'undefined' ? document.body : undefined)}
          menuPosition={'fixed'}
          styles={styles}
          {...props}
          inputId={controlInputId}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={error ? `${controlInputId}-error` : props['aria-describedby']}
          components={{ Input: StableInput, ...props.components }}
        />
        {helperText && !error && (
          <small className="form-text text-tertiary">{helperText}</small>
        )}
        {error && (
          <small id={`${controlInputId}-error`} className="form-text text-error">{error}</small>
        )}
      </div>
    );
  }
);

SelectDropdown.displayName = 'SelectDropdown';

export default SelectDropdown;
