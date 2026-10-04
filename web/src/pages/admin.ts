// The admin panel at /tl-admin: a sign-in form, then its tabs: the dashboard
// of the import queue (/tl-admin), the queued books (/tl-admin/queued-books),
// the books (/tl-admin/books), their copyright statuses (/tl-admin/copyright),
// the citations (/tl-admin/citations) and the citation extraction insights
// (/tl-admin/citation-insights). Signing in sets an HttpOnly session cookie
// (see core/admin_auth.ts in the API).
import { createElement as __, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { adminLogin, adminLogout, ApiError, type AdminDashboard, type CitationInsights } from '../api'
import { adminCitationInsightsQuery, adminDashboardQuery, adminSessionQuery } from '../queries'
import { STATUS_LABELS } from '../core/queued_books'
import { Header } from '../components/header'
import { AdminCitations } from '../components/admin_citations'
import { AdminBooks } from '../components/admin_books'
import { AdminQueuedBooks } from '../components/admin_queued_books'
import { AdminCopyright } from '../components/admin_copyright'
import './admin.scss'
import { LoadingSpinner } from '../components/loading_spinner'

export default function AdminPage() {
  const session = useQuery(adminSessionQuery());

  return (
    __('main', {className: 'admin'},
      __(Header, {}),
      __('section', {className: 'page-body'},
        match(session)
          .with({status: 'pending'}, () => __(LoadingSpinner, {}))
          .with({status: 'error', error: P.when((e) => e instanceof ApiError && e.status === 503)}, () => (
            __('p', {className: 'muted'},
              'The admin panel is closed: set ADMIN_USERNAME and ADMIN_PASSWORD in the API\'s .env.'
            )
          ))
          .with({status: 'error'}, (s) => __('p', {className: 'error'}, "Couldn't reach the API: ", s.error.message))
          .with({data: {signedIn: true}}, () => __(AdminTabs, {}))
          .otherwise(() => __(SignIn, {}))
      )
    )
  );
}

function SignIn() {
  const queryClient             = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => adminLogin(username, password),
    onSuccess:  () => queryClient.invalidateQueries({queryKey: ['admin']}),
  });

  return (
    __('form', {
      className: 'admin-sign-in',
      onSubmit:  (e: React.FormEvent) => {
        e.preventDefault();
        login.mutate();
      },
    },
      __('h1', {}, 'Admin'),
      __('label', {},
        'Username',
        __('input', {
          name:         'username',
          autoComplete: 'username',
          value:        username,
          onChange:     (e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value),
        })
      ),
      __('label', {},
        'Password',
        __('input', {
          name:         'password',
          type:         'password',
          autoComplete: 'current-password',
          value:        password,
          onChange:     (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
        })
      ),
      login.isError && __('p', {className: 'error'}, login.error.message),
      __('button', {type: 'submit', disabled: login.isPending}, login.isPending ? 'Signing in' : 'Sign in')
    )
  );
}

// The tabs, a tab's content below them; paths relative to /tl-admin
const TABS = [
  { path: '', label: 'Dashboard' },
  { path: 'queued-books', label: 'Queued books' },
  { path: 'books', label: 'Books' },
  { path: 'copyright', label: 'Copyright' },
  { path: 'citations', label: 'Citations' },
  { path: 'citation-insights', label: 'Citation insights' },
];

function AdminTabs() {
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: adminLogout,
    onSuccess:  () => queryClient.invalidateQueries({queryKey: ['admin']}),
  });

  return (
    __('div', {className: 'admin-panel'},
      __('nav', {className: 'admin-tabs'},
        TABS.map((tab) => (
          __(NavLink, {
            key:       tab.path,
            to:        '/tl-admin' + (tab.path.length > 0 ? '/' + tab.path : ''),
            end:       true,
            className: ({isActive}: {isActive: boolean}) => 'admin-tab' + (isActive ? ' active' : ''),
          }, tab.label)
        )),
        __('div', {className: 'spacer'}),
        __('button', {type: 'button', onClick: () => logout.mutate(), disabled: logout.isPending}, 'Sign out')
      ),
      __(Routes, {},
        __(Route, {index: true, element: __(Dashboard)}),
        __(Route, {path: 'queued-books', element: __(AdminQueuedBooks)}),
        __(Route, {path: 'books', element: __(AdminBooks)}),
        __(Route, {path: 'copyright', element: __(AdminCopyright)}),
        __(Route, {path: 'citations', element: __(AdminCitations)}),
        __(Route, {path: 'citation-insights', element: __(CitationInsightsTab)}),
        __(Route, {path: '*', element: __('p', {className: 'muted'}, 'No such tab.')}),
      )
    )
  );
}

