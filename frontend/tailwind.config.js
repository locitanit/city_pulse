/** @type {import('tailwindcss').Config} */
// Design tokenek a design/ui-template/EsemenyNaptar.dc.html sablonból.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0D9DB5', // --primary
          dark: '#0B7285',    // linkszín a sablonban
          darker: '#0A5F6E',  // link hover
          soft: '#EAF7F9',    // világos teal háttér (gomb hover)
          border: '#BFE0E6',  // teal szegély (outline gombok)
        },
        accent: '#F2762B',    // --accent (CTA gombok)
        ink: '#1A2B32',       // alap szövegszín
        body: '#44555C',      // kártyaleírás
        steel: '#33565E',     // inaktív pill szöveg
        muted: '#5B6B72',     // másodlagos szöveg
        subtle: '#7C8B91',    // halvány címkék
        line: '#E3EAEC',      // kártyaszegély
        'line-strong': '#CFE3E7', // input szegély
        'line-soft': '#ECF1F2',   // elválasztók
        page: '#EDF1F2',      // oldal háttér
        foot: '#FAFCFC',      // lábléc háttér
      },
      borderRadius: {
        card: '14px', // --radius
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 12px 32px rgba(16,42,50,0.08)',
        'card-hover': '0 16px 36px rgba(16,42,50,0.12)',
        badge: '0 4px 12px rgba(16,42,50,0.15)',
        cta: '0 8px 18px rgba(242,118,43,0.35)',
      },
    },
  },
  plugins: [],
};
