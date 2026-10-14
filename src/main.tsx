import React from 'react';
import { createRoot } from 'react-dom/client';
import CaseStudyBuilder from './app/case-study-builder/CaseStudyBuilder';
import './reset.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><CaseStudyBuilder /></React.StrictMode>);