function Dashboard() {
  const dashboard = useQuery(adminDashboardQuery());

  return (
    __('div', {className: 'admin-dashboard'},
      __('h1', {}, 'Import queue'),
      match(dashboard)
        .with({status: 'pending'}, () => __(LoadingSpinner, {}))
        .with({status: 'error'}, (d) => __('p', {className: 'error'}, "Couldn't load the dashboard: ", d.error.message))
        .otherwise((d) => __(DashboardSections, {dashboard: d.data}))
    )
  );
}

function DashboardSections({dashboard}: {dashboard: AdminDashboard}) {
  return (
    __('div', {className: 'admin-sections'},
      __('section', {className: 'admin-section'},
        __('h2', {}, 'Books by status'),
        __('ul', {className: 'status-counts'},
          dashboard.statusCounts.map(({status, count}) => (
            __('li', {key: status, className: count === 0 ? 'empty' : ''},
              __('span', {className: 'status-count'}, count.toLocaleString()),
              __('span', {className: 'status-label'}, STATUS_LABELS[status]),
              __('code', {className: 'status-name'}, status)
            )
          ))
        )
      ),
      __('section', {className: 'admin-section'},
        __('h2', {}, 'Next up for OCR'),
        dashboard.nextUp.length === 0
          ? __('p', {className: 'muted'}, 'No books are queued.')
          : __('ol', {className: 'next-up'},
            dashboard.nextUp.map((book) => (
              __('li', {key: book.id},
                __('span', {className: 'queue-id'}, '#', book.id),
                __('div', {className: 'queued-book'},
                  book.archiveUrl
                    ? __('a', {href: book.archiveUrl, target: '_blank', rel: 'noreferrer'}, __('cite', {}, book.title))
                    : __('cite', {}, book.title),
                  book.author && __('span', {className: 'muted'}, book.author)
                )
              )
            ))
          )
      )
    )
  );
}

function CitationInsightsTab() {
  const insights = useQuery(adminCitationInsightsQuery());

  return (
    __('div', {className: 'admin-citation-insights'},
      __('h1', {}, 'Citation insights'),
      match(insights)
        .with({status: 'pending'}, () => __(LoadingSpinner, {}))
        .with({status: 'error'}, (i) => __('p', {className: 'error'}, "Couldn't load the insights: ", i.error.message))
        .otherwise((i) => __(InsightList, {insights: i.data}))
    )
  );
}

// Scores: 1 for citations seen in a wide number of texts, 5 for very obscure ones
const scoreLabel = (score: number | null) => (score === null ? 'unscored' : String(score));

function InsightList({insights}: {insights: CitationInsights}) {
  const given = insights.insights.filter((i) => i.givenToModel).length;

  return (
    __('div', {className: 'admin-section'},
      __('p', {className: 'muted'},
        `${ insights.insights.length } insights, scored 1 (seen in a wide number of texts) to 5 (very `
          + `obscure). The ${ given } scored ${ insights.maxPromptScore } or less, or not scored yet, `
          + 'are given the model when extracting citations.'
      ),
      insights.insights.length === 0
        ? __('p', {className: 'muted'}, 'No insights yet.')
        : __('ul', {className: 'insight-list'},
          insights.insights.map((i) => (
            __('li', {key: i.id, className: i.givenToModel ? 'given' : 'not-given'},
              __('span', {
                className: 'insight-score' + (i.score === null ? ' unscored' : ''),
                title:     i.givenToModel ? 'given the model' : 'not given the model',
              }, scoreLabel(i.score)),
              __('span', {className: 'insight-text'}, i.insight)
            )
          ))
        )
    )
  );
}
