import { createElement as __, useEffect, useState } from 'react'
import { match, P } from 'ts-pattern';
import { fetchPageInsights, type PageInsights } from '../api';
import './page_insights.scss';
import { Sparkles } from 'lucide-react';

type Loaded = {
  key: string,
  insights: PageInsights | null
} | {
  key: string,
  error: string
};

export const PageInsightsSummary = ({ bookId, pageId }: { bookId: string, pageId: number }) => {
  const [isShowingSummary, setIsShowingSummary] = useState<boolean>(false);
  
  const key               = bookId + '\u0000' + pageId;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let current = true;

    fetchPageInsights(bookId, pageId).then((insights) => {
      if (current) {
        setLoaded({ key, insights });
      }
    }).catch((e: Error) => {
      if (current) {
        setLoaded({ key, error: e.message });
      }
    });
    
    return () => current = false;
  }, [isShowingSummary, bookId, pageId]);

  const result = loaded?.key === key ? loaded : null;

  return match([isShowingSummary, result])
    .with([false, P.any], () => (
      __('section', { className: 'page-insights' },
        __('p', { className: 'muted' },
          __('a', {
            className: 'summary-link',
            href: 'javascript:void(0);',
            onClick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              setIsShowingSummary(true);
            }
          },
            __(Sparkles, {}), 'Summarize citations'
          )
        )
      )
    ))
    .with([true, null], () => (
      __('section', { className: 'page-insights loading' },
        __('p', { className: 'muted' }, 'Summarizing the books that cite this page…')
      )
    ))
    .with([true, { error: P.string }], () => (
      __('section', { className: 'page-insights' },
        __('p', { className: 'muted' }, "Couldn't load a summary of what other authors say.")
      )
    ))
    .with([true, { insights: null }], () => null)
    .with([true, { insights: P.nonNullable }], ([_, { insights }]) => (
      __('section', { className: 'page-insights' },
        __('h2', { className: 'overview' }, "Summary"),
        __('p', { className: 'overview' }, insights.overview)
      )
    ))
    .exhaustive();
};
