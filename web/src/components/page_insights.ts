import { createElement as __, useState } from 'react'
import { match, P } from 'ts-pattern';
import { useQuery } from '@tanstack/react-query';
import { type PageInsights } from '../api';
import { pageInsightsQuery } from '../queries';
import './page_insights.scss';
import { Sparkles } from 'lucide-react';

type Loaded = { insights: PageInsights | null } | { error: string };

export const PageInsightsSummary = ({ bookId, pageId }: { bookId: string, pageId: number }) => {
  const [isShowingSummary, setIsShowingSummary] = useState<boolean>(false);
  
  // asked for only once the summary is shown: each costs an OpenRouter request
  const insights       = useQuery({ ...pageInsightsQuery(bookId, pageId), enabled: isShowingSummary });
  const result: Loaded | null = match(insights)
    .with({ status: 'error' }, (q) => ({ error: q.error.message }))
    .with({ status: 'success' }, (q) => ({ insights: q.data }))
    .otherwise(() => null);

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
