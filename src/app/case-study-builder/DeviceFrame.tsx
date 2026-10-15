import { useContext } from 'react';
import { EditingContext } from './EditableText';
/*
  Device mockups shared by every hero: laptop, desktop monitor, browser
  window, phone, or none (the image on its own — great for transparent PNGs).
  Until an image is added, a sample app screen shows so the frame is visible.
*/

export type Frame = 'none' | 'laptop' | 'desktop' | 'browser' | 'phone';
export const frameOptions: Array<[Frame, string]> = [['none', 'No frame'], ['laptop', 'MacBook'], ['desktop', 'iMac'], ['browser', 'Browser window'], ['phone', 'iPhone']];

export function SampleScreen({ phone }: { phone?: boolean }) {
  return phone
    ? <div className="csb-dev-sample is-phone" aria-hidden="true"><b /><i /><i /><span /><span /><em /></div>
    : <div className="csb-dev-sample" aria-hidden="true"><div><b /><i /><i /><i /><i /></div><div><b /><p><i /><i /><i /></p><span /><span /><em /></div></div>;
}

export function DeviceFrame({ frame, image, alt, slot, hint }: { frame: Frame; image?: string; alt: string; slot: string; hint?: string }) {
  const screen = (phone?: boolean) => <div className="csb-hx-screen" data-image-slot={slot}>
    {image ? <img src={image} alt={alt} /> : <><SampleScreen phone={phone} />{hint && <span className="csb-dev-hint">{hint}</span>}</>}
  </div>;
  if (frame === 'browser') return <div className="csb-hx-browser"><div className="csb-hx-bar" aria-hidden="true"><i /><i /><i /></div>{screen()}</div>;
  // MacBook: black bezel with a notch, thin aluminium deck with the thumb scoop.
  if (frame === 'laptop') return <div className="csb-hx-laptop is-mac"><div className="csb-hx-lid"><span className="csb-hx-notch" aria-hidden="true" />{screen()}</div><div className="csb-hx-base" aria-hidden="true"><i /></div></div>;
  // iMac: thin white bezel, a coloured chin, and a flat aluminium stand.
  if (frame === 'desktop') return <div className="csb-hx-desktop is-imac"><div className="csb-hx-monitor">{screen()}<span className="csb-hx-chin" aria-hidden="true" /></div><div className="csb-hx-stand" aria-hidden="true" /><div className="csb-hx-foot" aria-hidden="true" /></div>;
  if (frame === 'phone') return <div className="csb-hx-phone"><span className="csb-hx-island" aria-hidden="true" />{screen(true)}</div>;
  return <div className="csb-hx-float" data-image-slot={slot}>{image ? <img src={image} alt={alt} /> : <div className="csb-dev-empty"><SampleScreen />{hint && <span className="csb-dev-hint">{hint}</span>}</div>}</div>;
}

/* On-canvas switch above the hero image (editor only). */
export function HeroFramePicker({ value }: { value: Frame }) {
  const { edit } = useContext(EditingContext);
  if (!edit) return null;
  return <div className="csb-frame-picker" role="group" aria-label="Hero image frame" onClick={e => e.stopPropagation()}>
    <span>Frame</span>
    {frameOptions.map(([frame, label]) => <button key={frame} type="button" aria-pressed={value === frame} onClick={() => edit('heroFrame', frame)}>{frame === 'none' ? 'None' : label.replace(' monitor', '').replace(' window', '')}</button>)}
  </div>;
}
