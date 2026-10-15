import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({plugins:[react()],base:'/case-study-studio/',build:{emptyOutDir:false}});
