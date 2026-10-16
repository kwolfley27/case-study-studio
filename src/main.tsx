import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './reset.css';

// Participant links (#/r/<study id>) open the research study instead of the studio.
// Every page is loaded on demand, so a visitor reading a case study doesn't download the whole studio.
const CaseStudyBuilder = lazy(() => import('./app/case-study-builder/StudioEntry'));
const ParticipantPage = lazy(() => import('./app/case-study-builder/research/SurveyRunner'));
const PublicPage = lazy(() => import('./app/case-study-builder/PublishedCaseStudy'));
const pub = location.hash.match(/^#\/p\/([a-z0-9-]+)/)?.[1];
const RunPage = lazy(() => import('./app/case-study-builder/research/SessionRunner'));
const run = location.hash.match(/^#\/run\/([a-zA-Z0-9-]+)/)?.[1];
const study = location.hash.match(/^#\/r\/([a-zA-Z0-9-]+)/)?.[1];
const HoldPage = lazy(() => import('./app/case-study-builder/HoldPage'));
const hold = location.hash.match(/^#\/hold\/([a-z0-9-]+)\/([a-zA-Z0-9-]+)\/([a-z0-9]+)(\/p)?/);

createRoot(document.getElementById('root')!).render(<React.StrictMode>{hold ? <Suspense fallback={null}><HoldPage slug={hold[1]} sectionId={hold[2]} code={hold[3]} presenter={!!hold[4]} /></Suspense> : pub ? <Suspense fallback={null}><PublicPage slug={pub} embed={/[?&]embed=1\b/.test(location.hash)} /></Suspense> : run ? <Suspense fallback={null}><RunPage id={run} /></Suspense> : study ? <Suspense fallback={null}><ParticipantPage id={study} /></Suspense> : <Suspense fallback={null}><CaseStudyBuilder /></Suspense>}</React.StrictMode>);
