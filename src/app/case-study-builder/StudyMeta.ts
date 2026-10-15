import { createContext } from 'react';
/* Facts about the whole case study that a section sometimes needs (e.g. the page address for "Hold it"). */
export const StudyMeta = createContext<{ slug?: string; published?: boolean; title?: string }>({});
