import type { HTMLAttributes } from 'react';

/*
  The studio's iPhone mockup (iPhone 18 with the Dynamic Island), drawn from a real device image.
  The screen sits under the frame, so screenshots and recordings show through it like a real phone.
  Frameless device mode hides the frame and keeps just the rounded screen.
*/
export const IPHONE_FRAME = `${import.meta.env.BASE_URL}mockups/iphone-18.webp`;

export function IPhone({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`csb-iphone ${className}`} {...rest}>
    <div className="csb-iphone-screen">{children}</div>
    <img className="csb-iphone-frame" src={IPHONE_FRAME} alt="" aria-hidden="true" draggable={false} />
  </div>;
}
