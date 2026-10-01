// The admin panel at /tl-admin: a sign-in form, then the dashboard of the import queue. Signing
// in sets an HttpOnly session cookie (see core/admin_auth.ts in the API).
import { createElement as __, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { match, P } from 'ts-pattern'
import { adminLogin, adminLogout, ApiError, type AdminDashboard } from '../api'
import { adminDashboardQuery, adminSessionQuery } from '../queries'
import { STATUS_LABELS } from '../core/queued_books'
import { Header } from '../components/header'
import './admin.scss'

export default function AdminPage() {
  const session = useQuery(adminSessionQuery());

  return (
    __('main', {className: 'admin'},
      __(Header, {}),
      __('section', {className: 'page-body'},
        match(session)
          .with({status: 'pending'}, () => __('p', {className: 'muted'}, 'Loading'))
          .with({status: 'error', error: P.when((e) => e instanceof ApiError && e.status === 503)}, () => (
            __('p', {className: 'muted'},
              'The admin panel is closed: set ADMIN_USERNAME and ADMIN_PASSWORD in the API\'s .env.'
            )
          ))
          .with({status: 'error'}, (s) => __('p', {className: 'error'}, "Couldn't reach the API: ", s.error.message))
          .with({data: {signedIn: true}}, () => __(Dashboard, {}))
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

function Dashboard() {
  const queryClient = useQueryClient();
  const dashboard   = useQuery(adminDashboardQuery());

  const logout = useMutation({
    mutationFn: adminLogout,
    onSuccess:  () => queryClient.invalidateQueries({queryKey: ['admin']}),
  });

  return (
    __('div', {className: 'admin-dashboard'},
      __('div', {className: 'admin-title-row'},
        __('h1', {}, 'Import queue'),
        __('button', {type: 'button', onClick: () => logout.mutate(), disabled: logout.isPending}, 'Sign out')
      ),
      match(dashboard)
        .with({status: 'pending'}, () => __('p', {className: 'muted'}, 'Loading'))
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
