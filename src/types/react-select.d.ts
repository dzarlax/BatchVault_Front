declare module 'react-select' {
  import { ComponentType } from 'react';

  export interface OptionType {
    label: string;
    value: any;
  }

  export interface GroupType {
    label: string;
    options: OptionType[];
  }

  export type OptionsType = OptionType[] | GroupType[];

  export interface SelectProps {
    id?: string;
    className?: string;
    classNamePrefix?: string;
    isDisabled?: boolean;
    isLoading?: boolean;
    isClearable?: boolean;
    isSearchable?: boolean;
    isMulti?: boolean;
    name?: string;
    placeholder?: string;
    value?: any;
    defaultValue?: any;
    options: OptionsType;
    onChange?: (value: any, action: any) => void;
    onInputChange?: (newValue: string, actionMeta: any) => void;
    onMenuOpen?: () => void;
    onMenuClose?: () => void;
    onBlur?: (event: any) => void;
    onFocus?: (event: any) => void;
    filterOption?: (option: OptionType, rawInput: string) => boolean;
    formatGroupLabel?: (group: GroupType) => any;
    formatOptionLabel?: (option: OptionType, labelMeta: any) => any;
    getOptionLabel?: (option: OptionType) => string;
    getOptionValue?: (option: OptionType) => string;
    isOptionDisabled?: (option: OptionType) => boolean;
    components?: any;
    inputValue?: string;
    menuIsOpen?: boolean;
    styles?: any;
    theme?: any;
    closeMenuOnSelect?: boolean;
    blurInputOnSelect?: boolean;
    captureMenuScroll?: boolean;
    menuPlacement?: 'auto' | 'bottom' | 'top';
    menuPosition?: 'absolute' | 'fixed';
    menuPortalTarget?: HTMLElement;
    menuShouldBlockScroll?: boolean;
    menuShouldScrollIntoView?: boolean;
    minMenuHeight?: number;
    maxMenuHeight?: number;
    noOptionsMessage?: (obj: { inputValue: string }) => string | null;
    loadingMessage?: (obj: { inputValue: string }) => string | null;
    tabIndex?: number;
    tabSelectsValue?: boolean;
    backspaceRemovesValue?: boolean;
    clearable?: boolean;
    deleteRemoves?: boolean;
    escapeClearsValue?: boolean;
    valueComponent?: ComponentType<any>;
    arrowRenderer?: ComponentType<any>;
    clearRenderer?: ComponentType<any>;
    menuRenderer?: ComponentType<any>;
    optionComponent?: ComponentType<any>;
    valueRenderer?: ComponentType<any>;
    menuContainerStyle?: any;
    menuStyle?: any;
    optionStyle?: any;
    valueContainerStyle?: any;
  }

  export const components: { Input: ComponentType<any> };

  export type SingleValue<OptionType> = OptionType | null;

  const Select: ComponentType<SelectProps>;
  export default Select;
}
