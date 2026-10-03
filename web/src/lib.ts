import { useEffect, useState, type RefObject } from 'react';

export function assertCond(condition: boolean, msg?: string): asserts condition {
  if (!condition) {throw new Error(msg ?? "Assertion Failed");}
};

// A date and time as people here read them, in their locale and time zone ("Oct 1, 2026, 9:27 PM")
export const formatDateTime = (iso: string): string => (
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
);

// An element's width in rem, kept up to date as it resizes (0 until it's
// laid out)
export const useWidthInRem = (ref: RefObject<HTMLElement | null>): number => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return undefined;
    }
    else {
      const rem      = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const observer = new ResizeObserver(([entry]) => {
        setWidth((entry?.contentRect.width ?? 0) / rem);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [ref]);

  return width;
};

export const range = (numOfEls: number): number[] => (
  Array.from({ length: numOfEls }, (_, n) => n)
);

// Sets the page's title (document.title) while the component is shown, putting back the one
// before it after; leaves it be while title is null (still loading)
export const useDocumentTitle = (title: string | null): void => {
  useEffect(() => {
    if (title === null) {
      return undefined;
    }
    else {
      const before   = document.title;
      document.title = title;
      return () => {
        document.title = before;
      };
    }
  }, [title]);
};
