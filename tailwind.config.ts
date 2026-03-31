import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '1.5rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: [
  				'Helvetica Neue',
  				'Helvetica',
  				'Arial',
  				'sans-serif'
  			],
  			serif: [
  				'Helvetica Neue',
  				'Helvetica',
  				'Arial',
  				'sans-serif'
  			],
  			mono: [
  				'Space Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
		colors: {
			border: 'hsl(var(--border))',
			input: 'hsl(var(--input))',
			ring: 'hsl(var(--ring))',
			background: 'hsl(var(--background))',
			foreground: 'hsl(var(--foreground))',
			primary: {
				DEFAULT: 'hsl(var(--primary))',
				foreground: 'hsl(var(--primary-foreground))'
			},
			secondary: {
				DEFAULT: 'hsl(var(--secondary))',
				foreground: 'hsl(var(--secondary-foreground))'
			},
			destructive: {
				DEFAULT: 'hsl(var(--destructive))',
				foreground: 'hsl(var(--destructive-foreground))'
			},
			warning: {
				DEFAULT: 'hsl(var(--warning))',
				foreground: 'hsl(var(--warning-foreground))'
			},
			muted: {
				DEFAULT: 'hsl(var(--muted))',
				foreground: 'hsl(var(--muted-foreground))'
			},
			accent: {
				DEFAULT: 'hsl(var(--accent))',
				foreground: 'hsl(var(--accent-foreground))'
			},
			popover: {
				DEFAULT: 'hsl(var(--popover))',
				foreground: 'hsl(var(--popover-foreground))'
			},
			card: {
				DEFAULT: 'hsl(var(--card))',
				foreground: 'hsl(var(--card-foreground))'
			},
			// Red variants
			'red-hot': 'hsl(var(--red-hot))',
			'red-coral': 'hsl(var(--red-coral))',
			'red-crimson': 'hsl(var(--red-crimson))',
			'red-maroon': 'hsl(var(--red-maroon))',
			'red-rose': 'hsl(var(--red-rose))',
			'red-berry': 'hsl(var(--red-berry))',
			sidebar: {
				DEFAULT: 'hsl(var(--sidebar-background))',
				foreground: 'hsl(var(--sidebar-foreground))',
				primary: 'hsl(var(--sidebar-primary))',
				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
				accent: 'hsl(var(--sidebar-accent))',
				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
				border: 'hsl(var(--sidebar-border))',
				ring: 'hsl(var(--sidebar-ring))'
			},
			'space-card': 'hsl(var(--space-card))',
			'space-card-hover': 'hsl(var(--space-card-hover))',
			'item-card': 'hsl(var(--item-card))',
			'capture-button': 'hsl(var(--capture-button))',
			'capture-button-hover': 'hsl(var(--capture-button-hover))',
			'search-bg': 'hsl(var(--search-bg))'
		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			xl: 'calc(var(--radius) + 4px)',
  			'2xl': 'calc(var(--radius) + 8px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(8px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'fade-out': {
  				from: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				},
  				to: {
  					opacity: '0',
  					transform: 'translateY(8px)'
  				}
  			},
  			'scale-in': {
  				from: {
  					opacity: '0',
  					transform: 'scale(0.95)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'scale(1)'
  				}
  			},
  			'slide-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(100%)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.3s ease-out',
  			'fade-out': 'fade-out 0.3s ease-out',
  			'scale-in': 'scale-in 0.2s ease-out',
  			'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
  		},
  		spacing: {
  			'safe-bottom': 'env(safe-area-inset-bottom)'
  		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
