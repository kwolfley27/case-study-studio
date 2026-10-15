import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import CaseStudyBuilder from './app/case-study-builder/CaseStudyBuilder';
import './reset.css';

// Participant links (#/r/<study id>) open the research study instead of the studio.
const ParticipantPage = lazy(() => import('./app/case-study-builder/research/SurveyRunner'));
const RunPage = lazy(() => import('./app/case-study-builder/research/SessionRunner'));
const run = location.hash.match(/^#\/run\/([a-zA-Z0-9-]+)/)?.[1];
const study = location.hash.match(/^#\/r\/([a-zA-Z0-9-]+)/)?.[1];

createRoot(document.getElementById('root')!).render(<React.StrictMode>{run ? <Suspense fallback={null}><RunPage id={run} /></Suspense> : study ? <Suspense fallback={null}><ParticipantPage id={study} /></Suspense> : <CaseStudyBuilder />}</React.StrictMode>);
