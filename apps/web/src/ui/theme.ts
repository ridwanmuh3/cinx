import type { GlobalThemeOverrides } from 'naive-ui';
import type { Theme } from '@/stores/theme';

/** Naive UI palette tuned to the CinX "Showtime Board" world: matte panels,
 *  amber single-action, phosphor-green live-only, 0 radius, glow-not-shadow. */
export function themeOverrides(theme: Theme): GlobalThemeOverrides {
  const dark = theme === 'dark';
  const common = dark
    ? {
        primaryColor: '#FFB52E',
        primaryColorHover: '#FFC75E',
        primaryColorPressed: '#D18F1B',
        primaryColorSuppl: '#FFC75E',
        successColor: '#5AFF9A',
        infoColor: '#5AFF9A',
        warningColor: '#FFB52E',
        errorColor: '#FF5D5D',
        borderRadius: '0px',
        borderRadiusSmall: '0px',
        fontFamily: "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontFamilyMono: "'DotGothic16', 'Courier New', monospace",
        textColorBase: '#ECE9E1',
        textColor1: '#ECE9E1',
        textColor2: '#A6A29A',
        textColor3: 'rgba(236, 233, 225, 0.35)',
        bodyColor: '#08080A',
        cardColor: '#0E0E12',
        modalColor: '#15151B',
        popoverColor: '#15151B',
        tableColor: '#0E0E12',
        tableHeaderColor: '#15151B',
        inputColor: 'rgba(0, 0, 0, 0.28)',
        inputColorDisabled: 'rgba(0, 0, 0, 0.18)',
        placeholderColor: 'rgba(166, 162, 154, 0.6)',
        borderColor: 'rgba(236, 233, 225, 0.14)',
        dividerColor: 'rgba(236, 233, 225, 0.07)',
        actionColor: '#15151B',
      }
    : {
        primaryColor: '#9A6F00',
        primaryColorHover: '#B07F00',
        primaryColorPressed: '#6F5200',
        primaryColorSuppl: '#F0A500',
        successColor: '#0E8A4C',
        infoColor: '#0E8A4C',
        warningColor: '#9A6F00',
        errorColor: '#C2311F',
        borderRadius: '0px',
        borderRadiusSmall: '0px',
        fontFamily: "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontFamilyMono: "'DotGothic16', 'Courier New', monospace",
        textColorBase: '#1D1A12',
        textColor1: '#1D1A12',
        textColor2: '#5D5748',
        textColor3: 'rgba(29, 26, 18, 0.48)',
        bodyColor: '#F6F1E8',
        cardColor: '#FFFDF9',
        modalColor: '#FFFFFF',
        popoverColor: '#FFFFFF',
        tableColor: '#FFFDF9',
        tableHeaderColor: '#FFFFFF',
        inputColor: 'rgba(0, 0, 0, 0.04)',
        inputColorDisabled: 'rgba(0, 0, 0, 0.02)',
        placeholderColor: 'rgba(93, 87, 72, 0.65)',
        borderColor: 'rgba(29, 26, 18, 0.16)',
        dividerColor: 'rgba(29, 26, 18, 0.08)',
        actionColor: '#FFFFFF',
      };

  return {
    common,
    Button: dark
      ? {
          textColorPrimary: '#120C00',
          textColorHoverPrimary: '#120C00',
          textColorPressedPrimary: '#120C00',
          colorPrimary: '#FFB52E',
          colorHoverPrimary: '#FFC75E',
          colorPressedPrimary: '#D18F1B',
          borderPrimary: '#FFB52E',
          borderHoverPrimary: '#FFC75E',
          borderPressedPrimary: '#D18F1B',
          fontWeight: '500',
        }
      : {
          textColorPrimary: '#1D1A12',
          textColorHoverPrimary: '#1D1A12',
          textColorPressedPrimary: '#1D1A12',
          colorPrimary: '#F0A500',
          colorHoverPrimary: '#F7B733',
          colorPressedPrimary: '#D18F1B',
          borderPrimary: '#F0A500',
          borderHoverPrimary: '#F7B733',
          borderPressedPrimary: '#D18F1B',
          fontWeight: '500',
        },
    Input: {
      caretColor: dark ? '#FFB52E' : '#9A6F00',
      borderHover: dark ? 'rgba(236, 233, 225, 0.3)' : 'rgba(29, 26, 18, 0.32)',
      borderFocus: dark ? '#FFB52E' : '#9A6F00',
      boxShadowFocus: dark
        ? '0 0 0 1px rgba(255, 181, 46, 0.35)'
        : '0 0 0 1px rgba(154, 111, 0, 0.4)',
    },
    DataTable: {
      thColor: dark ? '#15151B' : '#FFFFFF',
      thTextColor: dark ? '#A6A29A' : '#5D5748',
      thFontWeight: '400',
      tdColor: dark ? '#0E0E12' : '#FFFDF9',
      tdTextColor: dark ? '#ECE9E1' : '#1D1A12',
      borderColor: dark ? 'rgba(236, 233, 225, 0.14)' : 'rgba(29, 26, 18, 0.16)',
      tdBorderColor: dark ? 'rgba(236, 233, 225, 0.07)' : 'rgba(29, 26, 18, 0.08)',
      thPaddingMedium: '10px 12px',
      tdPaddingMedium: '12px 12px',
    },
    Dialog: {
      titleTextColor: dark ? '#ECE9E1' : '#1D1A12',
      textColor: dark ? '#A6A29A' : '#5D5748',
      border: dark ? '1px solid rgba(236, 233, 225, 0.14)' : '1px solid rgba(29, 26, 18, 0.16)',
      borderRadius: '0px',
    },
    Message: {
      borderRadius: '0px',
      color: dark ? '#15151B' : '#FFFFFF',
      textColor: dark ? '#ECE9E1' : '#1D1A12',
    },
    Notification: {
      borderRadius: '0px',
      color: dark ? '#15151B' : '#FFFFFF',
      textColor: dark ? '#ECE9E1' : '#1D1A12',
    },
    Popconfirm: {
      color: dark ? '#15151B' : '#FFFFFF',
      borderRadius: '0px',
    },
    Select: {
      menuColor: dark ? '#15151B' : '#FFFFFF',
      peers: {
        InternalSelection: {
          borderHover: dark ? 'rgba(236, 233, 225, 0.3)' : 'rgba(29, 26, 18, 0.32)',
          borderFocus: dark ? '#FFB52E' : '#9A6F00',
          boxShadowFocus: dark
            ? '0 0 0 1px rgba(255, 181, 46, 0.35)'
            : '0 0 0 1px rgba(154, 111, 0, 0.4)',
          caretColor: dark ? '#FFB52E' : '#9A6F00',
        },
      },
    },
    Spin: {
      color: dark ? '#FFB52E' : '#9A6F00',
    },
    Empty: {
      iconColor: dark ? '#A6A29A' : '#5D5748',
      textColor: dark ? '#A6A29A' : '#5D5748',
    },
  } satisfies GlobalThemeOverrides;
}
